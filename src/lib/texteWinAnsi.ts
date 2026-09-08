/**
 * Ce qu'une police PDF de base sait vraiment écrire.
 *
 * Les documents sont composés en Helvetica avec `/WinAnsiEncoding`, sans table
 * de différences : tout caractère absent de WinAnsi ne s'imprime PAS — il ne
 * lève aucune erreur, il disparaît simplement. C'est le pire des deux mondes.
 *
 * Le cas qui coûte cher est le SIGNE MOINS typographique « − » (U+2212), celui
 * qu'on écrit à l'écran dans « Remise membre −10 % ». Absent de WinAnsi, il
 * s'évapore, et la facture annonce « Remise membre 10 % » — qui se lit comme
 * une majoration. On le remplace donc par le trait d'union, qui, lui, existe.
 *
 * On ne change pas les textes à la source : « − » reste le bon caractère à
 * l'écran. C'est la sortie PDF qui s'adapte à sa police, et nulle part ailleurs.
 *
 * Fonction pure : ni base, ni requête.
 */

const REMPLACEMENTS: [RegExp, string][] = [
  [/−/g, "-"],   // signe moins
  [/[–—]/g, "-"], // demi-cadratin, cadratin
  [/…/g, "..."], // points de suspension
  [/[‘’]/g, "'"], // apostrophes courbes hors WinAnsi… par sécurité
  [/[  ]/g, " "], // espaces insécables fines
];

/** Le même texte, écrit avec ce que la police sait imprimer. */
export function pourPdf(texte: string | null | undefined): string {
  let s = String(texte ?? "");
  for (const [de, vers] of REMPLACEMENTS) s = s.replace(de, vers);
  return s;
}
