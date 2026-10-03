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
  /**
   * La saveur annoncée sur l'emballage (APP 25-GOÛT).
   *
   * Publique par nature : elle est imprimée en grand sur la face avant du
   * paquet, et c'est elle que le visiteur cherche quand il filtre. À distinguer
   * de `proteines`, qui dit tout ce que contient la recette.
   *
   * En fin de liste parce que la vue l'y a mise : Postgres refuse d'insérer une
   * colonne au milieu d'une vue remplacée. L'ordre ne veut rien dire ici.
   */
  "gouts",
  /**
   * Ce qui s'achète même à stock zéro, et sous quel délai (APP 26).
   *
   * `sur_commande` est le booléen UTILE, pas la case cochée : il vaut vrai
   * seulement si un délai est connu. On ne promet pas un délai qu'on ignore —
   * l'article coché sans délai reste « Épuisé » aux yeux du visiteur.
   *
   * Le NOM du fournisseur, lui, ne sort pas : savoir chez quel grossiste la
   * pension se fournit est une donnée commerciale. Cette liste est la garde qui
   * l'empêche de partir, et `COLONNES_INTERDITES_AU_PUBLIC` la double.
   */
  "sur_commande",
  /**
   * Depuis APP 27, ces deux colonnes ne sortent QUE si l'article est
   * réellement commandable — la vue les met à NULL sinon, par la même
   * condition que `sur_commande`.
   *
   * Avant, un article NON coché chez un fournisseur qui a un délai publiait
   * ce délai. Aucun écran ne l'affichait, mais une vue publique ne porte pas
   * une donnée qui ne sert à rien : deux articles du même fournisseur
   * laissaient deviner qu'ils partagent une source.
   */
  "delai_commande_min_jours",
  "delai_commande_max_jours",
  /**
   * POUR QUI l'article est fait (APP 27) — et non ce qu'il EST, qui reste la
   * catégorie. C'est cette colonne qui range l'article dans un onglet du
   * catalogue : sans elle, il n'y a pas d'onglets.
   *
   * `especes` précise l'animal là où « rongeur » est trop large (un lapin ne
   * mange pas ce qu'un hamster mange), et `types_soin` dit ce que le produit
   * soigne. Les trois sont des étiquettes de FILTRE, comme `ages` ou `gouts` :
   * ce que la cliente coche pour trouver. Rien de commercial n'y passe.
   *
   * En fin de liste parce que la vue les y a mises — Postgres refuse d'insérer
   * une colonne au milieu d'une vue remplacée. L'ordre ne veut rien dire ici.
   */
  "animaux",
  "especes",
  "types_soin",
  /**
   * Ce que le site MET EN AVANT (APP 62) — justifiées une par une dans
   * `app62_coups_de_coeur_offre_vitrine`.
   *
   * `coup_de_coeur` est la sélection choisie par Sabrina ; `nouveaute` dit
   * qu'une rubrique « Nouveautés » pour tous est en cours. Les `offre_*` sont
   * la meilleure Action ou Anti-gaspillage en cours POUR TOUS — jamais une
   * rubrique « membres », qu'un visiteur ne peut pas obtenir — et `offre_prix`
   * est arrondi comme `prixApplicable` l'arrondit, en double : le site ne doit
   * pas afficher un prix que la caisse ne prend pas.
   *
   * `remise_membre_pourcent` est le taux d'adhésion de la catégorie, NULL pour
   * un article exclu ; `cree_le`, la date de mise en rayon.
   *
   * La table `promotions` reste fermée à anon : seules ces valeurs calculées
   * sortent. L'APP, elle, ne les lit pas pour calculer : ses prix viennent de
   * `prixApplicable`, et de nulle part ailleurs.
   */
  "coup_de_coeur",
  "nouveaute",
  "offre_pourcentage",
  "offre_nom",
  "offre_texte",
  "offre_date_fin",
  "offre_prix",
  "remise_membre_pourcent",
  "cree_le",
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
