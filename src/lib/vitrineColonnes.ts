/**
 * Ce qui part vers un visiteur sans compte — et ce qui ne part jamais.
 *
 * Ce fichier ne touche pas la base : c'est ce qui permet aux tests de lire ces
 * listes sans ouvrir de connexion. `vitrine.ts` s'en sert pour construire
 * ses requêtes, et les re-exporte.
 */

/**
 * TOUTES les colonnes de la vue `articles_vitrine`, et rien d'autre.
 *
 * La vue est publique : le site vitrine la lit avec la clé anon. Cette liste
 * est donc celle des colonnes PUBLIQUES, celle qu'un test compare à la
 * migration `app24_vitrine_etiquettes`, où chacune est justifiée une par une.
 * Ajouter une colonne à la vue sans l'ajouter ici — ou l'inverse — fait
 * échouer ce test : c'est voulu. Une colonne publique se décide, elle ne
 * s'ajoute pas au passage.
 */
export const COLONNES_PUBLIQUES_VITRINE = [
  "id",
  "reference",
  "nom",
  "description",
  "categorie",
  "ordre_categorie",
  "marque",
  "prix_vente",
  "unite",
  "photo_path",
  "type_article",
  "delai_fabrication_jours",
  "expediable",
  "poids_grammes",
  "en_stock",
  "date_limite",
  "remise_membre_exclue",
  // Les étiquettes des filtres (APP 24-FILTRES).
  "ages",
  "besoins",
  "tailles_chien",
  "proteines",
  "sans_cereales",
  "monoproteine",
  "taille_article",
  "couleurs",
  "matieres",
  "usages_jouet",
] as const;

/** Les colonnes servies au public, telles qu'on les demande à PostgREST. */
export const COLONNES_VITRINE = COLONNES_PUBLIQUES_VITRINE.join(", ");

/** Ce qui ne doit JAMAIS partir vers un visiteur. Les tests lisent cette liste. */
export const COLONNES_INTERDITES_AU_PUBLIC = [
  "prix_achat",
  "cout_moyen",
  "fournisseur_id",
  "stock_actuel",
  "stock_reserve",
  "stock_disponible",
  "stock_alerte",
  "code_barres",
] as const;
