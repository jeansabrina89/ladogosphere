/**
 * Ce qu'une trace de modification retient : ce qui a changé, rien d'autre.
 *
 * Recopier toute la fiche avant et après noierait le changement dans vingt
 * champs identiques. On garde, pour chaque champ qui a bougé, sa valeur avant
 * et sa valeur après.
 *
 * Module pur.
 */

const normaliser = (v: unknown): unknown => {
  if (v === undefined || v === "") return null;
  if (typeof v === "number" && Number.isNaN(v)) return null;
  return v;
};

const egaux = (a: unknown, b: unknown): boolean => {
  const x = normaliser(a);
  const y = normaliser(b);
  if (x === y) return true;
  // « 12 » en base et 12 saisi : c'est la même valeur.
  if ((typeof x === "number" || typeof y === "number") && x !== null && y !== null) {
    return Number(x) === Number(y);
  }
  return JSON.stringify(x) === JSON.stringify(y);
};

/**
 * Les champs de `apres` dont la valeur diffère de `avant`.
 * Rend `null` s'il n'y a aucun changement : il n'y a alors rien à tracer.
 */
export function ecart(
  avant: Record<string, unknown> | null | undefined,
  apres: Record<string, unknown>,
): { avant: Record<string, unknown>; apres: Record<string, unknown> } | null {
  const a: Record<string, unknown> = {};
  const b: Record<string, unknown> = {};
  for (const cle of Object.keys(apres)) {
    const ancien = avant?.[cle];
    if (!egaux(ancien, apres[cle])) {
      a[cle] = normaliser(ancien) ?? null;
      b[cle] = normaliser(apres[cle]) ?? null;
    }
  }
  return Object.keys(b).length === 0 ? null : { avant: a, apres: b };
}

/** « 09:00:00 » et « 09:00 » : la même heure. */
const heureCourte = (h: unknown): string | null =>
  typeof h === "string" && h.trim() !== "" ? h.slice(0, 5) : null;

/** Les champs d'une réservation que sa modification peut toucher. */
export const CHAMPS_MODIFICATION_RESERVATION = [
  "statut", "box_id", "commentaire_admin", "heure_arrivee", "heure_depart", "date_debut", "date_fin",
] as const;

/**
 * Ce qui a bougé sur une réservation modifiée. Les heures se comparent comme
 * elles se lisent : la base rend « 09:00:00 » quand le formulaire envoie « 09:00 ».
 * Le type de séjour n'y est pas : sa requalification a sa propre trace, motivée.
 */
export function ecartModificationReservation(
  avant: Record<string, unknown> | null | undefined,
  apres: Partial<Record<(typeof CHAMPS_MODIFICATION_RESERVATION)[number], unknown>>,
): ReturnType<typeof ecart> {
  const lire = (r: Record<string, unknown> | null | undefined) =>
    Object.fromEntries(
      CHAMPS_MODIFICATION_RESERVATION.map((c) => [
        c,
        c === "heure_arrivee" || c === "heure_depart" ? heureCourte(r?.[c]) : r?.[c] ?? null,
      ])
    );
  return ecart(lire(avant), lire(apres as Record<string, unknown>));
}
