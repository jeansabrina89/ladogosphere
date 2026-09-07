// Logique comptable pure des mouvements d'avoir client.
// Idempotente, sans effet de bord, sans dépendance Supabase — même moteur par
// delta que les réservations et les adhésions.
//
// Les avoirs clients sont une DETTE envers le client : compte 2035.
//   - ajout manuel / geste commercial : D 3800 (diminution de produits) / C 2035 ;
//   - retrait manuel                  : l'inverse ;
//   - trop-perçu sur réservation      : D 1100 (débiteurs) / C 2035.
//
// Les types 'utilisation' et 'annulation_paiement' sont déjà portés par la
// comptabilité de la réservation (cf. comptaResaLogique) : les compter ici les
// doublerait, on les ignore donc volontairement.

export const COMPTE_AVOIRS = "2035";
export const COMPTE_DIMINUTION_PRODUITS = "3800";
export const COMPTE_DEBITEURS = "1100";

const r2 = (n: number) => Math.round(n * 100) / 100;

export type MouvementAvoirCompta = {
  type?: string | null;
  montant?: number | string | null;
};

export type LigneExistante = { compte_numero: string; debit: number | string; credit: number | string };
export type LigneEcriture = { compte: string; debit: number; credit: number };

/** Types d'avoir qui portent leur propre écriture (les autres suivent la réservation). */
export const TYPES_AVOIR_COMPTABILISES = ["ajout_manuel", "retrait_manuel", "trop_percu"] as const;

export function avoirEstComptabilise(type: string | null | undefined): boolean {
  return (TYPES_AVOIR_COMPTABILISES as readonly string[]).includes(type ?? "");
}

/**
 * Contrepartie du compte 2035 selon le type de mouvement.
 * - trop-perçu : le client a trop versé, la contrepartie est le débiteur (1100) ;
 * - ajout / retrait manuel : geste commercial, contrepartie en 3800.
 */
export function contrepartieAvoir(type: string | null | undefined): string | null {
  if (type === "trop_percu") return COMPTE_DEBITEURS;
  if (type === "ajout_manuel" || type === "retrait_manuel") return COMPTE_DIMINUTION_PRODUITS;
  return null;
}

/**
 * Écriture CIBLE d'un mouvement d'avoir, exprimée en soldes signés
 * (positif = débit net). `montant` est signé : positif = avoir accordé au
 * client (dette qui augmente), négatif = avoir repris.
 */
export function cibleAvoir(mvt: MouvementAvoirCompta): Record<string, number> {
  const cible: Record<string, number> = {};
  if (!avoirEstComptabilise(mvt.type)) return cible;

  const montant = r2(Number(mvt.montant ?? 0));
  if (montant === 0) return cible;

  const contrepartie = contrepartieAvoir(mvt.type);
  if (!contrepartie) return cible;

  // Avoir accordé (montant > 0) : la dette 2035 augmente → crédit 2035,
  // débit de la contrepartie. Reprise (montant < 0) : l'inverse.
  cible[contrepartie] = montant;
  cible[COMPTE_AVOIRS] = -montant;
  return cible;
}

/**
 * Lignes à passer pour amener l'écriture d'un mouvement d'avoir à sa cible,
 * compte tenu de ce qui a DÉJÀ été passé pour cette pièce. Rejouer la fonction
 * sans changement renvoie une liste vide.
 */
export function calculerLignesAvoir(
  mvt: MouvementAvoirCompta,
  dejaLignes: LigneExistante[],
): LigneEcriture[] {
  const cible = cibleAvoir(mvt);

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
