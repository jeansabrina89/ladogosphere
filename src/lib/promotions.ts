import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { tracerEvenement } from "@/src/lib/journalEvenements";
import { aujourdhuiISO } from "@/src/lib/dates";
import type { Promotion } from "@/src/lib/prixLogique";

/**
 * Les rubriques — couche base.
 *
 * Elle ne décide rien : les règles de saisie sont dans `prixLogique`
 * (`refusPromotion`), et l'arbitrage des remises dans `prixApplicable`. Ici on
 * lit, on écrit, et on trace.
 *
 * Une rubrique passée ne se SUPPRIME pas : elle se désactive et reste
 * consultable. Ce qui a été vendu sous une action doit pouvoir s'expliquer
 * l'année suivante, et une ligne de facture qui renverrait dans le vide n'est
 * pas une explication.
 */

const COLONNES = `
  id, nom, type, pourcentage, date_debut, date_fin, cible, texte, actif, ordre, created_at
`;

export type PromotionComplete = Promotion & {
  created_at: string;
  /** Combien d'articles la rubrique porte. */
  nbArticles: number;
};

/** Toutes les rubriques, la plus récente d'abord. Les passées restent là. */
export async function listerPromotions(): Promise<PromotionComplete[]> {
  const { data } = await supabaseAdmin
    .from("promotions")
    .select(COLONNES)
    .order("date_debut", { ascending: false });

  const promos = ((data ?? []) as unknown as (Promotion & { created_at: string })[]);
  if (promos.length === 0) return [];

  const { data: liens } = await supabaseAdmin
    .from("promotions_articles")
    .select("promotion_id")
    .in("promotion_id", promos.map((p) => p.id));

  const compte = new Map<string, number>();
  for (const l of (liens ?? []) as { promotion_id: string }[]) {
    compte.set(l.promotion_id, (compte.get(l.promotion_id) ?? 0) + 1);
  }

  return promos.map((p) => ({ ...p, nbArticles: compte.get(p.id) ?? 0 }));
}

export async function lirePromotion(id: string): Promise<Promotion | null> {
  if (!/^[0-9a-f-]{36}$/i.test(String(id ?? "").trim())) return null;
  const { data } = await supabaseAdmin
    .from("promotions").select(COLONNES).eq("id", id).maybeSingle();
  return (data as unknown as Promotion | null) ?? null;
}

/** Les identifiants d'articles d'une rubrique. */
export async function articlesDeLaPromotion(promotionId: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("promotions_articles")
    .select("article_id")
    .eq("promotion_id", promotionId);
  return ((data ?? []) as { article_id: string }[]).map((l) => l.article_id);
}

export type ChampsPromotion = {
  nom: string;
  type: string;
  pourcentage: number | null;
  date_debut: string;
  date_fin: string;
  cible: string;
  texte: string | null;
  actif: boolean;
  ordre: number;
};

/**
 * Création ou modification, et la liste d'articles avec.
 *
 * Les liens se réécrivent en entier : `promotions_articles` n'est qu'une
 * jointure, elle ne porte aucune histoire — la remise vendue, elle, est figée
 * sur les lignes de vente et de facture, et rien ici ne la touche.
 */
export async function enregistrerPromotion(
  id: string | null,
  champs: ChampsPromotion,
  articleIds: string[],
  userId: string | null
): Promise<{ id?: string; error?: string }> {
  const propres = [...new Set(articleIds.filter((a) => /^[0-9a-f-]{36}$/i.test(a)))];

  if (id) {
    const avant = await lirePromotion(id);
    const { error } = await supabaseAdmin.from("promotions").update(champs).eq("id", id);
    if (error) return { error: "La rubrique n'a pas pu être enregistrée." };
    await remplacerArticles(id, propres);
    await tracerEvenement({
      entite: "promotion", entiteId: id, evenement: "promotion_modifiee",
      avant: avant ?? undefined, apres: { ...champs, articles: propres.length }, userId,
    });
    return { id };
  }

  const { data, error } = await supabaseAdmin
    .from("promotions")
    .insert({ ...champs, created_by: userId })
    .select("id")
    .single();
  if (error || !data) return { error: "La rubrique n'a pas pu être créée." };

  const nouvelId = data.id as string;
  await remplacerArticles(nouvelId, propres);
  await tracerEvenement({
    entite: "promotion", entiteId: nouvelId, evenement: "promotion_creee",
    apres: { ...champs, articles: propres.length }, userId,
  });
  return { id: nouvelId };
}

async function remplacerArticles(promotionId: string, articleIds: string[]): Promise<void> {
  await supabaseAdmin.from("promotions_articles").delete().eq("promotion_id", promotionId);
  if (articleIds.length === 0) return;
  await supabaseAdmin
    .from("promotions_articles")
    .insert(articleIds.map((article_id) => ({ promotion_id: promotionId, article_id })));
}

/**
 * Désactiver, ou réactiver. Jamais supprimer : une action passée reste
 * consultable, et son nom doit continuer d'exister pour expliquer les tickets
 * qui la portent.
 */
export async function basculerPromotion(
  id: string,
  actif: boolean,
  userId: string | null
): Promise<{ error?: string }> {
  const { error } = await supabaseAdmin.from("promotions").update({ actif }).eq("id", id);
  if (error) return { error: "Le changement n'a pas pu être enregistré." };
  await tracerEvenement({
    entite: "promotion", entiteId: id,
    evenement: actif ? "promotion_reactivee" : "promotion_desactivee",
    apres: { actif }, userId,
  });
  return {};
}

/**
 * Dupliquer une rubrique : mêmes articles, même remise, période à refaire.
 * L'action du mois prochain ressemble à celle de ce mois-ci — mais elle n'est
 * pas la même, et elle ne doit pas hériter de ses dates.
 */
export async function dupliquerPromotion(
  id: string,
  userId: string | null
): Promise<{ id?: string; error?: string }> {
  const source = await lirePromotion(id);
  if (!source) return { error: "Rubrique introuvable." };
  const articles = await articlesDeLaPromotion(id);
  const jour = aujourdhuiISO();

  return enregistrerPromotion(
    null,
    {
      nom: `${source.nom} (copie)`,
      type: String(source.type),
      pourcentage: source.pourcentage === null ? null : Number(source.pourcentage),
      date_debut: jour,
      date_fin: jour,
      cible: String(source.cible),
      texte: source.texte ?? null,
      // Une copie naît INACTIVE : ses dates sont celles du jour, et personne
      // n'a encore dit quand elle devait courir.
      actif: false,
      ordre: Number(source.ordre ?? 0),
    },
    articles,
    userId
  );
}

/** Les articles proposables dans une rubrique : ce qui se vend, avec sa marge. */
export type ArticleChoisissable = {
  id: string;
  nom: string;
  reference: string;
  categorie: string;
  prix_vente: number;
  prix_achat: number | null;
  statut_vitrine: string;
};

export async function articlesChoisissables(): Promise<ArticleChoisissable[]> {
  const { data } = await supabaseAdmin
    .from("articles")
    .select("id, nom, reference, categorie, prix_vente, prix_achat, statut_vitrine")
    .eq("actif", true)
    .eq("composant", false)
    .order("nom");

  return ((data ?? []) as unknown as Record<string, unknown>[]).map((a) => ({
    id: a.id as string,
    nom: a.nom as string,
    reference: a.reference as string,
    categorie: (a.categorie as string) ?? "divers",
    prix_vente: Number(a.prix_vente ?? 0),
    prix_achat: a.prix_achat === null || a.prix_achat === undefined ? null : Number(a.prix_achat),
    statut_vitrine: (a.statut_vitrine as string) ?? "publie",
  }));
}
