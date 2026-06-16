export type ResaMontant = {
  montant_calcule?: number | string | null;
  montant_final?: number | string | null;
  ajustement_manuel?: number | string | null;
  montant_paye?: number | string | null;
};

const toNum = (v: unknown): number => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};

// montant_final quand renseigné est déjà le net définitif (inclut l'ajustement).
// Repli sur montant_calcule + ajustement_manuel seulement si montant_final est absent.
export function montantDuReservation(resa: ResaMontant): number {
  if (resa.montant_final !== null && resa.montant_final !== undefined && resa.montant_final !== "") {
    return toNum(resa.montant_final);
  }
  return toNum(resa.montant_calcule) + toNum(resa.ajustement_manuel);
}

export function resteAPayer(resa: ResaMontant): number {
  return montantDuReservation(resa) - toNum(resa.montant_paye);
}
