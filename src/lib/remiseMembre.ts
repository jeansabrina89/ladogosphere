import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { tracerEvenement } from "@/src/lib/journalEvenements";
import { CATEGORIES_ARTICLE } from "@/src/lib/boutiqueLogique";
import {
  POURCENTAGE_PAR_DEFAUT,
  type LigneRemiseCategorie,
} from "@/src/lib/remiseMembreLogique";

/**
 * La remise d'adhésion par catégorie — couche base.
 *
 * Une catégorie absente de la table vaut le régime en vigueur (10 %, active) :
 * la reprise l'a écrite pour les seize catégories du magasin, et une catégorie
 * ajoutée plus tard hérite du même défaut plutôt que de disparaître en silence.
 */

/** Un réglage n'a pas d'identifiant : le journal y met son auteur. */
const UTILISATEUR_INCONNU = "00000000-0000-0000-0000-000000000000";

export async function lireRemisesCategories(): Promise<LigneRemiseCategorie[]> {
  const [{ data: remises }, { data: articles }] = await Promise.all([
    supabaseAdmin.from("remise_membre_categories").select("categorie, pourcentage, actif"),
    supabaseAdmin.from("articles").select("categorie").eq("actif", true).eq("composant", false),
  ]);

  const parCategorie = new Map(
    ((remises ?? []) as { categorie: string; pourcentage: number | string; actif: boolean }[])
      .map((r) => [r.categorie, r])
  );

  const compte = new Map<string, number>();
  for (const a of (articles ?? []) as { categorie: string }[]) {
    compte.set(a.categorie, (compte.get(a.categorie) ?? 0) + 1);
  }

  // L'ordre du MAGASIN, comme partout ailleurs : ni alphabétique, ni celui de
  // la base. C'est CATEGORIES_ARTICLE qui en est la source unique.
  return CATEGORIES_ARTICLE.map((c) => {
    const r = parCategorie.get(c.valeur);
    return {
      categorie: c.valeur,
      pourcentage: r ? Number(r.pourcentage) : POURCENTAGE_PAR_DEFAUT,
      actif: r ? r.actif === true : true,
      nbArticles: compte.get(c.valeur) ?? 0,
    };
  });
}

/**
 * Enregistrer un pourcentage. Il s'applique à partir de MAINTENANT : aucune
 * facture émise ne change, aucun panier validé n'est recalculé. Le journal en
 * garde l'avant et l'après.
 */
export async function enregistrerRemiseCategorie(p: {
  categorie: string;
  pourcentage: number;
  actif: boolean;
  userId: string | null;
}): Promise<{ error?: string }> {
  const { data: avant } = await supabaseAdmin
    .from("remise_membre_categories")
    .select("categorie, pourcentage, actif")
    .eq("categorie", p.categorie)
    .maybeSingle();

  const { error } = await supabaseAdmin
    .from("remise_membre_categories")
    .upsert(
      {
        categorie: p.categorie,
        pourcentage: p.pourcentage,
        actif: p.actif,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "categorie" }
    );
  if (error) return { error: "Le pourcentage n'a pas pu être enregistré." };

  // `entite_id` est un uuid : un réglage n'en a pas. On y met l'auteur, comme
  // le fait déjà le régime de TVA, et la catégorie concernée voyage dans
  // `apres` — c'est elle qu'on relit dans le journal.
  await tracerEvenement({
    entite: "remise_membre",
    entiteId: p.userId ?? UTILISATEUR_INCONNU,
    evenement: "remise_membre_categorie",
    avant: {
      categorie: p.categorie,
      pourcentage: avant ? Number(avant.pourcentage) : POURCENTAGE_PAR_DEFAUT,
      actif: avant ? avant.actif === true : true,
    },
    apres: { categorie: p.categorie, pourcentage: p.pourcentage, actif: p.actif },
    userId: p.userId,
  });

  return {};
}
