import {
  ANIMAUX,
  type ChampEtiquette,
  valeursPourAnimaux,
  groupeVautPourAnimaux,
  GROUPES,
  TAILLES_ARTICLE,
  champsDeCategorie,
  libelleTailleArticle,
  libelleValeur,
  type GroupeEtiquette,
} from "@/src/lib/etiquettesArticles";
import { libelleCategorieArticle, ordreCategorie } from "@/src/lib/boutiqueLogique";

/**
 * Les filtres du catalogue client.
 *
 * Module PUR : ni React, ni base. C'est lui qui décide ce qui reste affiché,
 * ce que chaque valeur compte, et ce que l'URL dit — le panneau ne fait que
 * le montrer.
 *
 * Deux règles, et elles ne se ressemblent pas :
 *   - DANS un filtre, les valeurs s'ajoutent (senior OU light) ;
 *   - ENTRE filtres, elles se restreignent (senior ET petit).
 * C'est ce qu'attend quelqu'un qui coche : deux tailles, c'est « l'une ou
 * l'autre » ; une taille et une matière, c'est « les deux ».
 *
 * Le filtrage se fait sur la liste DÉJÀ CHARGÉE, côté navigateur. Le
 * catalogue tient en une page, chaque article y est déjà rendu, et les
 * champs sur lesquels on filtre sont exactement ceux qui sont déjà affichés :
 * aucune donnée nouvelle ne descend au navigateur, et un clic ne coûte pas un
 * aller-retour. Les comptes par valeur ont de toute façon besoin de la liste
 * entière.
 */

export type ArticleFiltrable = {
  id: string;
  nom: string;
  marque: string | null;
  categorie: string;
  type_article: string;
  /** Le prix de base ; pour un sur-mesure, c'est le « dès … » affiché. */
  prix_vente: number;
  /** Ce qu'il paie vraiment, remises comprises : c'est le prix AFFICHÉ. */
  prix_final: number;
  /** Visiteur : le booléen. Client connecté : le compte, jamais publié tel quel. */
  en_stock?: boolean;
  stock_disponible?: number | null;
  expediable?: boolean | null;
  /* APP 27 : pour QUI l'article est fait. Ce n'est pas un filtre du panneau,
     c'est l'ONGLET du catalogue — il se choisit avant tout le reste. */
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

/**
 * Les tranches de prix, sur le prix TTC AFFICHÉ.
 *
 * Bornes explicites : minimum compris, maximum exclu. « 30.– à 60.– »
 * contient 30.00 et s'arrête juste avant 60.00, que la tranche suivante
 * reprend — d'où « 60.– et plus » plutôt que « plus de 60.– », qui laisserait
 * croire que 60.00 n'est nulle part.
 */
export const TRANCHES_PRIX = [
  { valeur: "0-10", libelle: "Moins de 10.–", min: 0, max: 10 },
  { valeur: "10-30", libelle: "10.– à 30.–", min: 10, max: 30 },
  { valeur: "30-60", libelle: "30.– à 60.–", min: 30, max: 60 },
  { valeur: "60+", libelle: "60.– et plus", min: 60, max: Infinity },
] as const;

/** Le prix sur lequel on filtre : celui que le client lit sur la carte. */
export function prixAffiche(a: ArticleFiltrable): number {
  return a.type_article === "personnalisable" ? Number(a.prix_vente) : Number(a.prix_final);
}

export function trancheDe(prix: number): string | null {
  return TRANCHES_PRIX.find((t) => prix >= t.min && prix < t.max)?.valeur ?? null;
}

export type Filtres = {
  /** Une seule catégorie : c'est elle qui décide des filtres suivants. */
  categorie: string | null;
  marques: string[];
  prix: string[];
  /** Bascules : vrai = on restreint, faux = on ne demande rien. */
  en_stock: boolean;
  expediable: boolean;
  /**
   * L'ONGLET d'animal choisi (APP 27), ou null pour « Tous ».
   *
   * Un choix unique, et non une liste comme les autres filtres : on ne fait pas
   * ses courses pour le chien et le lapin dans le même geste. C'est d'ailleurs ce
   * qui le distingue d'un filtre — il change ce que le panneau PROPOSE, pas
   * seulement ce que la grille montre.
   */
  animal: string | null;
  ages: string[];
  /* APP 27. « animaux » n'est PAS ici : il vit dans l'onglet, pas dans le
     panneau — un onglet n'est pas une case qu'on coche parmi d'autres. En
     revanche « especes » et « types_soin » sont des filtres ordinaires. */
  especes: string[];
  types_soin: string[];
  besoins: string[];
  tailles_chien: string[];
  gouts: string[];
  proteines: string[];
  couleurs: string[];
  matieres: string[];
  usages_jouet: string[];
  tailles_article: string[];
  sans_cereales: boolean;
  monoproteine: boolean;
};

export const FILTRES_VIDES: Filtres = {
  categorie: null,
  marques: [],
  prix: [],
  en_stock: false,
  expediable: false,
  animal: null,
  ages: [],
  especes: [],
  types_soin: [],
  besoins: [],
  tailles_chien: [],
  gouts: [],
  proteines: [],
  couleurs: [],
  matieres: [],
  usages_jouet: [],
  tailles_article: [],
  sans_cereales: false,
  monoproteine: false,
};

/** Les listes d'étiquettes, du nom du filtre au nom de la colonne. */
const LISTES: { filtre: keyof Filtres; groupe: GroupeEtiquette }[] = [
  { filtre: "ages", groupe: "ages" },
  { filtre: "especes", groupe: "especes" },
  { filtre: "types_soin", groupe: "types_soin" },
  { filtre: "besoins", groupe: "besoins" },
  { filtre: "tailles_chien", groupe: "tailles_chien" },
  { filtre: "gouts", groupe: "gouts" },
  { filtre: "proteines", groupe: "proteines" },
  { filtre: "couleurs", groupe: "couleurs" },
  { filtre: "matieres", groupe: "matieres" },
  { filtre: "usages_jouet", groupe: "usages_jouet" },
];

/** Un article est-il en stock, selon ce que cette personne a le droit de lire ? */
export function estEnStock(a: ArticleFiltrable): boolean {
  if (a.type_article === "personnalisable") return true;
  if (typeof a.en_stock === "boolean") return a.en_stock;
  return Number(a.stock_disponible ?? 0) > 0;
}

/** Le nom du groupe pour lequel on ne filtre pas — voir `comptes`. */
type Sauf = keyof Filtres | null;

function correspond(a: ArticleFiltrable, f: Filtres, sauf: Sauf = null): boolean {
  const ignore = (nom: keyof Filtres) => sauf === nom;

  /*
   * L'onglet passe AVANT tout : un article pour chats n'a rien à faire sous
   * « Chiens », quels que soient les autres filtres. Un article pour plusieurs
   * animaux apparaît dans chacun de leurs onglets — c'est le même article, pas
   * une copie.
   */
  if (!ignore("animal") && f.animal && !(a.animaux ?? []).includes(f.animal)) return false;

  if (!ignore("categorie") && f.categorie && a.categorie !== f.categorie) return false;

  if (!ignore("marques") && f.marques.length > 0 && !f.marques.includes(a.marque ?? "")) {
    return false;
  }

  if (!ignore("prix") && f.prix.length > 0) {
    const tranche = trancheDe(prixAffiche(a));
    if (!tranche || !f.prix.includes(tranche)) return false;
  }

  if (!ignore("en_stock") && f.en_stock && !estEnStock(a)) return false;

  // « Livrable par la poste » : un sur-mesure part avec la commande, il n'est
  // ni pesé ni soumis à la case (règle du panier).
  if (!ignore("expediable") && f.expediable) {
    const livrable = a.type_article === "personnalisable" || a.expediable === true;
    if (!livrable) return false;
  }

  for (const { filtre, groupe } of LISTES) {
    if (ignore(filtre)) continue;
    const choisies = f[filtre] as string[];
    if (choisies.length === 0) continue;
    const portees = a[groupe] ?? [];
    // OU dans un filtre : une seule valeur commune suffit.
    if (!choisies.some((v) => portees.includes(v))) return false;
  }

  if (!ignore("tailles_article") && f.tailles_article.length > 0) {
    if (!a.taille_article || !f.tailles_article.includes(a.taille_article)) return false;
  }

  if (!ignore("sans_cereales") && f.sans_cereales && a.sans_cereales !== true) return false;
  if (!ignore("monoproteine") && f.monoproteine && a.monoproteine !== true) return false;

  return true;
}

/** Les articles qui restent. L'ordre d'entrée est conservé. */
export function filtrer(articles: ArticleFiltrable[], f: Filtres): ArticleFiltrable[] {
  return articles.filter((a) => correspond(a, f));
}

export function nombreFiltresActifs(f: Filtres): number {
  let n = 0;
  if (f.categorie) n++;
  if (f.en_stock) n++;
  if (f.expediable) n++;
  if (f.sans_cereales) n++;
  if (f.monoproteine) n++;
  n += f.marques.length + f.prix.length + f.tailles_article.length;
  for (const { filtre } of LISTES) n += (f[filtre] as string[]).length;
  return n;
}

export type ValeurFiltre = { valeur: string; libelle: string; nombre: number; actif: boolean };
export type FiltreAffiche = {
  /** Le nom du champ dans `Filtres`. */
  nom: keyof Filtres;
  libelle: string;
  /** « une seule » pour la catégorie, « plusieurs » partout ailleurs. */
  choix: "unique" | "multiple";
  valeurs: ValeurFiltre[];
};

/**
 * Les valeurs d'un filtre, comptées SANS ce filtre-là.
 *
 * Compter sur les articles affichés à la lettre aurait tué le choix
 * multiple : dès qu'on coche « senior », « chiot » tomberait à zéro, donc
 * disparaîtrait, et on ne pourrait plus demander « senior OU chiot ». Chaque
 * filtre se compte donc sur la liste réduite par TOUS LES AUTRES. Un compte
 * annoncé est alors toujours tenu : cocher cette valeur donne bien ce
 * nombre-là.
 */
export function sansFiltresDeRayon(f: Filtres): Filtres {
  return {
    ...f,
    proteines: [], couleurs: [], matieres: [], usages_jouet: [],
    tailles_article: [], sans_cereales: false, monoproteine: false,
  };
}

function comptes(
  articles: ArticleFiltrable[],
  f: Filtres,
  nom: keyof Filtres,
  valeurDe: (a: ArticleFiltrable) => string[]
): Map<string, number> {
  const compte = new Map<string, number>();
  for (const a of articles) {
    if (!correspond(a, f, nom)) continue;
    for (const v of valeurDe(a)) compte.set(v, (compte.get(v) ?? 0) + 1);
  }
  return compte;
}

/**
 * Les filtres à montrer, dans l'ordre, avec leurs valeurs et leurs comptes.
 *
 * Un filtre sans aucune valeur n'apparaît pas : proposer « Matière » sur un
 * rayon d'alimentation, ou « Protéines » quand aucun article n'en porte, ne
 * fait qu'allonger un panneau que personne ne lira jusqu'au bout.
 */
export function filtresAffiches(
  articles: ArticleFiltrable[],
  f: Filtres
): FiltreAffiche[] {
  const listes: FiltreAffiche[] = [];

  const ajouter = (
    nom: keyof Filtres,
    libelle: string,
    valeurDe: (a: ArticleFiltrable) => string[],
    ordonner: (valeurs: string[]) => string[],
    libelleDe: (valeur: string) => string,
    choix: "unique" | "multiple" = "multiple",
    /** Les filtres qui servent au COMPTE, quand ce ne sont pas ceux en cours. */
    pourCompte: Filtres = f
  ) => {
    const compte = comptes(articles, pourCompte, nom, valeurDe);
    const choisies = nom === "categorie"
      ? (f.categorie ? [f.categorie] : [])
      : (f[nom] as string[]);
    // Une valeur cochée reste montrée même si plus rien ne la porte : sinon
    // elle disparaîtrait avec le moyen de la décocher.
    const valeurs = ordonner([...new Set([...compte.keys(), ...choisies])]).map((v) => ({
      valeur: v,
      libelle: libelleDe(v),
      nombre: compte.get(v) ?? 0,
      actif: choisies.includes(v),
    }));
    if (valeurs.length > 0) listes.push({ nom, libelle, choix, valeurs });
  };

  // 1. La catégorie — c'est elle qui décide de la suite.
  //
  // Elle se compte SANS les filtres propres à un rayon : une matière cochée
  // dans les colliers ne doit pas faire disparaître le rayon « Jouets » du
  // panneau, alors que changer de rayon abandonne justement cette matière.
  // Un rayon est une navigation, pas une facette.
  ajouter(
    "categorie",
    "Catégorie",
    (a) => [a.categorie],
    (v) => v.sort((x, y) => ordreCategorie(x) - ordreCategorie(y)),
    libelleCategorieArticle,
    "unique",
    sansFiltresDeRayon(f)
  );

  // 2. La marque, par ordre alphabétique : aucune n'est plus importante.
  ajouter(
    "marques",
    "Marque",
    (a) => (a.marque ? [a.marque] : []),
    (v) => v.sort((x, y) => x.localeCompare(y, "fr")),
    (v) => v
  );

  // 3. Le prix, dans l'ordre des tranches.
  ajouter(
    "prix",
    "Prix",
    (a) => {
      const t = trancheDe(prixAffiche(a));
      return t ? [t] : [];
    },
    (v) => TRANCHES_PRIX.map((t) => t.valeur).filter((t) => v.includes(t)),
    (v) => TRANCHES_PRIX.find((t) => t.valeur === v)?.libelle ?? v
  );

  // 4. Les deux bascules. Elles n'ont qu'une valeur, et leur compte dit
  //    combien d'articles resteraient.
  const bascule = (nom: "en_stock" | "expediable", libelle: string, texte: string,
                   tenu: (a: ArticleFiltrable) => boolean) => {
    const nombre = articles.filter((a) => correspond(a, f, nom) && tenu(a)).length;
    if (nombre === 0 && !f[nom]) return;
    listes.push({
      nom, libelle, choix: "multiple",
      valeurs: [{ valeur: "1", libelle: texte, nombre, actif: f[nom] }],
    });
  };
  bascule("en_stock", "Disponibilité", "En stock", estEnStock);
  bascule("expediable", "Livraison", "Livrable par la poste",
    (a) => a.type_article === "personnalisable" || a.expediable === true);

  // 5. Les trois étiquettes qui valent pour tout le magasin, puis celles que
  //    la catégorie choisie appelle. Sans catégorie choisie, on s'en tient
  //    aux trois : un panneau qui propose tout ne se lit plus.
  const universelles: GroupeEtiquette[] = ["ages", "besoins", "tailles_chien"];
  // << Gout >> est le seul filtre SEMI-universel : il vaut pour toute la
  // nourriture, quel que soit le rayon, et n a aucun sens pour un collier.
  // Sans rayon choisi, il se montre donc avec les universelles ; avec un rayon
  // de nourriture, il vient par champsDeCategorie ; avec un rayon
  // d accessoires, il ne vient pas du tout.
  if (!f.categorie) universelles.push("gouts");

  /*
   * APP 27 : dans un onglet, seuls les filtres de CET animal se proposent.
   *
   * « Taille du chien » sous l'onglet Chats serait une faute que la cliente
   * remarquerait ; « Espèce » ailleurs que chez les rongeurs ne voudrait rien
   * dire. La règle vient de la table unique (« etiquettesArticles »), jamais
   * d'une condition écrite ici.
   *
   * Sans onglet (« Tous »), tout se propose : on ne sait pas encore pour qui la
   * cliente cherche, et lui cacher un filtre l'empêcherait de trouver.
   */
  const pourCetAnimal = (c: ChampEtiquette) =>
    c === "taille_article" || c === "sans_cereales" || c === "monoproteine"
      ? true
      : groupeVautPourAnimaux(c, f.animal ? [f.animal] : null);

  const universellesVues = universelles.filter(pourCetAnimal);

  const propres = f.categorie
    ? champsDeCategorie(f.categorie)
        .filter((c) => !universelles.includes(c as GroupeEtiquette))
        .filter(pourCetAnimal)
        // « animaux » n'est pas un filtre de panneau : c'est l'onglet. Il ne
        // peut pas y arriver aujourd'hui, et cette ligne fait qu'il ne le
        // pourra pas demain par une ligne ajoutée à PAR_CATEGORIE.
        .filter((c) => c !== "animaux")
    : [];

  for (const groupe of universellesVues) {
    if (groupe === "animaux") continue;
    ajouter(
      groupe,
      GROUPES[groupe].libelle,
      (a) => a[groupe] ?? [],
      // Les VALEURS suivent l'animal aussi : l'onglet Rongeurs ne propose en
      // âge que junior, adulte et senior — jamais chiot ni chaton.
      (v) => valeursPourAnimaux(groupe, f.animal ? [f.animal] : null)
        .map((x) => x.valeur).filter((x) => v.includes(x)),
      (v) => libelleValeur(groupe, v)
    );
  }

  for (const champ of propres) {
    if (champ === "taille_article") {
      ajouter(
        "tailles_article",
        "Taille de l’article",
        (a) => (a.taille_article ? [a.taille_article] : []),
        (v) => TAILLES_ARTICLE.map((t) => t.valeur).filter((t) => v.includes(t)),
        libelleTailleArticle
      );
      continue;
    }
    if (champ === "sans_cereales" || champ === "monoproteine") {
      const libelle = champ === "sans_cereales" ? "Sans céréales" : "Monoprotéine";
      const nombre = articles.filter((a) => correspond(a, f, champ) && a[champ] === true).length;
      if (nombre === 0 && !f[champ]) continue;
      listes.push({
        nom: champ, libelle: "Composition", choix: "multiple",
        valeurs: [{ valeur: "1", libelle, nombre, actif: f[champ] }],
      });
      continue;
    }
    /*
     * « animaux » est écarté plus haut : c'est l'onglet, pas un filtre. Le type
     * le dit ici — un groupe de panneau n'est jamais l'animal, et le
     * compilateur refusera la ligne qui tenterait de l'y remettre.
     */
    const groupe = champ as Exclude<GroupeEtiquette, "animaux">;
    ajouter(
      groupe,
      GROUPES[groupe].libelle,
      (a) => a[groupe] ?? [],
      (v) =>
        groupe === "couleurs"
          ? v.sort((x, y) => x.localeCompare(y, "fr"))
          // Les valeurs suivent l'animal de l'onglet, comme les universelles.
          : valeursPourAnimaux(groupe, f.animal ? [f.animal] : null)
              .map((x) => x.valeur).filter((x) => v.includes(x)),
      (v) => libelleValeur(groupe, v)
    );
  }

  return listes;
}

// ── L'URL ──────────────────────────────────────────────────────────────────
//
// Les filtres vivent dans l'adresse : un lien filtré se partage, le retour
// arrière refait le chemin en sens inverse, et un rechargement ne perd rien.
// Les noms sont courts parce qu'ils se lisent dans la barre d'adresse.

const PARAMS: { param: string; filtre: keyof Filtres }[] = [
  { param: "marque", filtre: "marques" },
  { param: "prix", filtre: "prix" },
  { param: "age", filtre: "ages" },
  { param: "espece", filtre: "especes" },
  { param: "soin", filtre: "types_soin" },
  { param: "besoin", filtre: "besoins" },
  { param: "taille", filtre: "tailles_chien" },
  { param: "gout", filtre: "gouts" },
  { param: "proteine", filtre: "proteines" },
  { param: "couleur", filtre: "couleurs" },
  { param: "matiere", filtre: "matieres" },
  { param: "usage", filtre: "usages_jouet" },
  { param: "ta", filtre: "tailles_article" },
];

const BASCULES: { param: string; filtre: keyof Filtres }[] = [
  { param: "stock", filtre: "en_stock" },
  { param: "poste", filtre: "expediable" },
  { param: "sc", filtre: "sans_cereales" },
  { param: "mp", filtre: "monoproteine" },
];

/** L'URL à écrire. Un filtre vide ne laisse aucun paramètre derrière lui. */
export function versParams(f: Filtres): URLSearchParams {
  const p = new URLSearchParams();
  /*
   * L'onglet vient en PREMIER dans l'adresse, avant le rayon : c'est le choix le
   * plus large, et une adresse se lit comme on l'a construite.
   */
  if (f.animal) p.set("animal", f.animal);
  if (f.categorie) p.set("cat", f.categorie);
  for (const { param, filtre } of PARAMS) {
    const valeurs = f[filtre] as string[];
    if (valeurs.length > 0) p.set(param, valeurs.join(","));
  }
  for (const { param, filtre } of BASCULES) {
    if (f[filtre] === true) p.set(param, "1");
  }
  return p;
}

/**
 * Les filtres que dit l'adresse.
 *
 * Tout ce qui n'est pas reconnu est ignoré, jamais recopié : une adresse
 * bricolée à la main ne doit rien pouvoir injecter dans l'affichage.
 */
export function depuisParams(
  lire: URLSearchParams | { get(nom: string): string | null }
): Filtres {
  const valeurs = (param: string) =>
    String(lire.get(param) ?? "")
      .split(",")
      .map((v) => v.trim())
      .filter((v) => v.length > 0);

  const f: Filtres = { ...FILTRES_VIDES };

  /*
   * L'onglet, vérifié contre le vocabulaire : « ?animal=licorne » ramène à
   * « Tous » plutôt que de vider la grille sans rien dire. Le brief demande
   * qu'un lien vers un onglet devenu vide ne produise AUCUNE erreur — un onglet
   * inconnu et un onglet vide se traitent donc pareil, et c'est la page qui
   * décide de ne pas afficher un onglet sans article.
   */
  const animal = String(lire.get("animal") ?? "").trim();
  f.animal = (ANIMAUX as readonly string[]).includes(animal) ? animal : null;

  const cat = String(lire.get("cat") ?? "").trim();
  f.categorie = cat.length > 0 ? cat : null;

  for (const { param, filtre } of PARAMS) {
    const brut = valeurs(param);
    if (filtre === "tailles_article") {
      f.tailles_article = TAILLES_ARTICLE.map((t) => t.valeur).filter((t) => brut.includes(t));
      continue;
    }
    if (filtre === "prix") {
      f.prix = TRANCHES_PRIX.map((t) => t.valeur).filter((t) => brut.includes(t));
      continue;
    }
    if (filtre === "marques") {
      // La marque est libre : elle se recopie telle quelle, sans vocabulaire
      // à vérifier. Rien ne l'interprète, elle ne sert qu'à comparer.
      f.marques = [...new Set(brut)];
      continue;
    }
    const groupe = LISTES.find((l) => l.filtre === filtre)!.groupe;
    (f[filtre] as string[]) =
      groupe === "couleurs"
        ? [...new Set(brut.map((v) => v.toLowerCase()))]
        : GROUPES[groupe].valeurs.map((v) => v.valeur).filter((v) => brut.includes(v));
  }

  for (const { param, filtre } of BASCULES) {
    (f[filtre] as boolean) = lire.get(param) === "1";
  }
  return f;
}

// ── Les onglets d'animal (APP 27) ───────────────────────────────────────────

export type OngletAnimal = {
  /** null pour « Tous ». */
  valeur: string | null;
  libelle: string;
  nombre: number;
  actif: boolean;
};

/**
 * Les onglets à afficher, et la règle qui décide s'il y en a.
 *
 * Décision de Sabrina : un onglet n'apparaît QUE s'il contient au moins un
 * article. Il apparaît tout seul quand elle active le premier article de cet
 * animal, et disparaît quand le dernier est désactivé. Aucun onglet vide, jamais
 * — un onglet qu'on ouvre pour trouver une page blanche est pire qu'un onglet
 * absent, parce qu'il a fait espérer.
 *
 * ET, conséquence de la même règle : tant qu'un SEUL animal a des articles, il
 * n'y a aucun onglet du tout. La boutique reste exactement comme aujourd'hui,
 * sans une rangée d'onglets qui ne mènerait nulle part. C'est le cas le jour de
 * l'ouverture, où tout est pour chiens.
 *
 * Les articles passés ici sont ceux que cette personne a le droit de voir : ce
 * qui est masqué ou retiré ne compte pas, donc ne fait pas apparaître d'onglet.
 */
export function ongletsAnimaux(
  articles: ArticleFiltrable[],
  animalChoisi: string | null
): OngletAnimal[] {
  const compte = new Map<string, number>();
  for (const a of articles) {
    for (const animal of a.animaux ?? []) {
      compte.set(animal, (compte.get(animal) ?? 0) + 1);
    }
  }

  const presents = ANIMAUX.filter((a) => (compte.get(a) ?? 0) > 0);
  // Un seul animal servi : aucun onglet. Deux, alors « Tous » a un sens.
  if (presents.length < 2) return [];

  return [
    { valeur: null, libelle: "Tous", nombre: articles.length, actif: animalChoisi === null },
    ...presents.map((a) => ({
      valeur: a as string,
      libelle: libelleValeur("animaux", a),
      nombre: compte.get(a) ?? 0,
      actif: animalChoisi === a,
    })),
  ];
}

/**
 * L'onglet réellement retenu : celui demandé s'il existe encore, sinon « Tous ».
 *
 * Un lien envoyé par courriel, ou un signet, peut viser un onglet dont le
 * dernier article vient d'être désactivé. Il ramène alors à « Tous » sans
 * erreur et sans page blanche — la cliente voit la boutique, pas un message.
 */
export function ongletRetenu(
  articles: ArticleFiltrable[],
  demande: string | null
): string | null {
  if (!demande) return null;
  const onglets = ongletsAnimaux(articles, demande);
  return onglets.some((o) => o.valeur === demande) ? demande : null;
}
