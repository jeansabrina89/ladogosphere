import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { aujourdhuiISO } from "@/src/lib/dates";
import {
  prixApplicable,
  type ArticlePrix,
  type ClientPrix,
  type ContextePrixPlat,
  type PrixApplicable,
  type Promotion,
} from "@/src/lib/prixLogique";

/**
 * Le contexte de prix — couche base.
 *
 * Elle ne décide RIEN : elle va chercher les rubriques en cours et la remise
 * membre de chaque catégorie, une fois, puis laisse `prixApplicable` trancher.
 * C'est la seule façon d'avoir un prix unique à la caisse, en ligne, sur la
 * fiche produit et sur la facture — sans quoi chaque écran finirait par
 * recalculer un peu autrement.
 */

const COLONNES_PROMOTION = `
  id, nom, type, pourcentage, date_debut, date_fin, cible, texte, actif, ordre
`;

export type ContextePrix = {
  /** Le jour où l'on se place. Un document émis garde le sien, pour toujours. */
  date: string;
  /** Les rubriques en cours, toutes cibles confondues. */
  promotions: Promotion[];
  /** Les rubriques d'un article, par identifiant d'article. */
  parArticle: Map<string, Promotion[]>;
  /** Le pourcentage de remise membre d'une catégorie. Absente : exclue. */
  remiseParCategorie: Map<string, number>;
};

/**
 * Les rubriques ACTIVES et EN COURS ce jour-là, avec leurs articles, plus la
 * remise membre par catégorie. Une seule paire de requêtes pour tout un écran.
 */
export async function contextePrix(dateISO?: string): Promise<ContextePrix> {
  const date = (dateISO ?? aujourdhuiISO()).slice(0, 10);

  const [{ data: promos }, { data: remises }] = await Promise.all([
    supabaseAdmin
      .from("promotions")
      .select(COLONNES_PROMOTION)
      .eq("actif", true)
      .lte("date_debut", date)
      .gte("date_fin", date)
      .order("ordre"),
    supabaseAdmin
      .from("remise_membre_categories")
      .select("categorie, pourcentage, actif")
      .eq("actif", true),
  ]);

  const promotions = ((promos ?? []) as unknown as Promotion[]);
  const parArticle = new Map<string, Promotion[]>();

  if (promotions.length > 0) {
    const { data: liens } = await supabaseAdmin
      .from("promotions_articles")
      .select("promotion_id, article_id")
      .in("promotion_id", promotions.map((p) => p.id));

    const parId = new Map(promotions.map((p) => [p.id, p]));
    for (const l of (liens ?? []) as { promotion_id: string; article_id: string }[]) {
      const promo = parId.get(l.promotion_id);
      if (!promo) continue;
      const deja = parArticle.get(l.article_id);
      if (deja) deja.push(promo);
      else parArticle.set(l.article_id, [promo]);
    }
  }

  const remiseParCategorie = new Map<string, number>();
  for (const r of (remises ?? []) as { categorie: string; pourcentage: number | string }[]) {
    const p = Number(r.pourcentage);
    // 0 % ou inactive : la catégorie est exclue, et son absence de la carte le dit.
    if (Number.isFinite(p) && p > 0) remiseParCategorie.set(r.categorie, p);
  }

  return { date, promotions, parArticle, remiseParCategorie };
}

/** Le contexte vide : aucune rubrique, aucune remise membre. */
export function contextePrixVide(dateISO?: string): ContextePrix {
  return {
    date: (dateISO ?? aujourdhuiISO()).slice(0, 10),
    promotions: [],
    parArticle: new Map(),
    remiseParCategorie: new Map(),
  };
}

/** Un article, tel que la fonction pure l'attend. */
export function articleAvecPrix(
  ctx: ContextePrix,
  article: {
    id: string;
    prix_vente: number | string;
    categorie?: string | null;
    remise_membre_exclue?: boolean | null;
    date_limite?: string | null;
  }
): ArticlePrix {
  return {
    id: article.id,
    prix_vente: article.prix_vente,
    categorie: article.categorie ?? null,
    remise_membre_exclue: article.remise_membre_exclue ?? false,
    date_limite: article.date_limite ?? null,
    promotions: ctx.parArticle.get(article.id) ?? [],
    remise_membre_pourcent: ctx.remiseParCategorie.get(article.categorie ?? "") ?? 0,
  };
}

/**
 * Le prix d'un article pour une personne. Un raccourci, pas une seconde règle :
 * il appelle `prixApplicable` et rien d'autre.
 */
export function prixDe(
  ctx: ContextePrix,
  article: Parameters<typeof articleAvecPrix>[1],
  client: ClientPrix
): PrixApplicable {
  return prixApplicable({ article: articleAvecPrix(ctx, article), client, date: ctx.date });
}

/** Le même contexte, à plat, pour partir vers le navigateur de la caisse. */
export function aplatirContextePrix(ctx: ContextePrix): ContextePrixPlat {
  const promotionsParArticle: Record<string, Promotion[]> = {};
  for (const [articleId, promos] of ctx.parArticle) promotionsParArticle[articleId] = promos;

  const remiseParCategorie: Record<string, number> = {};
  for (const [categorie, pct] of ctx.remiseParCategorie) remiseParCategorie[categorie] = pct;

  return { date: ctx.date, promotionsParArticle, remiseParCategorie };
}

/** Les articles d'une rubrique, pour l'écran des actions et pour la boutique. */
export async function articlesDePromotion(promotionId: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("promotions_articles")
    .select("article_id")
    .eq("promotion_id", promotionId);
  return ((data ?? []) as { article_id: string }[]).map((l) => l.article_id);
}
