const JOURS_FERIES_2026 = [
  "2026-01-01", "2026-03-19", "2026-05-14", "2026-06-04",
  "2026-08-01", "2026-08-15", "2026-11-01", "2026-12-08", "2026-12-25",
];
const JOURS_FERIES_2027 = [
  "2027-01-01", "2027-03-19", "2027-05-06", "2027-05-27",
  "2027-08-01", "2027-08-15", "2027-11-01", "2027-12-08", "2027-12-25",
];

export function getJoursFeries(annee: number): string[] {
  if (annee === 2026) return JOURS_FERIES_2026;
  if (annee === 2027) return JOURS_FERIES_2027;
  return [];
}
