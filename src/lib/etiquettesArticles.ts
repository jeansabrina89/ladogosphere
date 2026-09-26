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
  | "animaux"
  | "ages"
  | "besoins"
  | "tailles_chien"
  | "gouts"
  | "proteines"
  | "especes"
  | "types_soin"
  | "couleurs"
  | "matieres"
  | "usages_jouet";

/**
 * Les six animaux servis par la boutique (APP 27).
 *
 * Au PLURIEL, parce que c'est ainsi qu'on lit un rayon : « Chiens », comme on
 * dirait « Croquettes ». Le même libellé sert à l'onglet du catalogue et à la
 * pastille de la fiche — une seule forme, un seul endroit à corriger.
 */
export type Animal = "chien" | "chat" | "rongeur" | "furet" | "reptile" | "oiseau";

export const ANIMAUX: readonly Animal[] = [
  "chien", "chat", "rongeur", "furet", "reptile", "oiseau",
] as const;

export type Valeur = { valeur: string; libelle: string };

type Groupe = {
  /** En-tête de la section, à la fiche comme au panneau de filtres. */
  libelle: string;
  /**
   * Une phrase sous l'en-tête, quand le libellé seul se comprendrait de
   * travers. « Contient » en a une : sans elle, on croit qu'on y met la saveur.
   */
  aide?: string;
  /** L'ordre d'affichage EST celui de ce tableau. Vide : valeurs libres. */
  valeurs: Valeur[];
};

/**
 * Le vocabulaire des viandes, POISSONS et protéines végétales.
 *
 * Partagé, et non recopié, par « Goût » et « Contient » (APP 25-GOÛT) : les
 * deux filtres doivent parler la même langue, sans quoi un article au goût
 * d'agneau ne se retrouverait plus parmi ceux qui en contiennent. La contrainte
 * `articles_gouts_check` porte la même liste en base, et un test compare les
 * deux.
 */
const VALEURS_PROTEINES: Valeur[] = [
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
];

/**
 * Le vocabulaire, et l'ordre dans lequel il se montre.
 *
 * Les âges vont du plus jeune au plus vieux, les tailles du plus petit au
 * plus grand : une liste triée par hasard se relit à chaque fois.
 */
export const GROUPES: Record<GroupeEtiquette, Groupe> = {
  animaux: {
    libelle: "Animal",
    aide: "Pour qui cet article est fait. Au moins un — sinon il n'apparaît nulle part.",
    valeurs: [
      { valeur: "chien", libelle: "Chiens" },
      { valeur: "chat", libelle: "Chats" },
      { valeur: "rongeur", libelle: "Rongeurs" },
      { valeur: "furet", libelle: "Furets" },
      { valeur: "reptile", libelle: "Reptiles" },
      { valeur: "oiseau", libelle: "Oiseaux" },
    ],
  },
  ages: {
    libelle: "Âge",
    /* Le vocabulaire ENTIER. Quel âge se propose pour quel animal est une
       règle d'affichage, tenue par AGES_PAR_ANIMAL : un chat n'a pas de
       « chiot », un lapin n'a ni l'un ni l'autre. */
    valeurs: [
      { valeur: "chiot", libelle: "Chiot" },
      { valeur: "chaton", libelle: "Chaton" },
      { valeur: "junior", libelle: "Junior" },
      { valeur: "adulte", libelle: "Adulte" },
      { valeur: "senior", libelle: "Senior" },
    ],
  },
  especes: {
    libelle: "Espèce",
    aide: "« Rongeurs » est trop large pour choisir un foin : un lapin ne mange pas ce qu'un hamster mange.",
    valeurs: [
      { valeur: "cochon_inde", libelle: "Cochon d'Inde" },
      { valeur: "lapin", libelle: "Lapin" },
      { valeur: "hamster", libelle: "Hamster" },
      { valeur: "rat", libelle: "Rat" },
      { valeur: "souris", libelle: "Souris" },
      { valeur: "chinchilla", libelle: "Chinchilla" },
      { valeur: "degu", libelle: "Octodon" },
      { valeur: "gerbille", libelle: "Gerbille" },
    ],
  },
  types_soin: {
    libelle: "Type de soin",
    valeurs: [
      { valeur: "pattes", libelle: "Pattes" },
      { valeur: "truffe", libelle: "Truffe" },
      { valeur: "pelage", libelle: "Pelage" },
      { valeur: "shampooing", libelle: "Shampooing" },
      { valeur: "demelant", libelle: "Démêlant" },
      { valeur: "apres_shampooing", libelle: "Après-shampooing" },
      { valeur: "antiparasitaire", libelle: "Antiparasitaire" },
      { valeur: "yeux", libelle: "Yeux" },
      { valeur: "oreilles", libelle: "Oreilles" },
      { valeur: "dents", libelle: "Dents" },
      { valeur: "griffes", libelle: "Griffes" },
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
  /**
   * Ce que l'emballage annonce, et qui donne envie : « avec agneau ».
   *
   * Vient AVANT « Contient » partout où les deux se montrent : on cherche
   * d'abord ce qu'on veut, on écarte ensuite ce qu'on évite.
   */
  gouts: {
    libelle: "Goût",
    valeurs: VALEURS_PROTEINES,
  },
  /**
   * Tout ce que la recette contient, l'annoncé comme le reste.
   *
   * Le « Purely Pâté avec agneau » de Bozita contient 52 % de poulet : c'est
   * précisément ce que cette liste sert à dire, et c'est pourquoi elle ne peut
   * pas servir de filtre « Goût ». La colonne s'appelle toujours `proteines` en
   * base — seul son nom à l'écran change (APP 25-GOÛT).
   */
  proteines: {
    libelle: "Contient",
    aide: "Tout ce que contient la recette — utile pour les allergies",
    valeurs: VALEURS_PROTEINES,
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
  animaux?: string[] | null;
  especes?: string[] | null;
  types_soin?: string[] | null;
  ages?: string[] | null;
  besoins?: string[] | null;
  tailles_chien?: string[] | null;
  gouts?: string[] | null;
  proteines?: string[] | null;
  couleurs?: string[] | null;
  matieres?: string[] | null;
  usages_jouet?: string[] | null;
  sans_cereales?: boolean | null;
  monoproteine?: boolean | null;
  taille_article?: string | null;
};


// ── La table unique : quel filtre vaut pour quel animal (APP 27) ───────────

/**
 * Quels GROUPES d'étiquettes valent pour quel animal.
 *
 * C'est la table de Sabrina, écrite une fois. Aucune de ces règles ne doit
 * apparaître en dur ailleurs : un écran qui déciderait de son côté que
 * « Espèce » se montre finirait par le montrer aux reptiles, et on ne saurait
 * plus lequel des deux endroits dit vrai.
 *
 * « tous » plutôt que la liste des six : ce qui vaut pour tout le monde doit le
 * dire, sinon l'ajout d'un septième animal demanderait de relire chaque ligne
 * pour savoir si l'omission est voulue.
 */
const GROUPES_PAR_ANIMAL: Record<GroupeEtiquette, readonly Animal[] | "tous"> = {
  // L'animal lui-même se choisit toujours : c'est lui qui commande le reste.
  animaux: "tous",
  // L'âge vaut pour tous, mais PAS avec les mêmes valeurs — voir AGES_PAR_ANIMAL.
  ages: "tous",
  // La taille du CHIEN, et de lui seul. Un lapin n'est pas « grand ».
  tailles_chien: ["chien"],
  // « Sensible », « Light », « Actif » : du vocabulaire d'aliment carnivore.
  besoins: ["chien", "chat"],
  // Le goût et la composition n'ont de sens que là où l'on choisit une viande.
  gouts: ["chien", "chat", "furet"],
  proteines: ["chien", "chat", "furet"],
  // L'espèce précise l'animal là où il est trop large. Aujourd'hui : rongeurs.
  especes: ["rongeur"],
  // Un shampooing, des griffes à couper : tout animal a un corps à soigner.
  types_soin: "tous",
  couleurs: "tous",
  matieres: "tous",
  usages_jouet: "tous",
};

/**
 * Quelles VALEURS d'âge se proposent pour quel animal.
 *
 * Le vocabulaire de la base est entier — « chiot » et « chaton » y coexistent.
 * Ici on dit qui a droit à quoi : proposer « chiot » sous l'onglet Chats ne
 * serait pas seulement inutile, ce serait une faute que la cliente remarquerait.
 *
 * Le chat n'a pas de « junior » : décision de Sabrina, qui range le chaton puis
 * l'adulte. On ne comble pas le trou de notre propre autorité.
 */
const AGES_PAR_ANIMAL: Record<Animal, readonly string[]> = {
  chien: ["chiot", "junior", "adulte", "senior"],
  chat: ["chaton", "adulte", "senior"],
  rongeur: ["junior", "adulte", "senior"],
  furet: ["junior", "adulte", "senior"],
  reptile: ["junior", "adulte", "senior"],
  oiseau: ["junior", "adulte", "senior"],
};

/** Ce groupe vaut-il pour au moins un de ces animaux ? */
export function groupeVautPourAnimaux(
  groupe: GroupeEtiquette,
  animaux: readonly string[] | null | undefined
): boolean {
  const regle = GROUPES_PAR_ANIMAL[groupe];
  if (regle === "tous") return true;
  // Aucun animal connu : on ne masque pas par excès de zèle — une fiche dont
  // l'animal n'est pas encore coché doit rester remplissable.
  const liste = (animaux ?? []).filter((a): a is Animal => (ANIMAUX as readonly string[]).includes(a));
  if (liste.length === 0) return true;
  return liste.some((a) => regle.includes(a));
}

/**
 * Les valeurs d'un groupe proposées pour ces animaux.
 *
 * Pour un article qui vaut pour plusieurs animaux, c'est l'UNION : un aliment
 * chien et chat propose chiot, chaton, junior, adulte et senior, et c'est à
 * Sabrina de cocher ce qui convient. L'intersection aurait effacé le chiot d'un
 * paquet « chiots et chatons ».
 *
 * L'ordre rendu est celui du vocabulaire, jamais celui des animaux : deux
 * articles se relisent pareil.
 */
export function valeursPourAnimaux(
  groupe: GroupeEtiquette,
  animaux: readonly string[] | null | undefined
): Valeur[] {
  const toutes = GROUPES[groupe].valeurs;
  if (groupe !== "ages") return toutes;

  const liste = (animaux ?? []).filter((a): a is Animal => (ANIMAUX as readonly string[]).includes(a));
  // Aucun animal coché : le vocabulaire entier, pour ne rien bloquer.
  if (liste.length === 0) return toutes;

  const permises = new Set(liste.flatMap((a) => AGES_PAR_ANIMAL[a]));
  return toutes.filter((v) => permises.has(v.valeur));
}


/**
 * Ce qui a du sens selon la catégorie.
 *
 * Demander la protéine d'une laisse n'a pas de sens, et une fiche qui
 * demande tout ne se remplit jamais. Les valeurs déjà saisies ne sont pas
 * effacées pour autant : on masque, on n'efface pas — un article mal classé
 * puis reclassé retrouve ses étiquettes.
 */
const ALIMENT: (GroupeEtiquette | "taille_article" | ChampCase)[] =
  ["ages", "besoins", "tailles_chien", "gouts", "proteines", "sans_cereales", "monoproteine"];

const EQUIPEMENT: (GroupeEtiquette | "taille_article" | ChampCase)[] =
  ["tailles_chien", "taille_article", "couleurs", "matieres"];

const PAR_CATEGORIE: Record<string, (GroupeEtiquette | "taille_article" | ChampCase)[]> = {
  alimentation_seche: ALIMENT,
  alimentation_humide: ALIMENT,
  /* APP 27 : granulés, graines, foin des NAC. Mêmes étiquettes que les autres
     aliments — le croisement avec l'animal retire de lui-même la taille du
     chien, le besoin et le goût pour un foin de lapin. */
  alimentation_complete: ALIMENT,
  friandises: ALIMENT,
  mastication: ALIMENT,
  colliers: EQUIPEMENT,
  laisses: EQUIPEMENT,
  harnais: EQUIPEMENT,
  muselieres: EQUIPEMENT,
  longes: EQUIPEMENT,
  couchages: EQUIPEMENT,
  jouets: ["tailles_chien", "matieres", "usages_jouet"],
  peluches: ["tailles_chien", "matieres", "usages_jouet"],
  /* APP 27. Un griffoir, une cage : un objet qui a une taille, une couleur et
     une matière. Pas d'usage de jouet — on ne lance pas une cage. */
  griffoirs: ["taille_article", "couleurs", "matieres"],
  cages_enclos: ["taille_article", "couleurs", "matieres"],
  /* APP 27 : AUCUNE étiquette hors l'animal. Une litière se choisit par
     l'animal et rien d'autre — lui coller une taille de chien, comme le faisait
     le défaut jusqu'ici, ne servait personne. */
  litiere: [],
  /* APP 27 : le SEUL rayon où « Type de soin » apparaît. L'âge suit la table
     des animaux — un shampooing pour chiot n'est pas celui d'un senior. */
  soins: ["types_soin", "ages"],
};

/**
 * Tout le reste — médaillons, divers.
 *
 * `tailles_chien` y reste : un médaillon se choisit à la taille de l'animal qui
 * le porte. Le croisement avec l'animal le retire dès que l'article n'est pas
 * pour chiens.
 */
const PAR_DEFAUT: (GroupeEtiquette | "taille_article" | ChampCase)[] = ["tailles_chien"];

export type ChampEtiquette = GroupeEtiquette | "taille_article" | ChampCase;

/** Les champs d'étiquettes à montrer pour cette catégorie, dans l'ordre. */
export function champsDeCategorie(categorie: string | null | undefined): ChampEtiquette[] {
  return PAR_CATEGORIE[String(categorie ?? "")] ?? PAR_DEFAUT;
}

/**
 * Le CROISEMENT des deux règles : ce que la catégorie appelle, ET ce que
 * l'animal autorise (APP 27).
 *
 * Les deux conditions sont nécessaires, et aucune ne suffit. Un aliment appelle
 * « Taille du chien », mais un foin de lapin ne doit pas la montrer ; un rayon
 * de soins appelle « Type de soin » pour tout animal, mais un collier ne la
 * montre pour aucun.
 *
 * `animaux` n'est jamais dans la liste rendue : la section de l'animal se place
 * EN TÊTE de la fiche, avant tout le reste, parce que c'est elle qui commande ce
 * que les autres montrent. Elle ne dépend d'aucune catégorie.
 */
export function champsDeCategorieEtAnimaux(
  categorie: string | null | undefined,
  animaux: readonly string[] | null | undefined
): ChampEtiquette[] {
  return champsDeCategorie(categorie).filter((champ) => {
    // Les cases et la taille de l'article ne dépendent pas de l'animal.
    if (champ === "taille_article" || champ === "sans_cereales" || champ === "monoproteine") {
      return true;
    }
    return groupeVautPourAnimaux(champ, animaux);
  });
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
  animaux: string[];
  especes: string[];
  types_soin: string[];
  ages: string[];
  besoins: string[];
  tailles_chien: string[];
  gouts: string[];
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
    animaux: liste("animaux"),
    especes: liste("especes"),
    types_soin: liste("types_soin"),
    ages: liste("ages"),
    besoins: liste("besoins"),
    tailles_chien: liste("tailles_chien"),
    gouts: liste("gouts"),
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
