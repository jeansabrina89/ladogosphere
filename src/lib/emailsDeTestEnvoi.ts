/**
 * Ce qui déclenche les envois de test, un type après l'autre.
 *
 * Tout ce qui touche la base ou Resend est INJECTÉ : la route branche les
 * vraies fonctions, les tests branchent des doublures qui enregistrent ce
 * qu'on leur demande. C'est ainsi qu'on peut prouver, sans base de données,
 * qu'un envoi de test n'écrit nulle part ailleurs que dans `emails_envoyes`.
 *
 * Un échec ne s'arrête pas à lui-même : chaque type est tenté, et le message
 * d'erreur remonte ENTIER. C'est justement ce qu'on vient chercher.
 */

import {
  TYPES_EMAIL_TEST,
  pdfDemonstration,
  typeEmailTest,
  type DonneesExemple,
} from "@/src/lib/emailsDeTest";

export type StatutEnvoiTest = "envoye" | "echec" | "indisponible";

export type ResultatEnvoiTest = {
  cle: string;
  libelle: string;
  statut: StatutEnvoiTest;
  /** Identifiant Resend, relu dans le journal après l'envoi. */
  resendId: string | null;
  /** Message d'erreur complet, ou raison de l'indisponibilité. */
  message: string | null;
};

/** Ce que la route a pu rassembler de réel avant d'envoyer. */
export type ContexteEnvoiTest = {
  destinataire: string;
  donnees: DonneesExemple;
  iban: string;
  titulaire: string;
  /** Jeton de désinscription réel de la fiche de test, ou null. */
  tokenDesinscription: string | null;
  /** Facture la plus récente de la fiche de test, si elle en a une. */
  facture: {
    numero: string;
    date: string;
    echeance: string;
    montant: number;
    /** PDF déjà déposé dans le bucket. Jamais généré ici : cela écrirait. */
    pdf: Buffer | null;
  } | null;
  /** Commande la plus récente de la fiche de test, ou null. */
  commandeId: string | null;
  /** Article publié encore en stock, ou null. */
  article: { id: string; nom: string; prix: number; photoUrl: string | null } | null;
};

/** Les dix-sept fonctions d'envoi, telles que `src/lib/email.ts` les exporte. */
export type FonctionsEnvoi = {
  envoyerMessageLibre: (p: { email: string; sujet: string; corps: string; prenom?: string | null; nom?: string | null; token?: string | null }) => Promise<unknown>;
  envoyerEmailConfirmationDemande: (p: { email: string; prenom: string; date_debut: string; date_fin: string; type: string }) => Promise<unknown>;
  envoyerEmailReservationValidee: (p: { email: string; prenom: string; date_debut: string; date_fin: string; type: string; box_label?: string; heure_arrivee?: string; heure_depart?: string }) => Promise<unknown>;
  envoyerEmailReservationAnnulee: (p: { email: string; prenom: string; date_debut: string; date_fin: string; type: string }) => Promise<unknown>;
  envoyerEmailReservationRefusee: (p: { email: string; prenom: string; date_debut: string; date_fin: string; type: string }) => Promise<unknown>;
  envoyerEmailPaiement: (p: { email: string; prenom: string; montant: number; date_debut: string; date_fin: string; type: string; iban: string; titulaire: string; numeroFacture?: string | null }) => Promise<unknown>;
  envoyerEmailRelancePaiement: (p: { email: string; prenom: string; montant: number; date_debut: string; date_fin: string; type: string; iban: string; titulaire: string; niveau: 1 | 2 | 3; numeroFacture?: string | null }) => Promise<unknown>;
  envoyerEmailSatisfactionEssai: (p: { email: string; prenom: string; nom_chien: string }) => Promise<unknown>;
  envoyerEmailResultatEssai: (p: { email: string; prenom: string; nom_chien: string; resultat: "valide" | "seconde_journee" }) => Promise<unknown>;
  envoyerEmailRappelVeille: (p: { email: string; prenom: string; nom_chien: string; date_debut: string; heure_arrivee?: string; type: string }) => Promise<unknown>;
  envoyerEmailRappelCotisation: (p: { email: string; prenom: string; nom: string; date_fin: string; montant: number; iban: string; titulaire: string; variante?: "echue" | "rappel" }) => Promise<unknown>;
  envoyerEmailFactureEmise: (p: { email: string; prenom: string; numero: string; date: string; echeance: string; montant: number; pdf?: Buffer | null }) => Promise<unknown>;
  envoyerEmailTicketBoutique: (p: { email: string; prenom: string; numero: string; date: string; montant: number; pdf: Buffer }) => Promise<unknown>;
  envoyerEmailCommandePrete: (p: { email: string; prenom: string; numero: string; article: string; recapitulatif: string[] }) => Promise<unknown>;
  envoyerEmailCommandeConfirmee: (commandeId: string, destinataire?: string | null) => Promise<unknown>;
  envoyerEmailCommandeExpediee: (commandeId: string, destinataire?: string | null) => Promise<unknown>;
  envoyerEmailRetourEnStock: (p: { email: string; article: string; prix: number | string; articleId: string; token: string; photoUrl?: string | null }) => Promise<unknown>;
};

export const MESSAGE_SANS_COMMANDE =
  "Aucune commande de test disponible sur la fiche client de test.";
export const MESSAGE_SANS_ARTICLE =
  "Aucun article publié encore en stock : rien à annoncer.";
export const MESSAGE_SANS_PDF =
  "Envoyée sans pièce jointe : aucune facture de la fiche de test n'a de PDF déposé, et en générer un écrirait sur la facture.";

/**
 * Le jeton d'un retour en stock est FACTICE : un vrai jeton viendrait d'une
 * ligne d'`alertes_stock`, et la toucher (ne serait-ce qu'en la lisant pour la
 * marquer) sort du périmètre. Le lien de désinscription mènera donc à une page
 * qui ne reconnaît pas le jeton : c'est le comportement attendu.
 */
const JETON_FACTICE = "test-jeton-sans-alerte";

type Etape = {
  cle: string;
  /** Rend null pour envoyer, ou la raison pour laquelle il n'y a rien à envoyer. */
  executer: () => Promise<string | null>;
};

function etapes(c: ContexteEnvoiTest, e: FonctionsEnvoi): Etape[] {
  const d = c.donnees;
  const commun = { email: c.destinataire, prenom: d.prenom };
  const sejour = { date_debut: d.dateDebut, date_fin: d.dateFin, type: d.typeReservation };

  return [
    {
      cle: "message_libre",
      executer: async () => {
        await e.envoyerMessageLibre({
          email: c.destinataire,
          sujet: d.sujetMessageLibre,
          corps: d.corpsMessageLibre,
          prenom: d.prenom,
          nom: d.nom,
          token: c.tokenDesinscription,
        });
        return null;
      },
    },
    {
      cle: "confirmation_demande",
      executer: async () => { await e.envoyerEmailConfirmationDemande({ ...commun, ...sejour }); return null; },
    },
    {
      cle: "reservation_validee",
      executer: async () => {
        await e.envoyerEmailReservationValidee({
          ...commun, ...sejour, box_label: "Box 3",
          heure_arrivee: d.heureArrivee, heure_depart: d.heureDepart,
        });
        return null;
      },
    },
    {
      cle: "reservation_annulee",
      executer: async () => { await e.envoyerEmailReservationAnnulee({ ...commun, ...sejour }); return null; },
    },
    {
      cle: "reservation_refusee",
      executer: async () => { await e.envoyerEmailReservationRefusee({ ...commun, ...sejour }); return null; },
    },
    {
      cle: "paiement",
      executer: async () => {
        await e.envoyerEmailPaiement({
          ...commun, ...sejour, montant: d.montant,
          iban: c.iban, titulaire: c.titulaire, numeroFacture: d.numeroFacture,
        });
        return null;
      },
    },
    {
      cle: "relance_paiement",
      executer: async () => {
        await e.envoyerEmailRelancePaiement({
          ...commun, ...sejour, montant: d.montant,
          iban: c.iban, titulaire: c.titulaire, niveau: 1, numeroFacture: d.numeroFacture,
        });
        return null;
      },
    },
    {
      cle: "satisfaction_essai",
      executer: async () => { await e.envoyerEmailSatisfactionEssai({ ...commun, nom_chien: d.nomChien }); return null; },
    },
    {
      cle: "essai_valide",
      executer: async () => { await e.envoyerEmailResultatEssai({ ...commun, nom_chien: d.nomChien, resultat: "valide" }); return null; },
    },
    {
      cle: "essai_seconde_journee",
      executer: async () => { await e.envoyerEmailResultatEssai({ ...commun, nom_chien: d.nomChien, resultat: "seconde_journee" }); return null; },
    },
    {
      cle: "rappel_veille",
      executer: async () => {
        await e.envoyerEmailRappelVeille({
          ...commun, nom_chien: d.nomChien, date_debut: d.dateDebut,
          heure_arrivee: d.heureArrivee, type: d.typeReservation,
        });
        return null;
      },
    },
    {
      cle: "cotisation_echue",
      executer: async () => {
        await e.envoyerEmailRappelCotisation({
          ...commun, nom: d.nom, date_fin: d.dateFinAdhesion,
          montant: d.montantAdhesion, iban: c.iban, titulaire: c.titulaire, variante: "echue",
        });
        return null;
      },
    },
    {
      cle: "cotisation_rappel",
      executer: async () => {
        await e.envoyerEmailRappelCotisation({
          ...commun, nom: d.nom, date_fin: d.dateFinAdhesion,
          montant: d.montantAdhesion, iban: c.iban, titulaire: c.titulaire, variante: "rappel",
        });
        return null;
      },
    },
    {
      cle: "facture_emise",
      executer: async () => {
        const f = c.facture;
        await e.envoyerEmailFactureEmise({
          ...commun,
          numero: f?.numero ?? d.numeroFacture,
          date: f?.date ?? d.dateFacture,
          echeance: f?.echeance ?? d.echeance,
          montant: f?.montant ?? d.montant,
          pdf: f?.pdf ?? null,
        });
        // L'envoi a bien eu lieu : on signale seulement la pièce manquante.
        return f?.pdf ? null : MESSAGE_SANS_PDF;
      },
    },
    {
      cle: "ticket_boutique",
      executer: async () => {
        await e.envoyerEmailTicketBoutique({
          ...commun,
          numero: d.numeroTicket,
          date: d.dateFacture,
          montant: d.prixArticle,
          // Le ticket d'une vente au comptoir n'est jamais archivé en PDF :
          // il n'y a rien de réel à joindre, on en fabrique un lisible.
          pdf: c.facture?.pdf ?? pdfDemonstration(`Ticket de demonstration ${d.numeroTicket}`),
        });
        return null;
      },
    },
    {
      cle: "commande_confirmee",
      executer: async () => {
        if (!c.commandeId) return MESSAGE_SANS_COMMANDE;
        await e.envoyerEmailCommandeConfirmee(c.commandeId, c.destinataire);
        return null;
      },
    },
    {
      cle: "commande_prete",
      executer: async () => {
        // Celle-ci reçoit son destinataire en paramètre : aucune commande
        // n'est nécessaire, et aucune n'est lue.
        await e.envoyerEmailCommandePrete({
          ...commun, numero: d.numeroCommande, article: d.article, recapitulatif: d.recapitulatif,
        });
        return null;
      },
    },
    {
      cle: "commande_expediee",
      executer: async () => {
        if (!c.commandeId) return MESSAGE_SANS_COMMANDE;
        await e.envoyerEmailCommandeExpediee(c.commandeId, c.destinataire);
        return null;
      },
    },
    {
      cle: "retour_en_stock",
      executer: async () => {
        if (!c.article) return MESSAGE_SANS_ARTICLE;
        await e.envoyerEmailRetourEnStock({
          email: c.destinataire,
          article: c.article.nom,
          prix: c.article.prix,
          articleId: c.article.id,
          token: JETON_FACTICE,
          photoUrl: c.article.photoUrl,
        });
        return null;
      },
    },
  ];
}

/**
 * Lance les envois demandés, dans l'ordre de la liste.
 *
 * `lireResendId` relit le journal après chaque envoi : les fonctions d'envoi ne
 * rendent rien, et l'identifiant Resend n'existe que là.
 */
export async function envoyerEmailsDeTest({
  cles,
  contexte,
  envois,
  lireResendId,
}: {
  cles: string[];
  contexte: ContexteEnvoiTest;
  envois: FonctionsEnvoi;
  lireResendId: (typeJournal: string) => Promise<string | null>;
}): Promise<ResultatEnvoiTest[]> {
  const parCle = new Map(etapes(contexte, envois).map((e) => [e.cle, e]));
  const resultats: ResultatEnvoiTest[] = [];

  for (const cle of cles) {
    const type = typeEmailTest(cle);
    const etape = parCle.get(cle);
    if (!type || !etape) continue;

    try {
      const remarque = await etape.executer();
      if (remarque === MESSAGE_SANS_COMMANDE || remarque === MESSAGE_SANS_ARTICLE) {
        // Rien n'a été envoyé, et ce n'est pas un échec.
        resultats.push({ cle, libelle: type.libelle, statut: "indisponible", resendId: null, message: remarque });
        continue;
      }
      resultats.push({
        cle,
        libelle: type.libelle,
        statut: "envoye",
        resendId: await lireResendId(type.typeJournal),
        message: remarque,
      });
    } catch (erreur) {
      resultats.push({
        cle,
        libelle: type.libelle,
        statut: "echec",
        resendId: null,
        // Entier, jamais tronqué : c'est le message qu'on est venu chercher.
        message: erreur instanceof Error ? erreur.message : String(erreur),
      });
    }
  }

  return resultats;
}

/** Garde-fou du garde-fou : la liste et les étapes doivent se répondre. */
export function clesSansEtape(contexte: ContexteEnvoiTest, envois: FonctionsEnvoi): string[] {
  const connues = new Set(etapes(contexte, envois).map((e) => e.cle));
  return TYPES_EMAIL_TEST.filter((t) => !connues.has(t.cle)).map((t) => t.cle);
}
