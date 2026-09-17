import { compteLiquidite, COMPTE_AVOIRS, COMPTE_DEBITEURS } from "@/src/lib/comptaFactureLogique";

/**
 * L'imputation d'un avoir : la créance d'abord, le client ensuite.
 *
 * Un avoir efface d'abord ce qui restait DÛ sur la facture — la créance
 * disparaît, crédit 1100. Seul l'EXCÉDENT, c'est-à-dire la part déjà encaissée,
 * peut devenir autre chose :
 *   • « porté au crédit du client » → crédit 2035, et c'est cette part-là, et
 *     elle seule, qui entre au registre des avoirs ;
 *   • « remboursé » → crédit du compte de liquidité par où l'argent était
 *     entré (1000 espèces, 1020 banque, 1021 TWINT et carte), car c'est par là
 *     qu'il ressort.
 *
 * Créditer un client qui n'a rien payé lui donnerait un avoir tout en lui
 * laissant sa dette : le registre annoncerait un crédit qui n'existe pas.
 *
 * Ce fichier ne parle à aucune base : l'écran s'en sert pour montrer
 * l'imputation AVANT de valider, et l'action serveur pour la figer.
 */

/** Sans encaissement identifiable, un remboursement sort de la banque. */
export const COMPTE_REMBOURSEMENT_DEFAUT = "1020";

export type DestinationAvoir = "credit" | "rembourser";
export type PaiementRecu = { mode?: string | null; montant?: number | string | null };
export type PartRemboursee = { compte: string; montant: number };

export type ImputationAvoir = {
  /** Montant total de l'avoir. */
  montant: number;
  /** Part qui efface le reste à payer de la facture : crédit 1100. */
  creance: number;
  /** Part portée au crédit du client : crédit 2035, et mouvement d'avoir. */
  credit: number;
  /** Part remboursée, par compte de liquidité. */
  remboursements: PartRemboursee[];
  /** Ce qui dépasse la créance : credit + remboursements. */
  excedent: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: number | string | null | undefined) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Répartit l'excédent entre les comptes de liquidité par lesquels la facture a
 * été payée, au prorata. Les centimes qui traînent vont au plus gros compte,
 * pour que la somme des parts fasse exactement l'excédent.
 */
export function repartirRemboursement(
  excedent: number,
  paiements: PaiementRecu[] = [],
): PartRemboursee[] {
  const montant = r2(excedent);
  if (montant <= 0) return [];

  const parCompte = new Map<string, number>();
  for (const p of paiements) {
    const compte = compteLiquidite(p.mode);
    if (!compte) continue;
    parCompte.set(compte, r2((parCompte.get(compte) ?? 0) + num(p.montant)));
  }

  const recus = [...parCompte].filter(([, m]) => m > 0).sort((a, b) => b[1] - a[1]);
  const base = r2(recus.reduce((s, [, m]) => s + m, 0));
  if (recus.length === 0 || base <= 0) return [{ compte: COMPTE_REMBOURSEMENT_DEFAUT, montant }];

  const parts = recus.map(([compte, m]) => ({ compte, montant: r2((montant * m) / base) }));
  const ecart = r2(montant - parts.reduce((s, p) => s + p.montant, 0));
  if (ecart !== 0) parts[0].montant = r2(parts[0].montant + ecart);
  return parts.filter((p) => p.montant !== 0);
}

/** L'imputation d'un avoir, dans l'ordre : la créance, puis l'excédent. */
export function imputerAvoir(e: {
  montant: number | string;
  /** Reste à payer de la facture d'origine AVANT cet avoir. */
  resteFacture: number | string;
  destination: DestinationAvoir;
  /** Encaissements de la facture d'origine, pour savoir par où rembourser. */
  paiements?: PaiementRecu[];
}): ImputationAvoir {
  const montant = Math.max(r2(num(e.montant)), 0);
  const reste = Math.max(r2(num(e.resteFacture)), 0);
  const creance = r2(Math.min(montant, reste));
  const excedent = r2(montant - creance);

  if (excedent <= 0) {
    return { montant, creance, credit: 0, remboursements: [], excedent: 0 };
  }
  if (e.destination === "rembourser") {
    return { montant, creance, credit: 0, remboursements: repartirRemboursement(excedent, e.paiements), excedent };
  }
  return { montant, creance, credit: excedent, remboursements: [], excedent };
}

/** Les comptes crédités par l'avoir, hors reprise des produits. Somme = montant. */
export function contrepartiesAvoir(i: ImputationAvoir): Record<string, number> {
  const comptes: Record<string, number> = {};
  const add = (compte: string, montant: number) => {
    const v = r2((comptes[compte] ?? 0) + montant);
    if (v === 0) delete comptes[compte];
    else comptes[compte] = v;
  };
  if (i.creance !== 0) add(COMPTE_DEBITEURS, i.creance);
  if (i.credit !== 0) add(COMPTE_AVOIRS, i.credit);
  for (const r of i.remboursements) add(r.compte, r.montant);
  return comptes;
}

const chf = (n: number) => `${n.toFixed(2)} CHF`;

const NOM_COMPTE: Record<string, string> = {
  "1000": "espèces",
  "1020": "banque",
  "1021": "TWINT / carte",
  "2035": "avoir du client",
};

/** Ce que l'écran dit avant de valider, en clair. */
export function libelleImputation(i: ImputationAvoir, resteFacture: number | string): string[] {
  const reste = Math.max(r2(num(resteFacture)), 0);
  const lignes = [
    reste > 0
      ? `Reste à payer de la facture : ${chf(reste)} → ${i.creance >= reste ? "soldé" : `réduit de ${chf(i.creance)}`}.`
      : "Reste à payer de la facture : 0.00 CHF — il n'y a rien à solder.",
  ];
  lignes.push(`Crédit au client : ${chf(i.credit)}.`);
  for (const r of i.remboursements) {
    lignes.push(`Remboursement : ${chf(r.montant)} — ${NOM_COMPTE[r.compte] ?? `compte ${r.compte}`}.`);
  }
  return lignes;
}

/** Pourquoi « porter au crédit » n'a rien à porter, le cas échéant. */
export function raisonSansExcedent(montant: number | string, resteFacture: number | string): string | null {
  const m = r2(num(montant));
  const reste = Math.max(r2(num(resteFacture)), 0);
  if (m <= 0) return "Sélectionnez au moins une ligne à créditer.";
  if (m > reste) return null;
  return reste > 0
    ? "Cet avoir efface le reste à payer de la facture : il n'y a pas d'excédent à porter au crédit du client."
    : null;
}
