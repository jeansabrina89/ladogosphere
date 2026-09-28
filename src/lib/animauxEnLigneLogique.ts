import { ANIMAUX, type Animal } from "@/src/lib/etiquettesArticles";

/**
 * Quels animaux sont vendus EN LIGNE — la règle, sans la base.
 *
 * ── CE QUE CE RÉGLAGE FAIT, ET CE QU'IL NE FAIT PAS ───────────────────────
 *
 * Décocher un animal le retire de la boutique en ligne : son onglet, ses
 * articles, ses filtres, sur le site comme dans l'application. Il ne touche
 * RIEN au comptoir — la caisse, l'inventaire, la liste d'administration et les
 * statistiques continuent de voir ces articles, qui se vendent toujours en
 * magasin. C'est une décision de vitrine, pas de catalogue.
 *
 * ── POURQUOI UN REPLI SUR LES SEPT ────────────────────────────────────────
 *
 * Une valeur absente ou illisible rend TOUS les animaux, jamais aucun. Vider la
 * boutique sur une clé effacée par erreur serait la pire des deux lectures :
 * personne ne verrait la cause, tout le monde verrait l'effet. La base tient la
 * même ligne — une contrainte CHECK y refuse la liste vide.
 */

/** La clé dans `parametres`. Une seule écriture, ici. */
export const CLE_ANIMAUX_EN_LIGNE = "animaux_en_ligne";

/** Tous les animaux, dans l'ordre du vocabulaire. Le repli, et le défaut. */
export const TOUS_LES_ANIMAUX: readonly string[] = ANIMAUX;

/**
 * La liste ouverte, lue depuis la valeur brute de `parametres`.
 *
 * Tolérante par construction : ce qui n'est pas un tableau JSON d'animaux
 * connus retombe sur les sept. Les doublons sont écartés et l'ordre du
 * vocabulaire est rendu, pour que deux lectures se comparent.
 */
export function lireAnimauxOuverts(brut: string | null | undefined): string[] {
  if (typeof brut !== "string" || brut.trim() === "") return [...TOUS_LES_ANIMAUX];
  let lu: unknown;
  try {
    lu = JSON.parse(brut);
  } catch {
    return [...TOUS_LES_ANIMAUX];
  }
  if (!Array.isArray(lu)) return [...TOUS_LES_ANIMAUX];
  const connus = lu.filter(
    (x): x is Animal => typeof x === "string" && (ANIMAUX as readonly string[]).includes(x),
  );
  const uniques = [...new Set(connus)];
  if (uniques.length === 0) return [...TOUS_LES_ANIMAUX];
  return ANIMAUX.filter((a) => uniques.includes(a));
}

/** Ce qu'on écrit en base : l'ordre du vocabulaire, sans doublon. */
export function ecrireAnimauxOuverts(animaux: readonly string[]): string {
  return JSON.stringify(ANIMAUX.filter((a) => animaux.includes(a)));
}

export type RefusAnimaux = { ok: false; message: string };
export type SaisieAnimaux = { ok: true; animaux: string[]; valeur: string };

/**
 * Ce que l'écran a coché, validé.
 *
 * Deux refus, et deux seulement : une valeur qui n'est pas un animal connu — on
 * ne devine pas ce qu'elle voulait dire — et la liste vide, qui fermerait la
 * boutique entière d'un enregistrement.
 */
export function validerAnimauxOuverts(coches: readonly string[]): SaisieAnimaux | RefusAnimaux {
  const inconnus = coches.filter((a) => !(ANIMAUX as readonly string[]).includes(a));
  if (inconnus.length > 0) {
    return { ok: false, message: `Animal inconnu : ${inconnus[0]}.` };
  }
  const retenus = ANIMAUX.filter((a) => coches.includes(a));
  if (retenus.length === 0) {
    return {
      ok: false,
      message: "Gardez au moins un animal : sans cela, la boutique en ligne n'aurait plus rien à montrer.",
    };
  }
  return { ok: true, animaux: [...retenus], valeur: JSON.stringify(retenus) };
}

/** L'article a-t-il au moins un animal ouvert ? Sans animal : non. */
export function articleOuvertEnLigne(
  animauxDeLArticle: readonly string[] | null | undefined,
  ouverts: readonly string[],
): boolean {
  return (animauxDeLArticle ?? []).some((a) => ouverts.includes(a));
}

/**
 * Les animaux de l'article RÉDUITS aux ouverts.
 *
 * C'est ce que la vitrine publie, et ce que l'application doit montrer : un
 * article « oiseau + faune » dont la faune est fermée n'apparaît que sous
 * Oiseaux. Publier les deux ferait naître un onglet « Faune sauvage » qui ne
 * contiendrait que ce qu'on a justement décidé de ne pas vendre là.
 */
export function animauxOuvertsDeLArticle(
  animauxDeLArticle: readonly string[] | null | undefined,
  ouverts: readonly string[],
): string[] {
  return (animauxDeLArticle ?? []).filter((a) => ouverts.includes(a));
}

/** La phrase d'aide de la carte des réglages. Écrite une fois. */
export const AIDE_ANIMAUX_EN_LIGNE =
  "Un animal décoché disparaît de la boutique en ligne (application et site). " +
  "Ses articles restent vendables au comptoir.";
