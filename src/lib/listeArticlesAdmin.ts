import { ANIMAUX, libelleValeur } from "@/src/lib/etiquettesArticles";
import { CATEGORIES_ARTICLE, libelleCategorieArticle, ordreCategorie } from "@/src/lib/boutiqueLogique";

/**
 * Le classement de la liste d'administration : d'abord l'animal, puis le rayon.
 *
 * ── POURQUOI CE MODULE EXISTE ─────────────────────────────────────────────
 *
 * Avec près de huit cents articles, un seul tableau ne se lit plus : on y
 * cherche un collier parmi des sacs de croquettes. Sabrina voulait le MÊME
 * classement que sa boutique en ligne — l'animal, puis le rayon — pour ne pas
 * avoir deux façons de ranger les mêmes articles selon l'écran où on les
 * regarde.
 *
 * La logique vit ici, hors de l'écran : c'est ce qui la rend éprouvable sans
 * rendre une page de six cents lignes.
 *
 * ── CE QUI NE CHANGE PAS ──────────────────────────────────────────────────
 *
 * `CatalogueStock` sert AUSSI les fournitures de l'atelier, qui n'ont ni
 * animal ni rayon de magasin. Rien de ce module ne leur est appliqué : la page
 * de l'atelier n'en appelle rien, et le composant garde son rendu d'origine
 * quand on ne lui donne ni onglets ni groupes.
 */

/** Le minimum dont ce module a besoin. Ni le prix, ni le stock ne comptent ici. */
export type ArticleClassable = {
  id: string;
  nom: string;
  categorie: string;
  animaux?: string[] | null;
};

export type OngletAnimal = {
  /** `null` : l'onglet « Tous ». */
  valeur: string | null;
  libelle: string;
  nombre: number;
  actif: boolean;
};

/** L'article vaut-il pour cet animal ? `null` : pour tous, donc oui. */
export function articleDeLAnimal(a: ArticleClassable, animal: string | null): boolean {
  if (!animal) return true;
  return (a.animaux ?? []).includes(animal);
}

/**
 * L'onglet réellement retenu : celui demandé s'il a des articles, sinon « Tous ».
 *
 * Un onglet inconnu — « licorne », ou « chat » écrit à la main dans l'adresse —
 * et un onglet vide se traitent pareil : on montre tout. Laisser une liste vide
 * avec aucun onglet allumé donnerait l'impression que le magasin est vide.
 */
export function animalRetenu(
  demande: string | null | undefined,
  articles: ArticleClassable[],
): string | null {
  const a = (demande ?? "").trim();
  if (!a) return null;
  if (!(ANIMAUX as readonly string[]).includes(a)) return null;
  return articles.some((x) => articleDeLAnimal(x, a)) ? a : null;
}

/**
 * Les onglets, dans l'ordre et avec les libellés d'`etiquettesArticles`.
 *
 * Ils se calculent sur les articles filtrés par TOUT SAUF l'animal : sans quoi
 * l'onglet « Chats » ferait disparaître « Chiens », et l'on ne pourrait plus en
 * sortir autrement qu'en effaçant l'adresse.
 *
 * Un article à plusieurs animaux est compté dans CHACUN de leurs onglets, et
 * une seule fois dans « Tous » : c'est le même article, rangé à deux endroits,
 * pas deux articles.
 *
 * La barre s'affiche dès qu'UN animal a des articles, même s'il est seul. Le
 * catalogue client, lui, la masque sous deux animaux — mais ici un filtre de
 * rayon peut ne laisser qu'un animal, et faire disparaître la barre à ce
 * moment-là laisserait l'onglet actif sans rien pour le désigner.
 */
export function ongletsAnimaux(
  articles: ArticleClassable[],
  animalActif: string | null,
): OngletAnimal[] {
  const compte = new Map<string, number>();
  for (const a of articles) {
    for (const animal of a.animaux ?? []) {
      compte.set(animal, (compte.get(animal) ?? 0) + 1);
    }
  }

  const presents = ANIMAUX.filter((a) => (compte.get(a) ?? 0) > 0);
  if (presents.length === 0) return [];

  return [
    { valeur: null, libelle: "Tous", nombre: articles.length, actif: animalActif === null },
    ...presents.map((a) => ({
      valeur: a as string,
      libelle: libelleValeur("animaux", a),
      nombre: compte.get(a) ?? 0,
      actif: animalActif === a,
    })),
  ];
}

export type RayonGroupe = {
  valeur: string;
  libelle: string;
  articles: ArticleClassable[];
};

/**
 * Les articles groupés par rayon, dans l'ORDRE DU MAGASIN.
 *
 * Jamais l'alphabet : c'est l'ordre des rayons décidé par Sabrina, le même que
 * celui de la boutique en ligne et de la fiche article. Un rayon vide n'est pas
 * affiché — une liste de rayons dont la moitié annonce « 0 » se parcourt plus
 * mal qu'une liste courte.
 *
 * Un rayon que le module ne connaît pas (une valeur entrée en base avant que le
 * code ne la connaisse) est rangé À LA FIN plutôt que perdu : mieux vaut un
 * article mal placé qu'un article introuvable.
 */
export function grouperParRayon<T extends ArticleClassable>(articles: T[]): {
  valeur: string; libelle: string; articles: T[];
}[] {
  const par = new Map<string, T[]>();
  for (const a of articles) {
    const liste = par.get(a.categorie) ?? [];
    liste.push(a);
    par.set(a.categorie, liste);
  }

  const connus = new Set(CATEGORIES_ARTICLE.map((c) => c.valeur as string));
  const rang = (c: string) => (connus.has(c) ? ordreCategorie(c) : Number.MAX_SAFE_INTEGER);

  return [...par.entries()]
    .sort((x, y) => rang(x[0]) - rang(y[0]) || x[0].localeCompare(y[0], "fr"))
    .map(([valeur, liste]) => ({
      valeur,
      libelle: connus.has(valeur) ? libelleCategorieArticle(valeur) : valeur,
      articles: [...liste].sort((a, b) => a.nom.localeCompare(b.nom, "fr")),
    }));
}

/**
 * Les rayons s'ouvrent-ils d'emblée ?
 *
 * Repliés par défaut : c'est tout l'intérêt: voir les rayons, pas huit cents
 * lignes. Mais quand on CHERCHE quelque chose, replier cache la réponse — il
 * faudrait deviner dans quel rayon elle se trouve avant de la voir. Et quand
 * un seul rayon reste, le replier n'économise rien.
 */
export function rayonsOuverts(p: { filtreActif: boolean; nbRayons: number }): boolean {
  return p.filtreActif || p.nbRayons <= 1;
}

/**
 * Combien de coups de cœur le site montrera (APP 62).
 *
 * Seuls les articles ACTIFS comptent : un article retiré coché « coup de cœur »
 * ne sort plus en vitrine, il n'allonge donc pas la section.
 */
export function compterCoupsDeCoeur(
  articles: { actif: boolean; coup_de_coeur?: boolean | null }[],
): number {
  return articles.filter((a) => a.actif && a.coup_de_coeur === true).length;
}
