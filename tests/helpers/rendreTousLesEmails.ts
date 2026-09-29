import { donneesExemple, TYPES_EMAIL_TEST } from "@/src/lib/emailsDeTest";
import { envoyerEmailsDeTest, type ContexteEnvoiTest, type FonctionsEnvoi } from "@/src/lib/emailsDeTestEnvoi";

/**
 * Rendre les DIX-HUIT e-mails de test, et rendre leur HTML.
 *
 * ── POURQUOI CE FICHIER EXISTE ────────────────────────────────────────────
 *
 * APP 60 rend modifiables tous les textes des e-mails. Le seul moyen honnête de
 * prouver qu'un tel remaniement ne change RIEN le jour du déploiement est de
 * comparer les dix-huit HTML, au caractère près, à ceux d'avant. Le décor est
 * donc écrit une fois ici, et deux tests s'en servent.
 *
 * Le contexte est celui des envois de test réels (`donneesExemple`), à une date
 * FIGÉE : sans cela, les dates calculées changeraient chaque jour et la
 * comparaison ne voudrait plus rien dire.
 */

/** Le 29 septembre 2026, midi UTC. Une date fixe, pour une comparaison fixe. */
export const MAINTENANT_FIGE = new Date("2026-09-29T12:00:00Z");

export function contexteDeTest(): ContexteEnvoiTest {
  return {
    destinataire: "client@exemple.ch",
    donnees: donneesExemple(MAINTENANT_FIGE),
    iban: "CH00 0000 0000 0000 0000 0",
    titulaire: "Sabrina Jean",
    tokenDesinscription: "jeton-de-test",
    facture: {
      numero: "2026-0041",
      date: "2026-09-15",
      echeance: "2026-10-15",
      montant: 226.5,
      pdf: Buffer.from("PDF de démonstration"),
    },
    commandeId: "cmd-1",
    article: { id: "art-1", nom: "Collier en cuir sur mesure", prix: 68, photoUrl: null },
  };
}

/** Toutes les clés d'e-mail de test, dans leur ordre déclaré. */
export const CLES_EMAILS = TYPES_EMAIL_TEST.map((t) => t.cle);

/**
 * Rend chaque e-mail et rend { clé → HTML }.
 *
 * `envois` est le module `src/lib/email` lui-même : on éprouve les vraies
 * fonctions, pas une imitation. Resend et la base sont doublés par l'appelant.
 */
export async function rendreTousLesEmails(
  envois: FonctionsEnvoi,
  html: () => string[],
  viderHtml: () => void,
): Promise<Record<string, string>> {
  const rendus: Record<string, string> = {};
  for (const cle of CLES_EMAILS) {
    viderHtml();
    await envoyerEmailsDeTest({
      cles: [cle],
      contexte: contexteDeTest(),
      envois,
      lireResendId: async () => null,
    });
    const produits = html();
    // Un e-mail indisponible dans ce décor n'en produit aucun : on le note
    // plutôt que de l'omettre, sinon une disparition passerait inaperçue.
    rendus[cle] = produits.length === 0 ? "(aucun envoi)" : produits.join("\n===== E-MAIL SUIVANT =====\n");
  }
  return rendus;
}
