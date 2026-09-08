import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { COLONNES_VITRINE } from "@/src/lib/vitrineColonnes";
import { publierCeQuiEstDu } from "@/src/lib/publicationArticle";

/**
 * Le catalogue tel qu'un VISITEUR SANS COMPTE peut le voir.
 *
 * Une seule source : la vue `articles_vitrine`. Elle ne porte ni prix d'achat,
 * ni marge, ni fournisseur — ces colonnes n'existent pas dans la vue, donc
 * elles ne peuvent pas fuir par distraction.
 *
 * Le filtrage est dans la REQUÊTE, pas à l'affichage : on nomme les colonnes
 * une par une. `stock_disponible` existe dans la vue pour l'usage interne,
 * mais il n'est jamais demandé ici — un visiteur lit « En stock » ou
 * « Épuisé », pas un compte à rebours.
 */

// Les deux listes vivent dans un module PUR : les tests les lisent sans ouvrir
// de connexion à la base.
export { COLONNES_VITRINE, COLONNES_INTERDITES_AU_PUBLIC } from "@/src/lib/vitrineColonnes";

export type ArticleVitrine = {
  id: string;
  reference: string;
  nom: string;
  description: string | null;
  categorie: string;
  ordre_categorie: number | null;
  marque: string | null;
  prix_vente: number | string;
  unite: string;
  photo_path: string | null;
  type_article: string;
  delai_fabrication_jours: number | null;
  expediable: boolean | null;
  poids_grammes: number | null;
  /** La disponibilité EN MOTS se déduit d'ici : vrai ou faux, rien de chiffré. */
  en_stock: boolean;
  /** Anti-gaspillage : « À écouler avant le 12 octobre ». */
  date_limite: string | null;
  remise_membre_exclue: boolean;
};

/** Le catalogue public, rangé par catégorie puis par nom. */
export async function catalogueVitrine(): Promise<ArticleVitrine[]> {
  // Les brouillons dont la date est arrivée basculent AVANT la lecture. La vue
  // refuse déjà de servir un article dont la date n'est pas passée : ce rattrapage
  // met le statut à jour, il ne décide pas de ce qui se voit.
  await publierCeQuiEstDu();
  const { data } = await supabaseAdmin
    .from("articles_vitrine")
    .select(COLONNES_VITRINE)
    .order("ordre_categorie")
    .order("nom");
  return (data ?? []) as unknown as ArticleVitrine[];
}

/** Une fiche produit publique. Null si l'article n'est pas (ou plus) en vitrine. */
export async function articleVitrine(id: string): Promise<ArticleVitrine | null> {
  if (!/^[0-9a-f-]{36}$/i.test(String(id ?? "").trim())) return null;
  await publierCeQuiEstDu();
  const { data } = await supabaseAdmin
    .from("articles_vitrine")
    .select(COLONNES_VITRINE)
    .eq("id", id)
    .maybeSingle();
  return (data as unknown as ArticleVitrine | null) ?? null;
}

/**
 * Les articles encore vendables parmi une liste — pour la fusion des paniers
 * et le recalcul des prix. La vitrine décide : ce qui n'y est plus n'est plus
 * proposé, quelle qu'en soit la raison.
 */
export type ArticleVendableVitrine = {
  id: string;
  nom: string;
  prix_vente: number;
  categorie: string;
  type_article: string;
  en_stock: boolean;
  remise_membre_exclue: boolean;
  date_limite: string | null;
};

export async function articlesVendables(ids: string[]): Promise<ArticleVendableVitrine[]> {
  const propres = [...new Set(ids.filter((i) => /^[0-9a-f-]{36}$/i.test(i)))];
  if (propres.length === 0) return [];

  const { data } = await supabaseAdmin
    .from("articles_vitrine")
    .select("id, nom, prix_vente, categorie, type_article, en_stock, remise_membre_exclue, date_limite")
    .in("id", propres);

  return ((data ?? []) as unknown as ArticleVendableVitrine[]).map((a) => ({
    ...a,
    prix_vente: Number(a.prix_vente),
  }));
}
