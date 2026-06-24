// Logique comptable pure des abonnements (cartes journees prepayees). Idempotente, sans effet de bord.
const COMPTE_LIQUIDITE: Record<string, string> = {
  cash: "1000", virement: "1020", twint: "1021", stripe: "1021", avoir: "2035",
};
const COMPTE_LIABILITE = "2031";
const COMPTE_PRODUIT = "3000";
const r2 = (n: number) => Math.round(n * 100) / 100;

export type AbonnementForCompta = {
  paye: boolean;
  mode_paiement?: string | null;
  prix_paye: number | string;
  jours_total: number;
  jours_termines: number;
  expire: boolean;
};
export type LigneExistante = { compte_numero: string; debit: number | string; credit: number | string };
export type LigneEcriture = { compte: string; debit: number; credit: number };

export function calculerLignesAbonnement(
  abo: AbonnementForCompta,
  dejaLignes: LigneExistante[],
): LigneEcriture[] {
  const cible: Record<string, number> = {};
  const add = (compte: string, montant: number) => { cible[compte] = r2((cible[compte] ?? 0) + montant); };

  if (abo.paye) {
    const prix = r2(Number(abo.prix_paye));
    const liq = COMPTE_LIQUIDITE[abo.mode_paiement ?? ""] ?? "1020";
    add(liq, prix);
    const total = abo.jours_total > 0 ? abo.jours_total : 11;
    const jours = Math.max(0, Math.min(abo.jours_termines, total));
    let rec = abo.expire ? prix : r2((prix * jours) / total);
    if (rec > prix) rec = prix;
    add(COMPTE_PRODUIT, -rec);
    add(COMPTE_LIABILITE, -r2(prix - rec));
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
