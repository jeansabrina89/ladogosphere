/**
 * Envoi d'e-mails de test vers une adresse choisie.
 *
 * On ne réécrit aucun modèle et on ne détourne aucun chemin d'envoi : on
 * appelle les mêmes fonctions que la production, avec des valeurs d'exemple, et
 * l'on regarde ce qui arrive dans la boîte. Les pièces jointes et les liens
 * sont réels — c'est tout l'intérêt : un PDF qui ne s'ouvre pas ou un lien de
 * désinscription cassé ne se voient que sur un vrai message.
 *
 * Ce module ne touche à rien : il ne porte que la liste, les valeurs d'exemple
 * et les garde-fous, pour que les tests les lisent sans base de données.
 */

/**
 * Le journal `emails_envoyes` reçoit ces envois comme les autres. Le préfixe
 * les distingue à jamais d'un vrai message : un relevé, une statistique ou une
 * relance qui compterait un test fausserait tout, et rien ne permettrait de
 * revenir dessus une fois la ligne écrite.
 */
export const PREFIXE_TEST = "test:";

/** Au-delà, la route refuse : un doigt qui glisse ne vide pas le quota Resend. */
export const PLAFOND_ENVOIS = 30;
export const FENETRE_MINUTES = 10;

export const MESSAGE_ADRESSE_INVALIDE =
  "Indiquez une adresse e-mail valide pour recevoir les tests.";
export const MESSAGE_PLAFOND =
  `Plus de ${PLAFOND_ENVOIS} e-mails de test ont déjà été envoyés dans les ` +
  `${FENETRE_MINUTES} dernières minutes. Attendez un peu avant de recommencer.`;
export const MESSAGE_AUCUN_TYPE = "Cochez au moins un type d'e-mail à envoyer.";

export type TypeEmailTest = {
  /** Identifiant transmis par l'écran. */
  cle: string;
  /** Ce que l'administratrice lit dans la liste à cocher. */
  libelle: string;
  /**
   * Nom de l'export de `src/lib/email.ts` que ce type déclenche. Deux types
   * peuvent partager une fonction : c'est un paramètre qui les sépare.
   */
  fonction: string;
  /**
   * `type` écrit dans `emails_envoyes` par la fonction, SANS le préfixe. Sert à
   * retrouver la ligne du journal pour en lire l'identifiant Resend.
   */
  typeJournal: string;
};

export const TYPES_EMAIL_TEST: readonly TypeEmailTest[] = [
  { cle: "message_libre", libelle: "Message libre", fonction: "envoyerMessageLibre", typeJournal: "campagne" },
  { cle: "confirmation_demande", libelle: "Confirmation de demande", fonction: "envoyerEmailConfirmationDemande", typeJournal: "confirmation_demande" },
  { cle: "reservation_validee", libelle: "Réservation validée", fonction: "envoyerEmailReservationValidee", typeJournal: "reservation_validee" },
  { cle: "reservation_annulee", libelle: "Réservation annulée", fonction: "envoyerEmailReservationAnnulee", typeJournal: "reservation_annulee" },
  { cle: "reservation_refusee", libelle: "Réservation refusée", fonction: "envoyerEmailReservationRefusee", typeJournal: "reservation_refusee" },
  { cle: "paiement", libelle: "Paiement", fonction: "envoyerEmailPaiement", typeJournal: "paiement" },
  { cle: "relance_paiement", libelle: "Relance de paiement", fonction: "envoyerEmailRelancePaiement", typeJournal: "relance_paiement" },
  { cle: "satisfaction_essai", libelle: "Satisfaction après essai", fonction: "envoyerEmailSatisfactionEssai", typeJournal: "satisfaction_essai" },
  { cle: "essai_valide", libelle: "Résultat d'essai validé", fonction: "envoyerEmailResultatEssai", typeJournal: "essai_valide" },
  { cle: "essai_seconde_journee", libelle: "Seconde journée d'essai", fonction: "envoyerEmailResultatEssai", typeJournal: "essai_seconde_journee" },
  { cle: "rappel_veille", libelle: "Rappel de la veille", fonction: "envoyerEmailRappelVeille", typeJournal: "rappel_veille" },
  { cle: "cotisation_echue", libelle: "Adhésion échue", fonction: "envoyerEmailRappelCotisation", typeJournal: "rappel_cotisation" },
  { cle: "cotisation_rappel", libelle: "Rappel d'adhésion", fonction: "envoyerEmailRappelCotisation", typeJournal: "rappel_cotisation" },
  { cle: "facture_emise", libelle: "Facture émise", fonction: "envoyerEmailFactureEmise", typeJournal: "facture_emise" },
  { cle: "ticket_boutique", libelle: "Ticket boutique", fonction: "envoyerEmailTicketBoutique", typeJournal: "ticket_boutique" },
  { cle: "commande_confirmee", libelle: "Commande confirmée", fonction: "envoyerEmailCommandeConfirmee", typeJournal: "commande_confirmee" },
  { cle: "commande_prete", libelle: "Commande prête", fonction: "envoyerEmailCommandePrete", typeJournal: "commande_prete" },
  { cle: "commande_expediee", libelle: "Commande expédiée", fonction: "envoyerEmailCommandeExpediee", typeJournal: "commande_expediee" },
  { cle: "retour_en_stock", libelle: "Retour en stock", fonction: "envoyerEmailRetourEnStock", typeJournal: "retour_en_stock" },
];

export function typeEmailTest(cle: string): TypeEmailTest | null {
  return TYPES_EMAIL_TEST.find((t) => t.cle === cle) ?? null;
}

/** Les clés reconnues d'une demande, dans l'ordre de la liste, sans doublon. */
export function clesRetenues(brut: unknown): string[] {
  const demandees = new Set(
    Array.isArray(brut) ? brut.filter((c): c is string => typeof c === "string") : []
  );
  return TYPES_EMAIL_TEST.filter((t) => demandees.has(t.cle)).map((t) => t.cle);
}

/**
 * Validation volontairement simple : elle écarte une saisie vide ou visiblement
 * fautive, pas une adresse exotique. Resend tranchera le reste, et son message
 * d'erreur remontera tel quel.
 */
export function adresseValide(email: string | null | undefined): boolean {
  const a = (email ?? "").trim();
  if (a.length === 0 || a.length > 254) return false;
  if (/\s/.test(a)) return false;
  return /^[^@]+@[^@.]+(\.[^@.]+)+$/.test(a);
}

/** Refus du garde-fou, ou null si l'on peut envoyer. */
export function refusGardeFou({
  destinataire,
  cles,
  envoisRecents,
}: {
  destinataire: string | null | undefined;
  cles: string[];
  /** Lignes `test:%` d'`emails_envoyes` sur la fenêtre. */
  envoisRecents: number;
}): string | null {
  if (!adresseValide(destinataire)) return MESSAGE_ADRESSE_INVALIDE;
  if (cles.length === 0) return MESSAGE_AUCUN_TYPE;
  if (envoisRecents + cles.length > PLAFOND_ENVOIS) return MESSAGE_PLAFOND;
  return null;
}

/** Début de la fenêtre glissante, en ISO, pour compter les envois récents. */
export function debutFenetre(maintenant: Date): string {
  return new Date(maintenant.getTime() - FENETRE_MINUTES * 60_000).toISOString();
}

// ── Les valeurs d'exemple ──────────────────────────────────────────────────

export type DonneesExemple = {
  prenom: string;
  nom: string;
  nomChien: string;
  /** Dans deux semaines : une date crédible, jamais dans le passé. */
  dateDebut: string;
  dateFin: string;
  heureArrivee: string;
  heureDepart: string;
  typeReservation: string;
  montant: number;
  montantAdhesion: number;
  dateFinAdhesion: string;
  numeroFacture: string;
  dateFacture: string;
  echeance: string;
  numeroTicket: string;
  numeroCommande: string;
  article: string;
  prixArticle: number;
  recapitulatif: string[];
  sujetMessageLibre: string;
  corpsMessageLibre: string;
};

function isoPlusJours(depuis: Date, jours: number): string {
  const d = new Date(depuis.getTime() + jours * 86_400_000);
  return d.toISOString().slice(0, 10);
}

export function donneesExemple(maintenant: Date): DonneesExemple {
  const debut = isoPlusJours(maintenant, 14);
  return {
    prenom: "Sabrina",
    nom: "Jean",
    nomChien: "Pixel",
    dateDebut: debut,
    dateFin: isoPlusJours(maintenant, 17),
    heureArrivee: "09:00",
    heureDepart: "17:00",
    typeReservation: "sejour",
    montant: 240,
    montantAdhesion: 200,
    // Une adhésion échue se lit au passé : sa fin est derrière nous.
    dateFinAdhesion: isoPlusJours(maintenant, -21),
    numeroFacture: "FAC-0000-TEST",
    dateFacture: isoPlusJours(maintenant, 0),
    echeance: isoPlusJours(maintenant, 30),
    numeroTicket: "TIC-0000-TEST",
    numeroCommande: "CMD-0000-TEST",
    article: "Collier en cuir cousu main",
    prixArticle: 68,
    recapitulatif: ["Couleur : Bleu nuit", "Taille : 45 cm", "Gravure : Pixel"],
    sujetMessageLibre: "Test d'envoi — La Dogosphère",
    corpsMessageLibre:
      "Bonjour {prenom},\n\n" +
      "Ceci est un e-mail de test envoyé depuis Réglages → E-mails. " +
      "Il utilise exactement le même chemin d'envoi que les vrais messages.\n\n" +
      "Le lien de désinscription en bas est réel : il vise la fiche client de " +
      "test, et le choix se reprend depuis Mon profil.\n\n" +
      "Bonne journée,\nLa Dogosphère",
  };
}

// ── Une pièce jointe de démonstration ──────────────────────────────────────

/**
 * Un PDF minimal mais VALIDE, pour les types qui exigent une pièce jointe
 * quand aucun document réel n'est disponible.
 *
 * Il est construit ici plutôt que téléchargé : le but est de vérifier que la
 * pièce jointe voyage et s'ouvre, pas d'en fabriquer une jolie. Les décalages
 * de la table `xref` sont calculés, sans quoi les lecteurs stricts refusent.
 */
export function pdfDemonstration(titre: string): Buffer {
  const texte = titre.replace(/[\\()]/g, " ").slice(0, 60);
  const objets = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 200] " +
      "/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    null, // le flux, construit juste après
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const flux = `BT /F1 16 Tf 40 120 Td (${texte}) Tj ET`;
  objets[3] = `<< /Length ${flux.length} >>\nstream\n${flux}\nendstream`;

  let pdf = "%PDF-1.4\n";
  const decalages: number[] = [];
  objets.forEach((corps, i) => {
    decalages.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${corps}\nendobj\n`;
  });

  const debutXref = pdf.length;
  pdf += `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n`;
  for (const d of decalages) pdf += `${String(d).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objets.length + 1} /Root 1 0 R >>\nstartxref\n${debutXref}\n%%EOF\n`;

  return Buffer.from(pdf, "latin1");
}
