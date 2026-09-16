/**
 * Les montants imprimés sous le total d'une facture, et ce que porte le QR.
 *
 * Tout se lit, rien ne se recalcule : le reste est celui de la facture
 * (calculé à un seul endroit, `recalculer_paiement_facture`). Ce fichier ne
 * fait que répartir ce qui a été versé entre les lignes du document :
 *   - un acompte versé sur la réservation et rattaché à l'émission →
 *     « Acompte reçu le … : − CHF … », une ligne par versement ;
 *   - les acomptes portés par une facture d'acompte → « Acomptes déjà versés » ;
 *   - le reste des encaissements sur la facture → « Déjà payé ».
 * Le bulletin QR porte le reste, jamais le total ; à zéro, pas de bulletin.
 */

export const MENTION_REGLEE = "Réglée — aucun montant à verser";

export type AcompteRattache = { date_paiement: string; montant: number | string };

export type MontantsDocument = {
  acomptesRecus: { date: string; montant: number }[];
  acomptes: number;
  dejaPaye: number;
  reste: number;
  /** Montant du bulletin QR, ou null : pas de bulletin. */
  montantQr: number | null;
  /** La mention qui remplace le bulletin quand il ne reste rien à verser. */
  mentionReglee: string | null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export function montantsDuDocument(f: {
  type: string;
  total: number;
  montantPaye: number;
  montantRestant: number | null;
  /** acomptes_a_imputer : rattachements + factures d'acompte, la règle de la compta. */
  acomptesImputes: number;
  rattachements: AcompteRattache[];
}): MontantsDocument {
  const acomptesRecus = f.rattachements
    .map((r) => ({ date: String(r.date_paiement).slice(0, 10), montant: r2(Number(r.montant)) }))
    .filter((r) => r.montant > 0)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const recus = r2(acomptesRecus.reduce((s, r) => s + r.montant, 0));

  const acomptes = Math.min(Math.max(r2(f.acomptesImputes - recus), 0), f.total);
  const dejaPaye = Math.max(r2(f.montantPaye - recus), 0);
  const reste = Math.max(r2(f.montantRestant ?? f.total), 0);

  if (f.type === "avoir") {
    return { acomptesRecus: [], acomptes: 0, dejaPaye: 0, reste, montantQr: null, mentionReglee: null };
  }
  return {
    acomptesRecus,
    acomptes,
    dejaPaye,
    reste,
    montantQr: reste > 0 ? reste : null,
    mentionReglee: reste > 0 ? null : MENTION_REGLEE,
  };
}
