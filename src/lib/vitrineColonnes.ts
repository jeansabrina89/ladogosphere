/**
 * Ce qui part vers un visiteur sans compte — et ce qui ne part jamais.
 *
 * Ce fichier ne touche pas la base : c'est ce qui permet aux tests de lire ces
 * deux listes sans ouvrir de connexion. `vitrine.ts` s'en sert pour construire
 * ses requêtes, et les re-exporte.
 */

/** Les colonnes servies au public. La liste est courte, et c'est voulu. */
export const COLONNES_VITRINE = `
  id, reference, nom, description, categorie, ordre_categorie, marque,
  prix_vente, unite, photo_path, type_article, delai_fabrication_jours,
  expediable, poids_grammes, en_stock
`;

/** Ce qui ne doit JAMAIS partir vers un visiteur. Les tests lisent cette liste. */
export const COLONNES_INTERDITES_AU_PUBLIC = [
  "prix_achat",
  "fournisseur_id",
  "stock_actuel",
  "stock_reserve",
  "stock_disponible",
  "stock_alerte",
  "code_barres",
] as const;
