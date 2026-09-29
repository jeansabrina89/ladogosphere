/**
 * Les heures d'un séjour sont obligatoires (APP 42).
 *
 * ── POURQUOI, ET CE QUE ÇA COÛTAIT ────────────────────────────────────────
 *
 * `compterSejour` (calculTarif.ts) n'ajoute la journée d'arrivée — arrivée
 * avant midi — et la journée de départ — départ à midi ou après — que si les
 * DEUX heures sont renseignées. Une heure vide ne fait pas une erreur : elle
 * fait une journée qui disparaît du décompte, donc une nuit facturée en moins.
 *
 * Personne ne le voit : la facture est cohérente avec elle-même, simplement
 * plus courte d'un jour. Au relevé du 29.09.2026, TREIZE séjours sur quinze
 * avaient au moins une heure manquante.
 *
 * Le calcul n'est pas touché — il a raison de se taire quand il ne sait pas.
 * C'est la SAISIE qui ne doit plus laisser passer le vide.
 */

export const REFUS_HEURES_SEJOUR = "Indiquez l'heure d'arrivée et l'heure de départ.";

/** Une heure vraiment saisie : « 08:30 ». Ni vide, ni espaces. */
function heureSaisie(h: string | null | undefined): boolean {
  return typeof h === "string" && /^\d{2}:\d{2}/.test(h.trim());
}

/**
 * Ce qui empêche d'enregistrer, ou null.
 *
 * SEUL le séjour est concerné : une journée de garderie et une journée d'essai
 * tiennent dans la journée, et leur décompte ne dépend pas de l'heure.
 */
export function refusHeuresSejour(
  typeReservation: string | null | undefined,
  heureArrivee: string | null | undefined,
  heureDepart: string | null | undefined,
): string | null {
  if (typeReservation !== "sejour") return null;
  if (heureSaisie(heureArrivee) && heureSaisie(heureDepart)) return null;
  return REFUS_HEURES_SEJOUR;
}
