export const HEURES_JOURNEE_PLEINE = 8.5;
export const JOURS_PLEIN_TEMPS = 5;
export const HEURES_HEBDO_PLEIN = HEURES_JOURNEE_PLEINE * JOURS_PLEIN_TEMPS; // 42.5
export const ABSENCES_CREDITEES = ['vacances', 'maladie', 'accident', 'militaire', 'ferie'] as const;

/**
 * Nombre de jours travaillés pour un employé durant une semaine donnée.
 *
 * base = taux / 20 :
 *   100→5, 80→4, 60→3, 40→2  (entier, constant chaque semaine)
 *   90→4.5, 70→3.5, 50→2.5, 30→1.5  (.5 → plancher/plafond selon parité)
 *
 * Pour les taux « à la demie », la moyenne sur deux semaines = base exacte.
 * Ex. 50% : semaine paire→2j, semaine impaire→3j, moyenne=2.5
 */
export function joursTravaillesSemaine(taux: number, indexSemaine: number): number {
  const base = taux / 20;
  if (Number.isInteger(base)) return base;
  // base se termine par .5 : alterner plancher/plafond
  return indexSemaine % 2 === 0 ? Math.floor(base) : Math.ceil(base);
}

/**
 * Moyenne des jours travaillés par semaine (pour le calcul du coût des vacances,
 * indépendamment de l'index de semaine).
 */
export function moyenneJoursTravaillesSemaine(taux: number): number {
  return taux / 20;
}
