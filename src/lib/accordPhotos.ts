/**
 * Accord de publication des photos (clients.photos_ok).
 *
 * Le libellé est volontairement centralisé : il a une portée juridique et doit
 * être rigoureusement identique à l'inscription et dans « Mon profil ».
 */

export const LIBELLE_ACCORD_PHOTOS =
  "J'accepte que des photos de mon chien prises pendant sa garde soient publiées " +
  "sur le site et les réseaux sociaux de La Dogosphère. Je peux changer d'avis à " +
  "tout moment dans mon profil.";

export const PRECISION_RETRAIT_ACCORD_PHOTOS =
  "Si vous retirez votre accord, nous cessons les nouvelles publications et " +
  "retirons les photos existantes dans un délai raisonnable.";

/** Libellé court pour les vues personnel (fiche client, fiche chien, listes). */
export function badgePhotos(photos_ok: boolean | null | undefined): {
  label: string;
  bg: string;
  color: string;
} {
  return photos_ok === false
    ? { label: "Photos : refusées", bg: "#FBE2DE", color: "#A8453A" }
    : { label: "Photos : OK", bg: "#DBEFEA", color: "#1F6E5B" };
}
