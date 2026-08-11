// Logique comptable pure des adhésions payées DIRECTEMENT (sans réservation).
// Idempotente, sans effet de bord, sans dépendance Supabase.
// Les adhésions embarquées sur une réservation sont comptabilisées via la
// réservation (cf. comptaResaLogique) — la garde anti-doublon est côté IO.

const COMPTE_LIQUIDITE: Record<string, string> = {
  cash: "1000", virement: "1020", twint: "1021",
};
const COMPTE_ADHESION = "3005";
const r2 = (n: number) => Math.round(n * 100) / 100;

export type CotisationForCompta = {
  statut?: string | null;
  mode_paiement?: string | null;
  montant?: number | string | null;
};
export type LigneExistante = { compte_numero: string; debit: number | string; credit: number | string };
export type LigneEcriture = { compte: string; debit: number; credit: number };

/**
 * Cible :
 * - statut 'payee' + mode liquide (cash/virement/twint) : débit liquidité + crédit 3005 ;
 * - sinon : cible vide → permet de contre-passer un paiement annulé (delta).
 */
export function calculerLignesCotisation(
  cotis: CotisationForCompta,
  dejaLignes: LigneExistante[],
): LigneEcriture[] {
  const cible: Record<string, number> = {};
  const add = (compte: string, montant: number) => { cible[compte] = r2((cible[compte] ?? 0) + montant); };

  if (cotis.statut === "payee") {
    const compte = COMPTE_LIQUIDITE[cotis.mode_paiement ?? ""];
    if (compte) {
      const montant = r2(Number(cotis.montant));
      if (montant > 0) {
        add(compte, montant);           // débit liquidité
        add(COMPTE_ADHESION, -montant); // crédit 3005 (produit adhésion)
      }
    }
  }

  const deja: Record<string, number> = {};
  for (const l of dejaLignes) {
    deja[l.compte_numero] = r2((deja[l.compte_numero] ?? 0) + Number(l.debit) - Number(l.credit));
  }
  const comptes = new Set<string>([...Object.keys(cible), ...Object.keys(deja)]);
  const lignes: LigneEcriture[] = [];
  for (const compte of comptes) {
    const delta = r2((cible[compte] ?? 0) - (deja[compte] ?? 0));
    if (delta > 0) lignes.push({ compte, debit: delta, credit: 0 });
    else if (delta < 0) lignes.push({ compte, debit: 0, credit: -delta });
  }
  return lignes;
}

/** Modes de paiement liquides comptabilisables directement (hors 'prochaine_resa'). */
export function estModeLiquideDirect(mode: string | null | undefined): boolean {
  return Object.prototype.hasOwnProperty.call(COMPTE_LIQUIDITE, mode ?? "");
}
