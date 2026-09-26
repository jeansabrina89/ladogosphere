import {
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
  ages: string[];
  besoins: string[];
  tailles_chien: string[];
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
  ages: [],
  besoins: [],
  tailles_chien: [],
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
  { filtre: "besoins", groupe: "besoins" },
  { filtre: "tailles_chien", groupe: "tailles_chien" },
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
  const propres = f.categorie
    ? champsDeCategorie(f.categorie).filter((c) => !universelles.includes(c as GroupeEtiquette))
    : [];

  for (const groupe of universelles) {
    ajouter(
      groupe,
      GROUPES[groupe].libelle,
      (a) => a[groupe] ?? [],
      (v) => GROUPES[groupe].valeurs.map((x) => x.valeur).filter((x) => v.includes(x)),
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
    const groupe = champ as GroupeEtiquette;
    ajouter(
      groupe,
      GROUPES[groupe].libelle,
      (a) => a[groupe] ?? [],
      (v) =>
        groupe === "couleurs"
          ? v.sort((x, y) => x.localeCompare(y, "fr"))
          : GROUPES[groupe].valeurs.map((x) => x.valeur).filter((x) => v.includes(x)),
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
  { param: "besoin", filtre: "besoins" },
  { param: "taille", filtre: "tailles_chien" },
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
