export type ResaMontant = {
  montant_calcule?: number | string | null;
  montant_final?: number | string | null;
  ajustement_manuel?: number | string | null;
  montant_paye?: number | string | null;
  /** Reste à payer DÉRIVÉ des factures (src/lib/paiementReservation.ts). */
  montant_restant?: number | string | null;
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

/**
 * Ce qui reste à payer. Le reste DÉRIVÉ des factures fait foi dès qu'il est
 * calculé : un avoir peut avoir effacé la dette sans que le prix ne bouge. Le
 * repli « prix moins payé » ne sert qu'à une réservation jamais recalculée.
 */
export function resteAPayer(resa: ResaMontant): number {
  if (resa.montant_restant !== null && resa.montant_restant !== undefined && resa.montant_restant !== "") {
    return toNum(resa.montant_restant);
  }
  return montantDuReservation(resa) - toNum(resa.montant_paye);
}
