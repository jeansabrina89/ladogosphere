import { ANIMAUX, libelleValeur } from "@/src/lib/etiquettesArticles";
import { CATEGORIES_ARTICLE, libelleCategorieArticle, ordreCategorie } from "@/src/lib/boutiqueLogique";

/**
 * La boutique en ligne à trois niveaux : l'animal, puis le rayon, puis la liste.
 *
 * ── POURQUOI TROIS NIVEAUX ────────────────────────────────────────────────
 *
 * Près de huit cents articles derrière une barre d'onglets : une cliente qui
 * cherche une litière voyait d'abord des croquettes pour chien. Le magasin, lui,
 * se parcourt dans l'ordre inverse — on va au rayon des chats, puis aux litières.
 * L'écran suit maintenant ce chemin.
 *
 * ── TOUT PASSE PAR L'ADRESSE ──────────────────────────────────────────────
 *
 * Chaque encadré est un LIEN. Pas de JavaScript obligatoire, un lien qui se
 * partage, un retour arrière qui fait ce qu'on attend. C'est aussi ce qui rend
 * ce module purement calculatoire : il reçoit une adresse et rend un niveau.
 *
 * ── LA COMPATIBILITÉ EST UNE RÈGLE, PAS UN BONUS ──────────────────────────
 *
 * Des adresses circulent déjà : dans les e-mails d'alerte de retour en stock,
 * dans les liens du site, dans les favoris. Aucune ne doit tomber sur une page
 * vide ou une erreur. Un animal inconnu ou fermé ramène au niveau 1 ; un rayon
 * sans article pour cet animal ramène au niveau 2.
 */

export type NiveauCatalogue = 1 | 2 | 3;

/** Ce que le module a besoin de savoir d'un article. */
export type ArticleClassable = {
  categorie?: string | null;
  animaux?: string[] | null;
};

export type AdresseCatalogue = {
  animal?: string | null;
  categorie?: string | null;
  /** La recherche, dans l'adresse depuis APP 49 — comme sur le site (SITE 38). */
  q?: string | null;
  /** « Voir tous les articles » : la liste sans rayon. */
  tout?: string | null;
  /** Le nombre de filtres d'étiquettes actifs, compté par filtresCatalogueLogique. */
  nbFiltres?: number;
};

export type Encadre = {
  valeur: string;
  libelle: string;
  nombre: number;
  /** L'adresse vers laquelle l'encadré mène. */
  lien: string;
};

/** L'article vaut-il pour cet animal ? */
function pourAnimal(a: ArticleClassable, animal: string): boolean {
  return (a.animaux ?? []).includes(animal);
}

/**
 * Les animaux réellement servis : au moins un article publié ET ouvert en ligne.
 *
 * La liste reçue est CELLE de la boutique — la même requête que la grille — et
 * elle a déjà écarté les animaux fermés (APP 48). C'est ce qui garantit que le
 * nombre d'un encadré est exactement celui que la liste montrera.
 */
export function animauxServis(articles: readonly ArticleClassable[]): string[] {
  const compte = compterParAnimal(articles);
  return ANIMAUX.filter((a) => (compte.get(a) ?? 0) > 0);
}

export function compterParAnimal(articles: readonly ArticleClassable[]): Map<string, number> {
  const compte = new Map<string, number>();
  for (const a of articles) {
    for (const animal of a.animaux ?? []) {
      // Un article chien ET chat compte dans les deux : c'est le même article,
      // rangé à deux endroits, et la cliente le trouvera par l'un ou par l'autre.
      compte.set(animal, (compte.get(animal) ?? 0) + 1);
    }
  }
  return compte;
}

/**
 * L'animal retenu : celui demandé s'il est servi, sinon aucun.
 *
 * Un animal inconnu — « licorne » — et un animal fermé en ligne se traitent
 * pareil : on ne le retient pas, et l'écran revient au niveau 1. Afficher une
 * grille vide avec un fil « Boutique › Furets » serait pire qu'un retour en
 * arrière : la cliente croirait que la boutique est vide.
 */
export function animalRetenu(
  demande: string | null | undefined,
  articles: readonly ArticleClassable[],
): string | null {
  const a = (demande ?? "").trim();
  if (!a || !(ANIMAUX as readonly string[]).includes(a)) return null;
  return animauxServis(articles).includes(a) ? a : null;
}

/** Le rayon retenu : celui demandé s'il a un article pour cet animal. */
export function rayonRetenu(
  demande: string | null | undefined,
  articles: readonly ArticleClassable[],
  animal: string | null,
): string | null {
  const c = (demande ?? "").trim();
  if (!c) return null;
  const connus = new Set(CATEGORIES_ARTICLE.map((x) => x.valeur as string));
  if (!connus.has(c)) return null;
  const pertinents = animal ? articles.filter((a) => pourAnimal(a, animal)) : articles;
  return pertinents.some((a) => (a.categorie ?? "") === c) ? c : null;
}

export type ChoixNiveau = {
  niveau: NiveauCatalogue;
  /** L'animal RETENU, jamais celui demandé. */
  animal: string | null;
  /** Le rayon RETENU. */
  categorie: string | null;
  /** La recherche, nettoyée. */
  q: string;
};

/**
 * Quel niveau montrer, pour cette adresse et ce catalogue.
 *
 * L'ordre des règles compte : une recherche ou un filtre l'emporte sur tout —
 * quelqu'un qui cherche veut voir des articles, pas des encadrés. C'est la même
 * règle qu'à la liste d'administration, où chercher déplie les rayons.
 */
export function choisirNiveau(
  adresse: AdresseCatalogue,
  articles: readonly ArticleClassable[],
): ChoixNiveau {
  const q = (adresse.q ?? "").trim();
  const animal = animalRetenu(adresse.animal, articles);
  const categorie = rayonRetenu(adresse.categorie, articles, animal);
  const filtres = adresse.nbFiltres ?? 0;

  // Chercher, filtrer, choisir un rayon ou demander « tout » : on veut la liste.
  if (q !== "" || filtres > 0 || categorie || adresse.tout === "1") {
    return { niveau: 3, animal, categorie, q };
  }

  if (animal) return { niveau: 2, animal, categorie: null, q };

  /*
   * UN SEUL ANIMAL SERVI : on saute le niveau 1.
   *
   * Une grille d'un seul encadré ne fait pas choisir, elle fait cliquer pour
   * rien. C'est le cas du jour où la boutique n'aura que des chiens — ou de
   * celui où Sabrina n'ouvrira qu'un animal en ligne.
   */
  const servis = animauxServis(articles);
  if (servis.length === 1) return { niveau: 2, animal: servis[0], categorie: null, q };

  return { niveau: 1, animal: null, categorie: null, q };
}

// ── Les encadrés ───────────────────────────────────────────────────────────

/** Une adresse de catalogue, construite sans paramètre vide. */
export function lienCatalogue(p: {
  animal?: string | null;
  categorie?: string | null;
  q?: string | null;
  tout?: boolean;
}): string {
  const qs = new URLSearchParams();
  if (p.animal) qs.set("animal", p.animal);
  if (p.categorie) qs.set("categorie", p.categorie);
  if (p.q && p.q.trim() !== "") qs.set("q", p.q.trim());
  if (p.tout) qs.set("tout", "1");
  const s = qs.toString();
  return s ? `/catalogue?${s}` : "/catalogue";
}

/** Niveau 1 : un encadré par animal servi, dans l'ordre du vocabulaire. */
export function encadresAnimaux(articles: readonly ArticleClassable[]): Encadre[] {
  const compte = compterParAnimal(articles);
  return ANIMAUX.filter((a) => (compte.get(a) ?? 0) > 0).map((a) => ({
    valeur: a as string,
    libelle: libelleValeur("animaux", a),
    nombre: compte.get(a) ?? 0,
    lien: lienCatalogue({ animal: a }),
  }));
}

/**
 * Niveau 2 : un encadré par rayon ayant un article pour cet animal.
 *
 * L'ordre du MAGASIN, comme partout : ni l'alphabet, ni le nombre d'articles.
 * Un rayon vide n'est pas affiché — un encadré « 0 article » se clique une fois
 * et déçoit une fois.
 */
export function encadresRayons(
  articles: readonly ArticleClassable[],
  animal: string,
): Encadre[] {
  const compte = new Map<string, number>();
  for (const a of articles) {
    if (!pourAnimal(a, animal)) continue;
    const c = a.categorie ?? "";
    if (!c) continue;
    compte.set(c, (compte.get(c) ?? 0) + 1);
  }

  const connus = new Set(CATEGORIES_ARTICLE.map((x) => x.valeur as string));
  return [...compte.entries()]
    .filter(([c]) => connus.has(c))
    .sort((x, y) => ordreCategorie(x[0]) - ordreCategorie(y[0]))
    .map(([valeur, nombre]) => ({
      valeur,
      libelle: libelleCategorieArticle(valeur),
      nombre,
      lien: lienCatalogue({ animal, categorie: valeur }),
    }));
}

// ── Le fil d'Ariane ────────────────────────────────────────────────────────

export type Miette = { libelle: string; lien: string | null };

/**
 * Le fil, qui remplace les onglets au niveau 3.
 *
 * La dernière miette n'a PAS de lien : elle désigne la page où l'on est, et un
 * lien vers soi-même ne mène nulle part tout en promettant le contraire.
 *
 * Quand un seul animal est servi, le fil commence à l'animal : une miette
 * « Boutique » ramènerait au niveau 2 du même animal, c'est-à-dire ici.
 */
export function filAriane(p: {
  animal: string | null;
  categorie: string | null;
  q: string;
  unSeulAnimal: boolean;
}): Miette[] {
  const miettes: Miette[] = [];
  if (!p.unSeulAnimal) miettes.push({ libelle: "Boutique", lien: "/catalogue" });

  if (p.animal) {
    miettes.push({
      libelle: libelleValeur("animaux", p.animal),
      lien: lienCatalogue({ animal: p.animal }),
    });
  }
  if (p.categorie) {
    miettes.push({
      libelle: libelleCategorieArticle(p.categorie),
      lien: lienCatalogue({ animal: p.animal, categorie: p.categorie }),
    });
  }
  if (p.q !== "") {
    miettes.push({ libelle: `« ${p.q} »`, lien: null });
  }

  // La dernière désigne la page courante : elle perd son lien.
  if (miettes.length > 0) miettes[miettes.length - 1] = { ...miettes[miettes.length - 1], lien: null };
  return miettes;
}
