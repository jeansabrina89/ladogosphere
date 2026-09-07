// Logique comptable pure de la FACTURE (pièce pivot). Idempotente, sans effet
// de bord, sans dépendance Supabase — même moteur par delta que les
// réservations, les adhésions et les avoirs.
//
// Répartition des rôles, pour qu'aucun montant ne soit compté deux fois :
//
//   • Réservation (comptaResaLogique) : tant qu'aucune facture n'est émise,
//     elle porte tout. Dès qu'une facture est émise, elle ne porte plus que
//     les acomptes encaissés avant la facture (D liquidité / C 2030).
//   • Facture (ici) : reconnaissance du produit (D 1100 / C compte de produit),
//     imputation des acomptes (D 2030 / C 1100), encaissements (D liquidité /
//     C 1100) et notes de crédit.
//
// Un paiement appartient à UNE seule pièce : à la facture s'il porte un
// facture_id, à la réservation sinon.

/** Compte de liquidité par mode de paiement. */
const COMPTE_LIQUIDITE: Record<string, string> = {
  cash: "1000",
  virement: "1020",
  twint: "1021",
  carte: "1021",
  stripe: "1021",
  avoir: "2035",
};

export const COMPTE_DEBITEURS = "1100";
export const COMPTE_ACOMPTES = "2030";
export const COMPTE_AVOIRS = "2035";
export const COMPTE_DIMINUTION_PRODUITS = "3800";
export const COMPTE_FRAIS_BANCAIRES = "6940";

const r2 = (n: number) => Math.round(n * 100) / 100;

export type LigneFacture = {
  compte_produit?: string | null;
  montant?: number | string | null;
};

export type PaiementFacture = {
  mode?: string | null;
  /** Montant imputé à la pièce (hors arrondi des espèces). */
  montant?: number | string | null;
  /** Différence réellement encaissée en plus (+) ou en moins (−). */
  arrondi?: number | string | null;
};

export type FactureCompta = {
  /** 'facture' | 'libre' | 'acompte' | 'avoir' */
  type?: string | null;
  /** Une facture non émise (sans numéro) ne produit aucune écriture. */
  emise?: boolean;
  statut?: string | null;
  lignes?: LigneFacture[];
  paiements?: PaiementFacture[];
  /** Acomptes encaissés avant la facture, à basculer de 2030 vers 1100. */
  acomptesImputes?: number | string | null;
  /**
   * Avoir uniquement : part réellement portée au crédit du client (compte 2035).
   * Le reste de l'avoir efface la créance (1100). Un avoir sur une facture
   * impayée annule la dette ; sur une facture déjà payée, il crée un crédit.
   * La part est FIGÉE à la création (elle vaut le mouvement d'avoir enregistré),
   * pour que la cible ne se déplace plus au fil des encaissements.
   */
  montantCredite?: number | string | null;
};

export type LigneExistante = { compte_numero: string; debit: number | string; credit: number | string };
export type LigneEcriture = { compte: string; debit: number; credit: number };

/** Une facture annulée (avant émission ou soldée par avoir) ne porte plus d'écriture propre. */
function porteDesEcritures(f: FactureCompta): boolean {
  if (!f.emise) return false;
  return f.statut !== "annulee";
}

export function compteLiquidite(mode: string | null | undefined): string | null {
  return COMPTE_LIQUIDITE[mode ?? ""] ?? null;
}

/**
 * Écriture CIBLE d'une facture, en soldes signés (positif = débit net).
 * Rejouer la fonction sur le même état donne toujours la même cible : c'est ce
 * qui rend la synchronisation idempotente.
 */
export function cibleFacture(f: FactureCompta): Record<string, number> {
  const cible: Record<string, number> = {};
  const add = (compte: string, montant: number) => {
    const v = r2((cible[compte] ?? 0) + montant);
    if (v === 0) delete cible[compte];
    else cible[compte] = v;
  };

  if (!porteDesEcritures(f)) return cible;

  const lignes = f.lignes ?? [];
  const total = r2(lignes.reduce((s, l) => s + Number(l.montant ?? 0), 0));

  if (f.type === "avoir") {
    // Reprise du produit : on redébite les comptes de produit ligne à ligne.
    for (const l of lignes) {
      const montant = r2(Number(l.montant ?? 0));
      if (montant === 0) continue;
      add(l.compte_produit || "3000", montant);
    }
    // La contrepartie se partage : ce qui restait dû s'efface du débiteur,
    // ce qui était déjà encaissé devient une dette envers le client.
    const credite = Math.min(Math.max(r2(Number(f.montantCredite ?? 0)), 0), total);
    add(COMPTE_AVOIRS, -credite);
    add(COMPTE_DEBITEURS, -r2(total - credite));
  } else if (f.type === "acompte") {
    // Aucun produit : l'acompte est un passif, reconnu à son encaissement.
  } else {
    for (const l of lignes) {
      const montant = r2(Number(l.montant ?? 0));
      if (montant === 0) continue;
      add(l.compte_produit || "3000", -montant);
    }
    add(COMPTE_DEBITEURS, total);

    const acomptes = r2(Number(f.acomptesImputes ?? 0));
    if (acomptes !== 0) {
      add(COMPTE_ACOMPTES, acomptes);
      add(COMPTE_DEBITEURS, -acomptes);
    }
  }

  // Encaissements rattachés à la facture. Sur un acompte la contrepartie est
  // le passif 2030 ; partout ailleurs c'est le débiteur 1100.
  const contrepartiePaiement = f.type === "acompte" ? COMPTE_ACOMPTES : COMPTE_DEBITEURS;
  for (const p of f.paiements ?? []) {
    const compte = compteLiquidite(p.mode);
    if (!compte) continue;
    const montant = r2(Number(p.montant ?? 0));
    const arrondi = r2(Number(p.arrondi ?? 0));
    if (montant === 0 && arrondi === 0) continue;

    add(compte, r2(montant + arrondi));
    add(contrepartiePaiement, -montant);

    // L'arrondi des espèces : un manque est une charge, un excédent un produit.
    if (arrondi < 0) add(COMPTE_FRAIS_BANCAIRES, -arrondi);
    else if (arrondi > 0) add(COMPTE_DIMINUTION_PRODUITS, -arrondi);
  }

  return cible;
}

/**
 * Lignes à passer pour amener l'écriture d'une facture à sa cible, compte tenu
 * de ce qui a DÉJÀ été passé sur cette pièce. Sans changement : liste vide.
 */
export function calculerLignesFacture(
  f: FactureCompta,
  dejaLignes: LigneExistante[],
): LigneEcriture[] {
  const cible = cibleFacture(f);

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

/**
 * Arrondi suisse aux 5 centimes d'un encaissement en espèces.
 * Renvoie le montant réellement encaissé et l'écart par rapport au dû.
 */
export function arrondirEspeces(montantDu: number, actif = true): { encaisse: number; arrondi: number } {
  const du = r2(montantDu);
  if (!actif) return { encaisse: du, arrondi: 0 };
  const encaisse = Math.round(du * 20) / 20;
  return { encaisse: r2(encaisse), arrondi: r2(encaisse - du) };
}
