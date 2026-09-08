/**
 * Deux périmètres de stock, un seul jeu d'écrans.
 *
 * Sabrina fabrique une partie de ce qu'elle vend. Ses FOURNITURES — sangle au
 * mètre, boucles, mousquetons, rivets, puces NFC, fil — sont déjà distinguées
 * en base par `articles.composant = true` et comptablement par le compte 4000.
 * Il leur manquait une porte à elles : l'Atelier.
 *
 * Ce module est la seule chose qui sépare les deux mondes. Les écrans sont les
 * mêmes, PARAMÉTRÉS par un périmètre — jamais dupliqués. Une règle écrite deux
 * fois finit par être vraie une fois sur deux.
 *
 * Fonction pure : ni base, ni requête.
 */

export type PerimetreStock = "boutique" | "atelier";

export type NiveauStock = "vente" | "gestion";

/** Le compte de charge des matières de fabrication (APP 12g). */
export const COMPTE_MATIERES_FABRICATION = "4000";
/** Celui des marchandises revendues telles quelles. */
export const COMPTE_MARCHANDISES_REVENDUES = "4200";

/**
 * Tout ce qui change entre les deux écrans. Les libellés sont ÉCRITS, pas
 * fabriqués : « fournitures actives » et « articles actifs » ne s'accordent pas
 * pareil, et une phrase française ne se construit pas par concaténation.
 */
export type ConfigPerimetre = {
  perimetre: PerimetreStock;
  /** La valeur d'`articles.composant` qui appartient à ce périmètre. */
  composant: boolean;
  /** L'accueil de l'espace, où l'on renvoie quand la porte est fermée. */
  accueil: string;
  /** La liste des articles du périmètre. */
  liste: string;
  inventaire: string;
  icone: string;
  titreListe: string;
  colonneNom: string;
  tuileActifs: string;
  libelleRetires: string;
  mentionRetire: string;
  videTitre: string;
  videMessage: string;
  /** « 12 articles affichés » / « 12 fournitures affichées ». */
  affiches: (n: number) => string;
};

export const PERIMETRES: Record<PerimetreStock, ConfigPerimetre> = {
  boutique: {
    perimetre: "boutique",
    composant: false,
    accueil: "/boutique",
    liste: "/boutique/articles",
    inventaire: "/boutique/inventaire",
    icone: "🛒",
    titreListe: "🛒 Articles",
    colonneNom: "Article",
    tuileActifs: "Articles actifs",
    libelleRetires: "Voir les articles retirés",
    mentionRetire: " · retiré de la vente",
    videTitre: "Aucun article",
    videMessage: "Aucun article ne correspond à cette recherche.",
    affiches: (n) => `${n} article${n > 1 ? "s" : ""} affiché${n > 1 ? "s" : ""}`,
  },
  atelier: {
    perimetre: "atelier",
    composant: true,
    accueil: "/atelier",
    liste: "/atelier/fournitures",
    inventaire: "/atelier/inventaire",
    icone: "🧵",
    titreListe: "🧵 Fournitures",
    colonneNom: "Fourniture",
    tuileActifs: "Fournitures actives",
    libelleRetires: "Voir les fournitures retirées",
    mentionRetire: " · retirée",
    videTitre: "Aucune fourniture",
    videMessage: "Aucune fourniture ne correspond à cette recherche.",
    affiches: (n) => `${n} fourniture${n > 1 ? "s" : ""} affichée${n > 1 ? "s" : ""}`,
  },
};

export function configPerimetre(perimetre: PerimetreStock): ConfigPerimetre {
  return PERIMETRES[perimetre];
}

/**
 * Le périmètre d'un article. Un article qui n'a pas de drapeau se vend : c'est
 * l'ancien monde, et il n'a jamais été une fourniture.
 */
export function perimetreDeArticle(
  article: { composant?: boolean | null } | null | undefined
): PerimetreStock {
  return article?.composant === true ? "atelier" : "boutique";
}

/** Cet article a-t-il sa place dans cet écran-là ? */
export function estDuPerimetre(
  article: { composant?: boolean | null } | null | undefined,
  perimetre: PerimetreStock
): boolean {
  return perimetreDeArticle(article) === perimetre;
}

/**
 * Le filtre à appliquer à une liste. Le tri d'origine est conservé : on
 * n'enlève que ce qui n'appartient pas à l'écran.
 */
export function filtrerPerimetre<T extends { composant?: boolean | null }>(
  articles: T[],
  perimetre: PerimetreStock
): T[] {
  return articles.filter((a) => estDuPerimetre(a, perimetre));
}

/**
 * La permission exigée pour agir dans un périmètre.
 *
 * L'atelier n'a qu'un niveau : on y entre ou on n'y entre pas. La boutique en a
 * deux depuis APP 13b, et la gestion y emporte la vente.
 */
export function permissionStock(
  perimetre: PerimetreStock,
  niveau: NiveauStock
): "perm_atelier" | "perm_boutique_vente" | "perm_boutique_gestion" {
  if (perimetre === "atelier") return "perm_atelier";
  return niveau === "gestion" ? "perm_boutique_gestion" : "perm_boutique_vente";
}

/**
 * Décision pure, sans base : cette personne peut-elle agir dans ce périmètre ?
 * Les permissions reçues sont celles déjà normalisées par la garde partagée
 * (l'admin les a toutes, la gestion boutique emporte la vente).
 */
export function accesStockAccorde(
  permissions: Record<string, boolean | undefined> | null | undefined,
  perimetre: PerimetreStock,
  niveau: NiveauStock
): boolean {
  return permissions?.[permissionStock(perimetre, niveau)] === true;
}

/**
 * Le périmètre qu'ouvre une catégorie de dépense.
 *
 * « Matières de fabrication » (4000) entre des fournitures, « Marchandises à
 * revendre » (4200) entre des articles. Toute autre catégorie n'ouvre pas
 * d'entrée en stock du tout.
 */
export function perimetreDuCompte(compte: string | null | undefined): PerimetreStock | null {
  if (compte === COMPTE_MATIERES_FABRICATION) return "atelier";
  if (compte === COMPTE_MARCHANDISES_REVENDUES) return "boutique";
  return null;
}
