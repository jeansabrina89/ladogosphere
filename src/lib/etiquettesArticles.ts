/**
 * Les étiquettes d'un article — le vocabulaire des filtres du catalogue.
 *
 * UN SEUL endroit dit qu'un article étiqueté « geant » s'affiche « Géant ».
 * La base ne stocke que la valeur technique : sans accent, sans majuscule,
 * sans espace. Écrire « Élan » dans une colonne serait condamner le filtre au
 * jour où quelqu'un tape « élan » ou « Elan ».
 *
 * Ce module est PUR : ni base, ni React. Les tests le lisent tel quel, la
 * fiche d'article et le catalogue client s'en servent tous les deux — un
 * libellé écrit en dur ailleurs est un libellé qui finira par diverger.
 *
 * Le vocabulaire est FERMÉ pour tout le monde sauf les couleurs : une
 * contrainte CHECK le tient en base (migration `app24_etiquettes_articles`),
 * et `nettoyerValeurs` le tient à la saisie. Les deux, parce qu'une garde
 * d'écran ne protège pas une écriture faite autrement.
 */

/** Les tableaux à vocabulaire fermé, plus les couleurs, libres. */
export type GroupeEtiquette =
  | "ages"
  | "besoins"
  | "tailles_chien"
  | "proteines"
  | "couleurs"
  | "matieres"
  | "usages_jouet";

export type Valeur = { valeur: string; libelle: string };

type Groupe = {
  /** En-tête de la section, à la fiche comme au panneau de filtres. */
  libelle: string;
  /** L'ordre d'affichage EST celui de ce tableau. Vide : valeurs libres. */
  valeurs: Valeur[];
};

/**
 * Le vocabulaire, et l'ordre dans lequel il se montre.
 *
 * Les âges vont du plus jeune au plus vieux, les tailles du plus petit au
 * plus grand : une liste triée par hasard se relit à chaque fois.
 */
export const GROUPES: Record<GroupeEtiquette, Groupe> = {
  ages: {
    libelle: "Âge",
    valeurs: [
      { valeur: "chiot", libelle: "Chiot" },
      { valeur: "junior", libelle: "Junior" },
      { valeur: "adulte", libelle: "Adulte" },
      { valeur: "senior", libelle: "Senior" },
    ],
  },
  besoins: {
    libelle: "Besoin",
    valeurs: [
      { valeur: "sensible", libelle: "Sensible" },
      { valeur: "light", libelle: "Light" },
      { valeur: "actif", libelle: "Actif" },
    ],
  },
  tailles_chien: {
    libelle: "Taille du chien",
    valeurs: [
      { valeur: "petit", libelle: "Petit" },
      { valeur: "moyen", libelle: "Moyen" },
      { valeur: "grand", libelle: "Grand" },
      { valeur: "geant", libelle: "Géant" },
    ],
  },
  proteines: {
    libelle: "Protéines",
    valeurs: [
      { valeur: "poulet", libelle: "Poulet" },
      { valeur: "dinde", libelle: "Dinde" },
      { valeur: "canard", libelle: "Canard" },
      { valeur: "boeuf", libelle: "Bœuf" },
      { valeur: "veau", libelle: "Veau" },
      { valeur: "porc", libelle: "Porc" },
      { valeur: "agneau", libelle: "Agneau" },
      { valeur: "gibier", libelle: "Gibier" },
      { valeur: "renne", libelle: "Renne" },
      { valeur: "elan", libelle: "Élan" },
      { valeur: "cerf", libelle: "Cerf" },
      { valeur: "sanglier", libelle: "Sanglier" },
      { valeur: "saumon", libelle: "Saumon" },
      { valeur: "poisson", libelle: "Poisson" },
      { valeur: "insecte", libelle: "Insecte" },
      { valeur: "vegetal", libelle: "Végétal" },
    ],
  },
  // Les couleurs ne se ferment pas : un fournisseur sortira toujours un
  // « bordeaux » auquel personne n'avait pensé. Elles se rangent en
  // minuscules, et c'est la seule règle.
  couleurs: { libelle: "Couleur", valeurs: [] },
  matieres: {
    libelle: "Matière",
    valeurs: [
      { valeur: "cuir", libelle: "Cuir" },
      { valeur: "nylon", libelle: "Nylon" },
      { valeur: "biothane", libelle: "Biothane" },
      { valeur: "corde", libelle: "Corde" },
      { valeur: "tissu", libelle: "Tissu" },
      { valeur: "caoutchouc", libelle: "Caoutchouc" },
      { valeur: "peluche", libelle: "Peluche" },
      { valeur: "bois", libelle: "Bois" },
      { valeur: "metal", libelle: "Métal" },
      { valeur: "autre", libelle: "Autre" },
    ],
  },
  usages_jouet: {
    libelle: "Usage",
    valeurs: [
      { valeur: "macher", libelle: "À mâcher" },
      { valeur: "lancer", libelle: "À lancer" },
      { valeur: "tirer", libelle: "À tirer" },
      { valeur: "intelligence", libelle: "Intelligence" },
      { valeur: "calin", libelle: "Câlin" },
    ],
  },
};

/** La taille de l'ARTICLE — celle du collier, pas celle du chien. */
export const TAILLES_ARTICLE: Valeur[] = [
  { valeur: "XS", libelle: "XS" },
  { valeur: "S", libelle: "S" },
  { valeur: "M", libelle: "M" },
  { valeur: "L", libelle: "L" },
  { valeur: "XL", libelle: "XL" },
  { valeur: "unique", libelle: "Taille unique" },
];

export const LIBELLE_TAILLE_ARTICLE = "Taille de l’article";

/** Les deux cases de composition. Une case cochée est une étiquette. */
export const CASES = [
  { champ: "sans_cereales", libelle: "Sans céréales" },
  { champ: "monoproteine", libelle: "Monoprotéine" },
] as const;

export type ChampCase = (typeof CASES)[number]["champ"];

/**
 * Ce qu'un article porte, vu des étiquettes. Les champs sont ceux de la
 * table `articles` et de la vue `articles_vitrine`, aux mêmes noms.
 */
export type EtiquettesArticle = {
  categorie?: string | null;
  ages?: string[] | null;
  besoins?: string[] | null;
  tailles_chien?: string[] | null;
  proteines?: string[] | null;
  couleurs?: string[] | null;
  matieres?: string[] | null;
  usages_jouet?: string[] | null;
  sans_cereales?: boolean | null;
  monoproteine?: boolean | null;
  taille_article?: string | null;
};

/**
 * Ce qui a du sens selon la catégorie.
 *
 * Demander la protéine d'une laisse n'a pas de sens, et une fiche qui
 * demande tout ne se remplit jamais. Les valeurs déjà saisies ne sont pas
 * effacées pour autant : on masque, on n'efface pas — un article mal classé
 * puis reclassé retrouve ses étiquettes.
 */
const PAR_CATEGORIE: Record<string, (GroupeEtiquette | "taille_article" | ChampCase)[]> = {
  alimentation_seche: ["ages", "besoins", "tailles_chien", "proteines", "sans_cereales", "monoproteine"],
  alimentation_humide: ["ages", "besoins", "tailles_chien", "proteines", "sans_cereales", "monoproteine"],
  friandises: ["ages", "besoins", "tailles_chien", "proteines", "sans_cereales", "monoproteine"],
  mastication: ["ages", "besoins", "tailles_chien", "proteines", "sans_cereales", "monoproteine"],
  colliers: ["tailles_chien", "taille_article", "couleurs", "matieres"],
  laisses: ["tailles_chien", "taille_article", "couleurs", "matieres"],
  harnais: ["tailles_chien", "taille_article", "couleurs", "matieres"],
  muselieres: ["tailles_chien", "taille_article", "couleurs", "matieres"],
  longes: ["tailles_chien", "taille_article", "couleurs", "matieres"],
  couchages: ["tailles_chien", "taille_article", "couleurs", "matieres"],
  jouets: ["tailles_chien", "matieres", "usages_jouet"],
  peluches: ["tailles_chien", "matieres", "usages_jouet"],
};

/** Tout le reste — litière, soins, médaillons, divers. */
const PAR_DEFAUT: (GroupeEtiquette | "taille_article" | ChampCase)[] = ["tailles_chien"];

export type ChampEtiquette = GroupeEtiquette | "taille_article" | ChampCase;

/** Les champs d'étiquettes à montrer pour cette catégorie, dans l'ordre. */
export function champsDeCategorie(categorie: string | null | undefined): ChampEtiquette[] {
  return PAR_CATEGORIE[String(categorie ?? "")] ?? PAR_DEFAUT;
}

export function concerne(
  categorie: string | null | undefined,
  champ: ChampEtiquette
): boolean {
  return champsDeCategorie(categorie).includes(champ);
}

/** Le libellé d'une valeur. Une valeur inconnue se montre telle quelle. */
export function libelleValeur(groupe: GroupeEtiquette, valeur: string): string {
  const trouve = GROUPES[groupe].valeurs.find((v) => v.valeur === valeur);
  if (trouve) return trouve.libelle;
  // Les couleurs sont libres : « bordeaux » s'affiche « Bordeaux ».
  return valeur.charAt(0).toUpperCase() + valeur.slice(1);
}

export function libelleTailleArticle(valeur: string | null | undefined): string {
  const v = String(valeur ?? "");
  return TAILLES_ARTICLE.find((t) => t.valeur === v)?.libelle ?? v;
}

/**
 * Une couleur libre : minuscules, espaces resserrés, rien d'autre.
 *
 * La virgule tombe : c'est elle qui sépare les valeurs dans le champ caché du
 * formulaire, et une couleur « bleu, vert » y deviendrait deux couleurs.
 */
export function normaliserCouleur(brut: string): string {
  return brut.replace(/,/g, " ").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Ce qui a le droit d'entrer en base pour ce groupe.
 *
 * Hors vocabulaire : refusé, silencieusement — une pastille d'écran ne peut
 * pas produire autre chose, et un formulaire forgé n'a pas à être servi.
 * L'ordre rendu est celui du vocabulaire, jamais celui des clics : deux
 * articles étiquetés pareil se relisent pareil.
 */
export function nettoyerValeurs(groupe: GroupeEtiquette, brut: unknown): string[] {
  const liste = (Array.isArray(brut) ? brut : [])
    .map((v) => (typeof v === "string" ? v : ""))
    .map((v) => (groupe === "couleurs" ? normaliserCouleur(v) : v.trim()));

  if (groupe === "couleurs") {
    return [...new Set(liste.filter((v) => v.length > 0 && v.length <= 30))];
  }
  const connues = GROUPES[groupe].valeurs.map((v) => v.valeur);
  return connues.filter((v) => liste.includes(v));
}

/** La taille de l'article, ou null : rien d'inventé ne passe. */
export function nettoyerTailleArticle(brut: unknown): string | null {
  const v = typeof brut === "string" ? brut.trim() : "";
  return TAILLES_ARTICLE.some((t) => t.valeur === v) ? v : null;
}

/**
 * L'article n'a AUCUNE étiquette de remplie parmi celles qui le concernent.
 *
 * Une case COCHÉE est une étiquette ; une case décochée n'en est pas une.
 * `false` est l'état de départ de tous les articles : le compter comme une
 * réponse dirait qu'un article est complet alors que personne ne l'a ouvert.
 */
export function sansEtiquettes(article: EtiquettesArticle): boolean {
  for (const champ of champsDeCategorie(article.categorie)) {
    if (champ === "sans_cereales" || champ === "monoproteine") {
      if (article[champ]) return false;
      continue;
    }
    if (champ === "taille_article") {
      if (article.taille_article) return false;
      continue;
    }
    if ((article[champ] ?? []).length > 0) return false;
  }
  return true;
}

/**
 * Le formulaire porte chaque liste dans UN champ caché, valeurs séparées par
 * une virgule — `valeursFormulaire` ne garde qu'une occurrence par nom, et
 * dix champs répétés se seraient perdus au premier refus de l'action.
 */
export function valeursVersChamp(valeurs: string[]): string {
  return valeurs.join(",");
}

export function champVersValeurs(brut: string | null | undefined): string[] {
  return String(brut ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

/**
 * Le marqueur que pose la section du formulaire.
 *
 * Absent — fiche d'atelier, appel forgé — les colonnes d'étiquettes ne sont
 * pas touchées du tout. Même règle que l'envoi postal : un formulaire qui n'a
 * pas MONTRÉ un champ n'a pas à l'écraser.
 */
export const MARQUEUR_ETIQUETTES = "etiquettes";

export type ChampsEtiquettes = {
  ages: string[];
  besoins: string[];
  tailles_chien: string[];
  proteines: string[];
  couleurs: string[];
  matieres: string[];
  usages_jouet: string[];
  sans_cereales: boolean;
  monoproteine: boolean;
  taille_article: string | null;
};

/**
 * Ce que le formulaire a envoyé, prêt pour la base — nettoyé.
 *
 * Rien n'est cru sur parole : une valeur hors vocabulaire tombe ici, et la
 * contrainte CHECK la refuserait de toute façon. Les deux gardes, parce
 * qu'une seule finit toujours par être contournée.
 */
export function etiquettesDepuisChamps(
  champs: Record<string, string | null | undefined>
): ChampsEtiquettes {
  const liste = (groupe: GroupeEtiquette) =>
    nettoyerValeurs(groupe, champVersValeurs(champs[groupe]));

  return {
    ages: liste("ages"),
    besoins: liste("besoins"),
    tailles_chien: liste("tailles_chien"),
    proteines: liste("proteines"),
    couleurs: liste("couleurs"),
    matieres: liste("matieres"),
    usages_jouet: liste("usages_jouet"),
    sans_cereales: champs.sans_cereales === "on",
    monoproteine: champs.monoproteine === "on",
    taille_article: nettoyerTailleArticle(champs.taille_article),
  };
}

/** Les étiquettes remplies, en libellés — pour la fiche en lecture. */
export function etiquettesRemplies(
  article: EtiquettesArticle
): { libelle: string; valeurs: string[] }[] {
  const lignes: { libelle: string; valeurs: string[] }[] = [];
  for (const champ of champsDeCategorie(article.categorie)) {
    if (champ === "sans_cereales" || champ === "monoproteine") {
      if (article[champ]) {
        const c = CASES.find((x) => x.champ === champ)!;
        lignes.push({ libelle: c.libelle, valeurs: ["Oui"] });
      }
      continue;
    }
    if (champ === "taille_article") {
      if (article.taille_article) {
        lignes.push({
          libelle: LIBELLE_TAILLE_ARTICLE,
          valeurs: [libelleTailleArticle(article.taille_article)],
        });
      }
      continue;
    }
    const valeurs = article[champ] ?? [];
    if (valeurs.length > 0) {
      lignes.push({
        libelle: GROUPES[champ].libelle,
        valeurs: valeurs.map((v) => libelleValeur(champ, v)),
      });
    }
  }
  return lignes;
}
