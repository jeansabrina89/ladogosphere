/**
 * Validité d'une cotisation membre : 12 mois glissants, alignés sur le 1er du
 * mois du paiement.
 *
 * Règle métier (pure, testable) :
 * - date_debut = date de paiement, SAUF si une cotisation précédente du même
 *   client se termine à une date >= date de paiement (renouvellement anticipé) :
 *   date_debut = fin précédente + 1 jour, sans perte de couverture ni doublon.
 * - date_fin = (1er jour du mois de date_debut) + 1 an - 1 jour.
 *   Autrement dit : la cotisation couvre 12 mois civils entiers à partir du
 *   mois de paiement (17.01.2025 → 31.12.2025 ; 31.08.2026 → 31.07.2027).
 *
 * Une cotisation est ACTIVE à une date D si date_debut <= D <= date_fin.
 */

export type PeriodeCotisation = { date_debut: string; date_fin: string };

/**
 * Fenêtre de renouvellement : le client peut redemander son adhésion pendant
 * les 60 derniers jours de validité (et évidemment après expiration).
 */
export const JOURS_FENETRE_RENOUVELLEMENT = 60;

/** Nombre de jours du mois (mois 1-12). */
function joursDansMois(annee: number, mois: number): number {
  return new Date(Date.UTC(annee, mois, 0)).getUTCDate();
}

/** Ajoute n jours à une date ISO "YYYY-MM-DD" (arithmétique UTC, sans fuseau). */
export function ajouterJoursISO(dateISO: string, n: number): string {
  const [a, m, j] = dateISO.slice(0, 10).split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1, j + n));
  return d.toISOString().slice(0, 10);
}

/** Nombre de jours entiers entre deux dates ISO (b - a). */
export function joursEntre(aISO: string, bISO: string): number {
  const [a1, a2, a3] = aISO.slice(0, 10).split("-").map(Number);
  const [b1, b2, b3] = bISO.slice(0, 10).split("-").map(Number);
  const ms = Date.UTC(b1, b2 - 1, b3) - Date.UTC(a1, a2 - 1, a3);
  return Math.round(ms / 86400000);
}

/**
 * Date de fin d'une cotisation démarrant le `dateDebutISO` :
 * (1er du mois) + 1 an - 1 jour = dernier jour du mois précédent, l'année suivante
 * (janvier → 31 décembre de la même année).
 */
export function finDePeriode(dateDebutISO: string): string {
  const [annee, mois] = dateDebutISO.slice(0, 10).split("-").map(Number);
  if (mois === 1) return `${annee}-12-31`;
  const anneeFin = annee + 1;
  const moisFin = mois - 1;
  const jourFin = joursDansMois(anneeFin, moisFin);
  return `${anneeFin}-${String(moisFin).padStart(2, "0")}-${String(jourFin).padStart(2, "0")}`;
}

/**
 * Période de validité d'une cotisation payée le `datePaiementISO`.
 * `finPrecedenteISO` = date_fin de la cotisation précédente du même client
 * (null/undefined si aucune, ou si elle est déjà expirée).
 */
export function calculerPeriodeCotisation(
  datePaiementISO: string,
  finPrecedenteISO?: string | null
): PeriodeCotisation {
  const paiement = datePaiementISO.slice(0, 10);
  // Renouvellement anticipé : la nouvelle période enchaîne sur la précédente.
  const enchaine = !!finPrecedenteISO && finPrecedenteISO.slice(0, 10) >= paiement;
  const date_debut = enchaine ? ajouterJoursISO(finPrecedenteISO!, 1) : paiement;
  return { date_debut, date_fin: finDePeriode(date_debut) };
}

/** "2026-01-01" → "01.01.2026" (format suisse, sans dépendance au fuseau). */
export function formatJJMMAAAA(dateISO?: string | null): string {
  if (!dateISO) return "—";
  const [a, m, j] = dateISO.slice(0, 10).split("-");
  if (!a || !m || !j) return "—";
  return `${j}.${m}.${a}`;
}

/** "du 01.01.2026 au 31.12.2026" — libellé unique de la période de validité. */
export function formatPeriodeCotisation(
  date_debut?: string | null,
  date_fin?: string | null
): string {
  if (!date_debut || !date_fin) return "période inconnue";
  return `du ${formatJJMMAAAA(date_debut)} au ${formatJJMMAAAA(date_fin)}`;
}

/** Une cotisation est-elle active à la date D ? */
export function cotisationEstActive(
  c: { date_debut?: string | null; date_fin?: string | null },
  dateISO: string
): boolean {
  if (!c.date_debut || !c.date_fin) return false;
  return c.date_debut.slice(0, 10) <= dateISO && c.date_fin.slice(0, 10) >= dateISO;
}
