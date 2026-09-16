/**
 * Après une commande en ligne : un seul e-mail, et la facture qui va avec.
 *
 * Quand la commande est payable sur facture, la facture vient d'être émise.
 * Elle part AVEC la confirmation, PDF joint : le client ne reçoit pas un
 * second e-mail pour la même commande. La facture est alors marquée envoyée et
 * exclue de l'envoi du matin — elle est déjà chez lui.
 *
 * Si le PDF n'est pas là au moment d'envoyer, la confirmation part sans lui et
 * la facture n'est PAS exclue : l'envoi du matin la rattrapera si elle est
 * encore impayée. Aucune commande ne reste sans sa facture.
 *
 * Tout ce qui touche la base ou Resend est injecté : c'est ce qui permet de
 * compter les e-mails dans un test.
 */

export type DependancesConfirmation = {
  lireNumeroFacture: (factureId: string) => Promise<string | null>;
  telechargerPdf: (factureId: string) => Promise<Buffer | null>;
  envoyerConfirmation: (
    commandeId: string,
    options: { facture: { numero: string; pdf: Buffer | null } | null },
  ) => Promise<{ envoye: boolean; pdfJoint: boolean; destinataire: string | null }>;
  marquerFactureEnvoyee: (
    factureId: string,
    options: { destinataire: string; exclureAuto: boolean; via: string },
  ) => Promise<void>;
};

export type IssueConfirmation = {
  envoye: boolean;
  pdfJoint: boolean;
  /** La facture est-elle désormais tenue pour arrivée chez le client ? */
  factureMarquee: boolean;
  erreur: string | null;
};

/**
 * La règle, seule : quand une facture est-elle tenue pour arrivée ?
 * Seulement si l'e-mail est PARTI, et avec le PDF dedans.
 */
export function factureArriveeAvecConfirmation(r: {
  factureId: string | null;
  envoye: boolean;
  pdfJoint: boolean;
}): boolean {
  return !!r.factureId && r.envoye && r.pdfJoint;
}

export async function envoyerConfirmationCommande(
  commandeId: string,
  /** Facture émise pour cette commande, ou null (paiement au retrait). */
  factureId: string | null,
  deps: DependancesConfirmation,
): Promise<IssueConfirmation> {
  let facture: { numero: string; pdf: Buffer | null } | null = null;
  if (factureId) {
    const numero = await deps.lireNumeroFacture(factureId);
    // Une facture sans numéro n'est pas émise : rien à joindre, rien à marquer.
    if (numero) facture = { numero, pdf: await deps.telechargerPdf(factureId) };
  }

  let resultat: { envoye: boolean; pdfJoint: boolean; destinataire: string | null };
  try {
    resultat = await deps.envoyerConfirmation(commandeId, { facture });
  } catch (e) {
    // La commande tient. L'e-mail a manqué : la facture reste non marquée et
    // l'envoi du matin la reprendra si elle est encore impayée.
    return {
      envoye: false, pdfJoint: false, factureMarquee: false,
      erreur: e instanceof Error ? e.message : String(e),
    };
  }

  const arrivee = factureArriveeAvecConfirmation({
    factureId: facture ? factureId : null,
    envoye: resultat.envoye,
    pdfJoint: resultat.pdfJoint,
  });

  if (arrivee && factureId && resultat.destinataire) {
    await deps.marquerFactureEnvoyee(factureId, {
      destinataire: resultat.destinataire,
      exclureAuto: true,
      via: "commande_confirmee",
    });
  }

  return {
    envoye: resultat.envoye,
    pdfJoint: resultat.pdfJoint,
    factureMarquee: arrivee && !!resultat.destinataire,
    erreur: null,
  };
}
