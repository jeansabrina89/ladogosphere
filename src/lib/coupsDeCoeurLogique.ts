/**
 * Les coups de cœur du moment (APP 62).
 *
 * Une case sur la fiche article, choisie à la main par Sabrina, que le site
 * vitrine lit dans `articles_vitrine.coup_de_coeur` pour en faire une section
 * en haut de la boutique. Aucune limite n'est imposée : au-delà de huit, la
 * liste PRÉVIENT — la section devient longue sur un téléphone — mais ne bloque
 * pas. C'est une affaire de goût, pas de règle.
 *
 * Fonctions pures : l'écran et les tests lisent les mêmes phrases.
 */

/** Au-delà, la section devient longue sur téléphone. */
export const SEUIL_COUPS_DE_COEUR = 8;

export const LIBELLE_CASE_COUP_DE_COEUR = "❤️ Coup de cœur du moment";

export const AIDE_COUP_DE_COEUR =
  "Mis en avant en haut de la boutique en ligne. 4 à 8 articles, c'est l'idéal.";

export const AVERTISSEMENT_COUPS_DE_COEUR =
  "Au-delà de 8, la section devient longue sur téléphone.";

/** « 1 coup de cœur », « 3 coups de cœur », « Aucun coup de cœur ». */
export function libelleCompteCoupsDeCoeur(n: number): string {
  if (n <= 0) return "Aucun coup de cœur";
  return n === 1 ? "1 coup de cœur" : `${n} coups de cœur`;
}

/** L'avertissement doux, ou rien. */
export function avertissementCoupsDeCoeur(n: number): string | null {
  return n > SEUIL_COUPS_DE_COEUR ? AVERTISSEMENT_COUPS_DE_COEUR : null;
}

export type GesteCoupDeCoeur = "coup_de_coeur_ajoute" | "coup_de_coeur_retire";

/**
 * Le geste à inscrire au journal, ou rien si la case n'a pas bougé.
 *
 * Une création case cochée est un ajout ; une création case vide ne dit rien —
 * il n'y a rien eu à retirer.
 */
export function gesteCoupDeCoeur(
  avant: boolean | null | undefined,
  apres: boolean,
): GesteCoupDeCoeur | null {
  const etait = avant === true;
  if (etait === apres) return null;
  return apres ? "coup_de_coeur_ajoute" : "coup_de_coeur_retire";
}
