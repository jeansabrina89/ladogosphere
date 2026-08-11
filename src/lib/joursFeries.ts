// Jours fériés valaisans, calculés génériquement pour toute année.
// Fonction pure, sans dépendance externe ni base de données.

const pad = (n: number): string => String(n).padStart(2, "0");

/**
 * Dimanche de Pâques (calendrier grégorien) — algorithme anonyme de
 * Meeus/Butcher. Retourne { mois: 3|4, jour }.
 */
function dimanchePaques(annee: number): { mois: number; jour: number } {
  const a = annee % 19;
  const b = Math.floor(annee / 100);
  const c = annee % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31); // 3 = mars, 4 = avril
  const jour = ((h + l - 7 * m + 114) % 31) + 1;
  return { mois, jour };
}

// Ajoute `delta` jours à une date (UTC pour éviter tout décalage de fuseau)
// et renvoie "YYYY-MM-DD".
function ajouterJours(annee: number, mois: number, jour: number, delta: number): string {
  const d = new Date(Date.UTC(annee, mois - 1, jour));
  d.setUTCDate(d.getUTCDate() + delta);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/**
 * Jours fériés valaisans de `annee`, format "YYYY-MM-DD", triés en ordre croissant.
 * 7 dates fixes + 2 mobiles (Ascension = Pâques + 39 j, Fête-Dieu = Pâques + 60 j).
 */
export function getJoursFeries(annee: number): string[] {
  const paques = dimanchePaques(annee);
  const ascension = ajouterJours(annee, paques.mois, paques.jour, 39); // Pâques + 39 j
  const feteDieu = ajouterJours(annee, paques.mois, paques.jour, 60);  // Pâques + 60 j

  const fixes = [
    `${annee}-01-01`, // Nouvel An
    `${annee}-03-19`, // Saint-Joseph
    `${annee}-08-01`, // Fête nationale
    `${annee}-08-15`, // Assomption
    `${annee}-11-01`, // Toussaint
    `${annee}-12-08`, // Immaculée Conception
    `${annee}-12-25`, // Noël
  ];

  return [...fixes, ascension, feteDieu].sort();
}
