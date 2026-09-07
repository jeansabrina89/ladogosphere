/**
 * Bornes d'une date de paiement (règle pure, testée).
 *
 * Une date de paiement doit être :
 *  - postérieure ou égale à la date de la pièce (réservation ou facture) —
 *    on n'encaisse pas avant que la prestation existe ;
 *  - antérieure ou égale à aujourd'hui — pas d'encaissement dans le futur ;
 *  - dans un exercice comptable OUVERT — un exercice clôturé ne bouge plus.
 */

export type BornesPaiement = {
  /** Date de la réservation ou de la facture, au format "YYYY-MM-DD". */
  datePiece?: string | null;
  /** Aujourd'hui, au format "YYYY-MM-DD". */
  aujourdhui: string;
  /** Années dont l'exercice est ouvert. */
  exercicesOuverts: number[];
};

export type VerdictDatePaiement = { ok: true } | { ok: false; message: string };

/** "2026-07-01" → "01.07.2026" */
function jolie(dateISO: string): string {
  const [a, m, j] = dateISO.slice(0, 10).split("-");
  return j && m ? `${j}.${m}.${a}` : dateISO;
}

export function verifierDatePaiement(
  datePaiement: string | null | undefined,
  bornes: BornesPaiement,
): VerdictDatePaiement {
  const date = (datePaiement ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, message: "Date de paiement invalide." };
  }

  const piece = (bornes.datePiece ?? "").slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(piece) && date < piece) {
    return {
      ok: false,
      message: `La date de paiement (${jolie(date)}) ne peut pas être antérieure à celle de la réservation (${jolie(piece)}).`,
    };
  }

  const aujourdhui = bornes.aujourdhui.slice(0, 10);
  if (date > aujourdhui) {
    return {
      ok: false,
      message: `La date de paiement (${jolie(date)}) ne peut pas être dans le futur.`,
    };
  }

  const annee = Number(date.slice(0, 4));
  if (!bornes.exercicesOuverts.includes(annee)) {
    return {
      ok: false,
      message: `L'exercice ${annee} est clôturé : aucun paiement ne peut y être enregistré.`,
    };
  }

  return { ok: true };
}
