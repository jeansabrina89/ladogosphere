// Logique comptable pure (sans dependances Supabase) — importee par comptaResa.ts et les tests.

const COMPTE_LIQUIDITE: Record<string, string> = {
  cash: "1000", virement: "1020", twint: "1021", stripe: "1021", avoir: "2035",
};
const COMPTE_PRODUIT: Record<string, string> = {
  sejour: "3000", journee: "3000", garderie: "3000", essai: "3000",
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export type ResaForCompta = {
  statut: string;
  type_reservation: string;
  montant_final?: number | string | null;
  montant_calcule?: number | string | null;
};

export type MouvementForCompta = {
  mode: string;
  montant: number | string;
};

export type LigneExistante = {
  compte_numero: string;
  debit: number | string;
  credit: number | string;
};

export type LigneEcriture = {
  compte: string;
  debit: number;
  credit: number;
};

/**
 * Calcule les lignes d'ecriture (delta) a poster pour amener la comptabilite
 * de la reservation a l'etat cible, compte tenu de ce qui est deja poste.
 * Fonction pure, sans effet de bord, idempotente.
 */
export function calculerLignesEcriture(
  resa: ResaForCompta,
  mouvements: MouvementForCompta[],
  dejaLignes: LigneExistante[],
): LigneEcriture[] {
  const cible: Record<string, number> = {};
  const add = (compte: string, montant: number) => {
    cible[compte] = r2((cible[compte] ?? 0) + montant);
  };

  let liquideTotal = 0;
  for (const m of mouvements) {
    const compte = COMPTE_LIQUIDITE[m.mode];
    if (!compte) continue;
    const montant = Number(m.montant);
    add(compte, montant);
    liquideTotal += montant;
  }
  liquideTotal = r2(liquideTotal);

  const total = r2(Number(resa.montant_final ?? resa.montant_calcule ?? 0));
  const P = resa.statut === "terminee" ? total : 0;
  const CP = COMPTE_PRODUIT[resa.type_reservation] ?? "3000";

  if (P > 0) {
    add(CP, -P);
    add("1100", r2(P - liquideTotal));
  } else {
    add("2030", -liquideTotal);
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
