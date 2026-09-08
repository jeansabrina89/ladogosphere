import * as Sentry from "@sentry/nextjs";
import { Resend } from "resend";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import {
  MENTION_SANS_RESERVATION,
  MODELE_RETOUR_EN_STOCK,
  META_RETOUR_EN_STOCK,
} from "@/src/lib/alertesStockLogique";
import { ajouterJoursISO } from "@/src/lib/cotisationPeriode";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = "La Dogosphère <noreply@ladogosphere.ch>";

// Base des URL absolues utilisees dans les emails (les images doivent etre
// accessibles publiquement depuis le client de messagerie). Repli sur le
// domaine qui repond aujourd'hui en HTTPS avec un certificat valide.
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://reservation.ladogosphere.ch";

// Template de base commun à tous les emails
const emailTemplate = (contenu: string) => `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; background-color:#F5F0E8; font-family: Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F5F0E8; padding: 30px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; background-color:white; border-radius:16px; overflow:hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background-color:#1B2B5E; padding:30px 40px; text-align:center;">
              <img src="${SITE_URL}/Logo.png" alt="La Dogosphère" style="height:70px; margin-bottom:10px;" />
              <p style="color:#9CA3AF; margin:0; font-size:13px; letter-spacing:1px; text-transform:uppercase;">Pension Canine — Sion, Valais</p>
            </td>
          </tr>

          <!-- Contenu -->
          <tr>
            <td style="padding:40px;">
              ${contenu}
            </td>
          </tr>

          <!-- Signature -->
          <tr>
            <td style="padding:0 40px 30px 40px;">
              <table cellpadding="0" cellspacing="0" style="border-top:2px solid #F5F0E8; padding-top:20px; width:100%;">
                <tr>
                  <td>
                    <p style="margin:0 0 4px 0; font-weight:bold; color:#1B2B5E; font-size:14px;">Sabrina Jean</p>
                    <p style="margin:0 0 4px 0; color:#6B7280; font-size:13px;">La Dogosphère Sàrl — Responsable</p>
                    <p style="margin:0 0 4px 0; color:#6B7280; font-size:13px;">📍 Sion, Valais, Suisse</p>
                    <p style="margin:0 0 4px 0; font-size:13px;">
                      <a href="mailto:ladogosphere@gmail.com" style="color:#4AAEA0; text-decoration:none;">✉️ ladogosphere@gmail.com</a>
                    </p>
                    <p style="margin:0; font-size:13px;">
                      <a href="https://ladogosphere.ch" style="color:#4AAEA0; text-decoration:none;">🌐 ladogosphere.ch</a>
                    </p>
                  </td>
                  <td style="text-align:right; vertical-align:top;">
                    <img src="${SITE_URL}/Logo.png" alt="Logo" style="height:50px; opacity:0.3;" />
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#1B2B5E; padding:16px 40px; text-align:center;">
              <p style="color:#6B7280; font-size:11px; margin:0;">
                © ${new Date().getFullYear()} La Dogosphère Sàrl — Tous droits réservés
              </p>
              <p style="color:#4B5563; font-size:11px; margin:4px 0 0 0;">
                Vous recevez cet email car vous avez effectué une réservation chez nous.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

const formatDate = (date: string) =>
  new Date(date + "T12:00:00").toLocaleDateString("fr-CH", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  });

const typeLabel = (type: string) => {
  if (type === "essai") return "🧪 Journée d'essai";
  if (type === "journee") return "☀️ Journée";
  return "🏠 Séjour";
};

// ===========================================================================
// MODELES D'EMAILS PERSONNALISABLES
// 4 champs editables par email (sujet, titre, intro, message_final).
// Si l'admin n'a rien personnalise (table modeles_email), on retombe sur les
// textes par defaut ci-dessous : le comportement reste identique a l'existant.
// Les variables {prenom}, {nom_chien}, {date_debut}... sont remplacees a l'envoi.
// ===========================================================================

export type ChampsModele = {
  sujet: string;
  titre: string;
  intro: string;
  message_final: string;
};

export const DEFAUTS_MODELES: Record<string, ChampsModele> = {
  // Les textes vivent avec la règle qu'ils servent, dans alertesStockLogique.
  retour_en_stock: { ...MODELE_RETOUR_EN_STOCK },
  commande_confirmee: {
    sujet: "🛍️ Votre commande {numero} est enregistrée",
    titre: "Merci {prenom} ! 🛍️",
    intro: "Nous avons bien reçu votre commande et nous la préparons.",
    message_final: "Une question sur votre commande ? Répondez simplement à cet e-mail.",
  },
  commande_expediee: {
    sujet: "📦 Votre commande {numero} est en route",
    titre: "C'est parti, {prenom} ! 📦",
    intro: "Votre commande a quitté la pension.",
    message_final: "Bonne réception ! 🐾",
  },
  confirmation_demande: {
    sujet: "🐾 Votre demande de réservation a été reçue",
    titre: "Bonjour {prenom} ! 👋",
    intro: "Nous avons bien reçu votre demande de réservation et nous vous en remercions.",
    message_final: "Pour toute question, n'hésitez pas à nous contacter directement par email ou téléphone.",
  },
  reservation_validee: {
    sujet: "✅ Votre réservation est confirmée !",
    titre: "Bonjour {prenom} ! 🎉",
    intro: "Excellente nouvelle ! Votre réservation a été <strong style=\"color:#4AAEA0;\">confirmée</strong> par notre équipe.",
    message_final: "Nous sommes impatients d'accueillir votre compagnon ! 🐶",
  },
  reservation_annulee: {
    sujet: "❌ Votre réservation a été annulée",
    titre: "Bonjour {prenom},",
    intro: "Nous vous informons que votre réservation a été <strong style=\"color:#E8847A;\">annulée</strong>.",
    message_final: "Nous espérons vous revoir bientôt à La Dogosphère ! 🐾",
  },
  reservation_refusee: {
    sujet: "🐾 Votre demande de réservation",
    titre: "Bonjour {prenom},",
    intro: "Nous sommes navrés : nous ne pouvons malheureusement pas <strong style=\"color:#E8847A;\">donner suite</strong> à votre demande de réservation pour les dates indiquées.",
    message_final: "N'hésitez pas à nous proposer d'autres dates — nous espérons pouvoir accueillir votre compagnon très bientôt ! 🐾",
  },
  paiement: {
    sujet: "💰 Règlement de votre séjour à La Dogosphère",
    titre: "Bonjour {prenom},",
    intro: "Voici le récapitulatif de votre séjour et les informations de paiement.",
    message_final: "Merci de procéder au règlement dans les meilleurs délais. N'hésitez pas à nous contacter pour toute question. 🐾",
  },
  satisfaction_essai: {
    sujet: "🐾 Comment s'est passée la journée d'essai ?",
    titre: "Bonjour {prenom} ! 🐶",
    intro: "Nous espérons que <strong>{nom_chien}</strong> est bien rentré à la maison ! Toute l'équipe a été ravie de l'avoir avec nous.",
    message_final: "À très bientôt pour un prochain séjour ! 🐾",
  },
  essai_valide: {
    sujet: "Tout s'est bien passé pour {nom_chien}",
    titre: "Bonjour {prenom} ! 🐶",
    intro: "La journée d'essai s'est bien passée : <strong>{nom_chien}</strong> est accepté à la pension.",
    message_final: "Toute l'équipe s'est réjouie de le rencontrer, et se réjouit déjà de le revoir ! 🐾",
  },
  essai_seconde_journee: {
    sujet: "Une seconde journée d'essai pour {nom_chien}",
    titre: "Bonjour {prenom} ! 🐶",
    intro: "<strong>{nom_chien}</strong> a besoin d'un peu plus de temps pour se sentir à l'aise chez nous. Nous vous proposons une seconde journée d'essai.",
    message_final: "N'hésitez pas à nous appeler si vous avez la moindre question — nous en discutons volontiers. 🐾",
  },
  rappel_veille: {
    sujet: "📅 Rappel — votre chien arrive demain !",
    titre: "Bonjour {prenom} ! 🐶",
    intro: "Petit rappel — <strong>{nom_chien}</strong> arrive <strong>demain</strong> à La Dogosphère !",
    message_final: "En cas d'imprévu, contactez-nous au plus vite. À demain ! 🐾",
  },
  facture_emise: {
    sujet: "Votre facture {numero} — La Dogosphère",
    titre: "Bonjour {prenom},",
    intro: "Voici votre facture <strong>{numero}</strong> du {date}, d'un montant de <strong>CHF {montant}</strong>, payable jusqu'au <strong>{echeance}</strong>.",
    message_final: "Le PDF est joint à ce message ; il est aussi disponible dans votre espace client. Merci de votre confiance ! 🐾",
  },
  commande_prete: {
    sujet: "🎁 Votre commande sur mesure est prête",
    titre: "Bonjour {prenom} ! 🎉",
    intro: "Votre commande <strong>{article}</strong> est terminée et vous attend à La Dogosphère.",
    message_final: "Passez la chercher quand vous voulez, aux heures d'ouverture. À très vite ! 🐾",
  },
  rappel_cotisation: {
    sujet: "⭐ Renouvellement de votre adhésion membre",
    titre: "Bonjour {prenom} ! ⭐",
    intro: "Votre adhésion membre La Dogosphère est échue depuis le <strong>{date_fin}</strong>.",
    message_final: "Merci pour votre fidélité ! Nous espérons vous accueillir encore longtemps. 🐶",
  },
  relance_paiement: {
    sujet: "Rappel : règlement de votre séjour à La Dogosphère",
    titre: "Bonjour {prenom},",
    intro: "Nous revenons vers vous au sujet du séjour de votre compagnon : son règlement de CHF {montant} ne nous est pas encore parvenu.",
    message_final: "Si le paiement a été effectué très récemment, merci de ne pas tenir compte de ce message. Un grand merci !",
  },
  rappel_paiement_1: {
    sujet: "1er rappel — règlement en attente",
    titre: "Bonjour {prenom},",
    intro: "Sauf erreur de notre part, le montant de CHF {montant} pour le séjour de votre compagnon reste impayé à ce jour.",
    message_final: "Nous vous remercions de bien vouloir procéder au règlement dans les meilleurs délais.",
  },
  rappel_paiement_2: {
    sujet: "2ème rappel — règlement impayé",
    titre: "Bonjour {prenom},",
    intro: "Malgré nos précédents messages, le montant de CHF {montant} reste impayé à ce jour. Nous vous remercions de régulariser votre situation sans tarder.",
    message_final: "Sans règlement de votre part, nous serons contraints d'envisager les démarches nécessaires. Nous restons bien sûr à votre disposition pour toute question.",
  },
};

// Libelles lisibles + variables proposees (pour l'ecran d'administration)
export const MODELES_META: { type: string; label: string; variables: string[] }[] = [
  { type: "confirmation_demande", label: "Demande reçue", variables: ["prenom", "date_debut", "date_fin"] },
  { type: "reservation_validee", label: "Réservation confirmée", variables: ["prenom", "date_debut", "date_fin"] },
  { type: "reservation_annulee", label: "Réservation annulée", variables: ["prenom", "date_debut", "date_fin"] },
  { type: "reservation_refusee", label: "Réservation refusée", variables: ["prenom", "date_debut", "date_fin"] },
  { type: "paiement", label: "Paiement / règlement", variables: ["prenom", "montant", "date_debut", "date_fin"] },
  { type: "satisfaction_essai", label: "Satisfaction après essai", variables: ["prenom", "nom_chien"] },
  { type: "essai_valide", label: "Journée d'essai — validée", variables: ["prenom", "nom_chien", "montant"] },
  { type: "essai_seconde_journee", label: "Journée d'essai — seconde journée", variables: ["prenom", "nom_chien"] },
  { type: "rappel_veille", label: "Rappel la veille", variables: ["prenom", "nom_chien", "date_debut"] },
  { type: "facture_emise", label: "Facture émise", variables: ["prenom", "numero", "date", "echeance", "montant"] },
  { type: "rappel_cotisation", label: "Rappel adhésion", variables: ["prenom", "nom", "date_fin", "montant"] },
  { type: "commande_prete", label: "Commande sur mesure prête", variables: ["prenom", "numero", "article", "recapitulatif"] },
  { ...META_RETOUR_EN_STOCK, variables: [...META_RETOUR_EN_STOCK.variables] },
  { type: "relance_paiement", label: "Relance paiement", variables: ["prenom", "montant", "date_debut", "date_fin"] },
  { type: "rappel_paiement_1", label: "1er rappel paiement", variables: ["prenom", "montant", "date_debut", "date_fin"] },
  { type: "rappel_paiement_2", label: "2ème rappel paiement", variables: ["prenom", "montant", "date_debut", "date_fin"] },
];

function interpoler(texte: string, vars: Record<string, string | number | undefined | null>): string {
  return texte.replace(/\{(\w+)\}/g, (_m, cle) => {
    const v = vars[cle];
    return v === undefined || v === null ? "" : String(v);
  });
}

// Charge le modele personnalise (ou le defaut), et remplace les variables.
async function modeleEmail(
  type: string,
  vars: Record<string, string | number | undefined | null>
): Promise<ChampsModele> {
  const def = DEFAUTS_MODELES[type];
  let row: Partial<ChampsModele> | null = null;
  try {
    const { data } = await supabaseAdmin
      .from("modeles_email")
      .select("sujet, titre, intro, message_final")
      .eq("type", type)
      .maybeSingle();
    row = data;
  } catch {
    row = null;
  }
  const choisir = (perso: string | null | undefined, defaut: string) => {
    const base = perso && perso.trim() !== "" ? perso : defaut;
    return interpoler(base, vars);
  };
  return {
    sujet: choisir(row?.sujet, def.sujet),
    titre: choisir(row?.titre, def.titre),
    intro: choisir(row?.intro, def.intro),
    message_final: choisir(row?.message_final, def.message_final),
  };
}

async function envoyerEmail(p: {
  destinataire: string;
  type: string;
  sujet: string;
  html: string;
  reservationId?: string | null;
  /** Pièces jointes (le PDF d'une facture, par exemple). */
  piecesJointes?: { filename: string; content: Buffer }[];
}) {
  const { data, error } = await resend.emails.send({
    from: FROM,
    to: p.destinataire,
    subject: p.sujet,
    html: p.html,
    ...(p.piecesJointes && p.piecesJointes.length > 0
      ? { attachments: p.piecesJointes.map((f) => ({ filename: f.filename, content: f.content })) }
      : {}),
  });
  await supabaseAdmin.from("emails_envoyes").insert({
    destinataire: p.destinataire,
    type: p.type,
    sujet: p.sujet,
    statut: error ? "echec" : "envoye",
    resend_id: data?.id ?? null,
    erreur: error ? String((error as any).message ?? error).slice(0, 500) : null,
    reservation_id: p.reservationId ?? null,
  });
  if (error) {
    Sentry.captureException(error);
    throw new Error("Resend: " + ((error as any).message ?? error));
  }
}

// Message libre (campagne / annonce) envoye a une liste de clients ou membres.
// {prenom} et {nom} sont remplaces pour chaque destinataire.
export async function envoyerMessageLibre(p: {
  email: string;
  sujet: string;
  corps: string;
  prenom?: string | null;
  nom?: string | null;
  /**
   * Jeton de désinscription du destinataire. C'est le SEUL envoi qui porte un
   * lien de désinscription : les e-mails liés aux réservations, aux factures et
   * à l'adhésion n'en ont pas, et ne sont jamais filtrés par le consentement.
   */
  token?: string | null;
}) {
  const vars = { prenom: p.prenom ?? "", nom: p.nom ?? "" };
  const sujet = interpoler(p.sujet, vars);
  const corpsHtml = interpoler(p.corps, vars)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");

  const pied = p.token
    ? `
      <table cellpadding="0" cellspacing="0" style="width:100%; margin-top:28px; border-top:1px solid #F5F0E8;">
        <tr>
          <td style="padding-top:16px;">
            <p style="margin:0 0 4px 0; color:#9CA3AF; font-size:12px; line-height:1.6;">
              Vous recevez cet e-mail parce que vous êtes client de La Dogosphère.
            </p>
            <p style="margin:0; font-size:12px;">
              <a href="${SITE_URL}/desinscription?t=${encodeURIComponent(p.token)}"
                 style="color:#9CA3AF; text-decoration:underline;">Se désinscrire des informations</a>
            </p>
          </td>
        </tr>
      </table>`
    : "";

  await envoyerEmail({
    destinataire: p.email,
    type: "campagne",
    sujet,
    html: emailTemplate(`
      <div style="color:#1B2B5E; font-size:15px; line-height:1.7;">${corpsHtml}</div>
      ${pied}
    `),
  });
}

export async function envoyerEmailConfirmationDemande({
  email, prenom, date_debut, date_fin, type,
}: {
  email: string; prenom: string; date_debut: string; date_fin: string; type: string;
}) {
  const m = await modeleEmail("confirmation_demande", {
    prenom, date_debut: formatDate(date_debut), date_fin: formatDate(date_fin),
  });
  await envoyerEmail({
    destinataire: email,
    type: "confirmation_demande",
    sujet: m.sujet,
    html: emailTemplate(`
      <h2 style="color:#1B2B5E; margin:0 0 8px 0;">${m.titre}</h2>
      <p style="color:#6B7280; margin:0 0 24px 0;">${m.intro}</p>

      <div style="background-color:#F5F0E8; border-radius:12px; padding:20px; margin:0 0 24px 0;">
        <h3 style="color:#1B2B5E; margin:0 0 16px 0; font-size:15px; text-transform:uppercase; letter-spacing:0.5px;">📋 Récapitulatif</h3>
        <table cellpadding="0" cellspacing="0" style="width:100%;">
          <tr>
            <td style="padding:6px 0; color:#6B7280; font-size:14px; width:40%;">Type</td>
            <td style="padding:6px 0; color:#1B2B5E; font-weight:bold; font-size:14px;">${typeLabel(type)}</td>
          </tr>
          <tr>
            <td style="padding:6px 0; color:#6B7280; font-size:14px;">Arrivée</td>
            <td style="padding:6px 0; color:#1B2B5E; font-weight:bold; font-size:14px;">${formatDate(date_debut)}</td>
          </tr>
          <tr>
            <td style="padding:6px 0; color:#6B7280; font-size:14px;">Départ</td>
            <td style="padding:6px 0; color:#1B2B5E; font-weight:bold; font-size:14px;">${formatDate(date_fin)}</td>
          </tr>
        </table>
      </div>

      <div style="background-color:#E8F5F4; border-left:4px solid #4AAEA0; border-radius:8px; padding:16px; margin:0 0 24px 0;">
        <p style="margin:0; color:#1B5E4F; font-size:14px;">
          ⏳ Notre équipe va traiter votre demande et vous confirmera sous <strong>24 heures</strong>.
        </p>
      </div>

      <p style="color:#6B7280; font-size:14px; margin:0;">
        ${m.message_final}
      </p>
    `),
  });
}

export async function envoyerEmailReservationValidee({
  email, prenom, date_debut, date_fin, type, box_label, heure_arrivee, heure_depart,
}: {
  email: string; prenom: string; date_debut: string; date_fin: string;
  type: string; box_label?: string; heure_arrivee?: string; heure_depart?: string;
}) {
  const m = await modeleEmail("reservation_validee", {
    prenom, date_debut: formatDate(date_debut), date_fin: formatDate(date_fin),
  });
  await envoyerEmail({
    destinataire: email,
    type: "reservation_validee",
    sujet: m.sujet,
    html: emailTemplate(`
      <h2 style="color:#1B2B5E; margin:0 0 8px 0;">${m.titre}</h2>
      <p style="color:#6B7280; margin:0 0 24px 0;">${m.intro}</p>

      <div style="background-color:#F5F0E8; border-radius:12px; padding:20px; margin:0 0 24px 0;">
        <h3 style="color:#1B2B5E; margin:0 0 16px 0; font-size:15px; text-transform:uppercase; letter-spacing:0.5px;">📋 Détails de votre séjour</h3>
        <table cellpadding="0" cellspacing="0" style="width:100%;">
          <tr>
            <td style="padding:6px 0; color:#6B7280; font-size:14px; width:40%;">Type</td>
            <td style="padding:6px 0; color:#1B2B5E; font-weight:bold; font-size:14px;">${typeLabel(type)}</td>
          </tr>
          <tr>
            <td style="padding:6px 0; color:#6B7280; font-size:14px;">Arrivée</td>
            <td style="padding:6px 0; color:#1B2B5E; font-weight:bold; font-size:14px;">${formatDate(date_debut)}${heure_arrivee ? ` à ${heure_arrivee}` : ""}</td>
          </tr>
          <tr>
            <td style="padding:6px 0; color:#6B7280; font-size:14px;">Départ</td>
            <td style="padding:6px 0; color:#1B2B5E; font-weight:bold; font-size:14px;">${formatDate(date_fin)}${heure_depart ? ` à ${heure_depart}` : ""}</td>
          </tr>
          ${box_label ? `
          <tr>
            <td style="padding:6px 0; color:#6B7280; font-size:14px;">Box assigné</td>
            <td style="padding:6px 0; color:#1B2B5E; font-weight:bold; font-size:14px;">${box_label}</td>
          </tr>` : ""}
        </table>
      </div>

      <div style="background-color:#E8F5F4; border-left:4px solid #4AAEA0; border-radius:8px; padding:16px; margin:0 0 24px 0;">
        <p style="margin:0 0 8px 0; color:#1B5E4F; font-size:14px; font-weight:bold;">📍 Informations pratiques</p>
        <p style="margin:0; color:#1B5E4F; font-size:13px;">
          Arrivée journée : 7h35 – 10h00<br/>
          Départ journée : 17h00 – 18h00<br/>
          Arrivée/départ séjour : 9h00 – 10h00 ou 17h00 – 18h00
        </p>
      </div>

      <p style="color:#6B7280; font-size:14px; margin:0;">
        ${m.message_final}
      </p>
    `),
  });
}

export async function envoyerEmailReservationAnnulee({
  email, prenom, date_debut, date_fin, type,
}: {
  email: string; prenom: string; date_debut: string; date_fin: string; type: string;
}) {
  const m = await modeleEmail("reservation_annulee", {
    prenom, date_debut: formatDate(date_debut), date_fin: formatDate(date_fin),
  });
  await envoyerEmail({
    destinataire: email,
    type: "reservation_annulee",
    sujet: m.sujet,
    html: emailTemplate(`
      <h2 style="color:#1B2B5E; margin:0 0 8px 0;">${m.titre}</h2>
      <p style="color:#6B7280; margin:0 0 24px 0;">${m.intro}</p>

      <div style="background-color:#F5F0E8; border-radius:12px; padding:20px; margin:0 0 24px 0;">
        <h3 style="color:#1B2B5E; margin:0 0 16px 0; font-size:15px; text-transform:uppercase; letter-spacing:0.5px;">📋 Réservation annulée</h3>
        <table cellpadding="0" cellspacing="0" style="width:100%;">
          <tr>
            <td style="padding:6px 0; color:#6B7280; font-size:14px; width:40%;">Type</td>
            <td style="padding:6px 0; color:#1B2B5E; font-weight:bold; font-size:14px;">${typeLabel(type)}</td>
          </tr>
          <tr>
            <td style="padding:6px 0; color:#6B7280; font-size:14px;">Arrivée</td>
            <td style="padding:6px 0; color:#1B2B5E; font-weight:bold; font-size:14px;">${formatDate(date_debut)}</td>
          </tr>
          <tr>
            <td style="padding:6px 0; color:#6B7280; font-size:14px;">Départ</td>
            <td style="padding:6px 0; color:#1B2B5E; font-weight:bold; font-size:14px;">${formatDate(date_fin)}</td>
          </tr>
        </table>
      </div>

      <div style="background-color:#FEF2F2; border-left:4px solid #E8847A; border-radius:8px; padding:16px; margin:0 0 24px 0;">
        <p style="margin:0; color:#7F1D1D; font-size:14px;">
          Si vous n'êtes pas à l'origine de cette annulation ou si vous souhaitez faire une nouvelle réservation, contactez-nous directement.
        </p>
      </div>

      <p style="color:#6B7280; font-size:14px; margin:0;">
        ${m.message_final}
      </p>
    `),
  });
}

export async function envoyerEmailReservationRefusee({
  email, prenom, date_debut, date_fin, type,
}: {
  email: string; prenom: string; date_debut: string; date_fin: string; type: string;
}) {
  const m = await modeleEmail("reservation_refusee", {
    prenom, date_debut: formatDate(date_debut), date_fin: formatDate(date_fin),
  });
  await envoyerEmail({
    destinataire: email,
    type: "reservation_refusee",
    sujet: m.sujet,
    html: emailTemplate(`
      <h2 style="color:#1B2B5E; margin:0 0 8px 0;">${m.titre}</h2>
      <p style="color:#6B7280; margin:0 0 24px 0;">${m.intro}</p>

      <div style="background-color:#F5F0E8; border-radius:12px; padding:20px; margin:0 0 24px 0;">
        <h3 style="color:#1B2B5E; margin:0 0 16px 0; font-size:15px; text-transform:uppercase; letter-spacing:0.5px;">📋 Votre demande</h3>
        <table cellpadding="0" cellspacing="0" style="width:100%;">
          <tr>
            <td style="padding:6px 0; color:#6B7280; font-size:14px; width:40%;">Type</td>
            <td style="padding:6px 0; color:#1B2B5E; font-weight:bold; font-size:14px;">${typeLabel(type)}</td>
          </tr>
          <tr>
            <td style="padding:6px 0; color:#6B7280; font-size:14px;">Arrivée</td>
            <td style="padding:6px 0; color:#1B2B5E; font-weight:bold; font-size:14px;">${formatDate(date_debut)}</td>
          </tr>
          <tr>
            <td style="padding:6px 0; color:#6B7280; font-size:14px;">Départ</td>
            <td style="padding:6px 0; color:#1B2B5E; font-weight:bold; font-size:14px;">${formatDate(date_fin)}</td>
          </tr>
        </table>
      </div>

      <div style="background-color:#FEF2F2; border-left:4px solid #E8847A; border-radius:8px; padding:16px; margin:0 0 24px 0;">
        <p style="margin:0; color:#7F1D1D; font-size:14px;">
          Vos dates ne sont peut-être plus disponibles, mais nous ferons notre possible pour trouver une solution. Contactez-nous ou proposez-nous d'autres dates.
        </p>
      </div>

      <p style="color:#6B7280; font-size:14px; margin:0;">
        ${m.message_final}
      </p>
    `),
  });
}

export async function envoyerEmailPaiement({
  email, prenom, montant, date_debut, date_fin, type, iban, titulaire, numeroFacture,
}: {
  email: string; prenom: string; montant: number;
  date_debut: string; date_fin: string; type: string;
  iban: string; titulaire: string;
  /** Seule référence de paiement communiquée au client (jamais le n° de résa). */
  numeroFacture?: string | null;
}) {
  const m = await modeleEmail("paiement", {
    prenom, montant: montant.toFixed(2),
    date_debut: formatDate(date_debut), date_fin: formatDate(date_fin),
  });
  await envoyerEmail({
    destinataire: email,
    type: "paiement",
    sujet: m.sujet,
    html: emailTemplate(`
      <h2 style="color:#1B2B5E; margin:0 0 8px 0;">${m.titre}</h2>
      <p style="color:#6B7280; margin:0 0 24px 0;">${m.intro}</p>

      <div style="background-color:#F5F0E8; border-radius:12px; padding:20px; margin:0 0 24px 0;">
        <h3 style="color:#1B2B5E; margin:0 0 16px 0; font-size:15px; text-transform:uppercase; letter-spacing:0.5px;">📋 Votre séjour</h3>
        <table cellpadding="0" cellspacing="0" style="width:100%;">
          <tr>
            <td style="padding:6px 0; color:#6B7280; font-size:14px; width:40%;">Type</td>
            <td style="padding:6px 0; color:#1B2B5E; font-weight:bold; font-size:14px;">${typeLabel(type)}</td>
          </tr>
          <tr>
            <td style="padding:6px 0; color:#6B7280; font-size:14px;">Arrivée</td>
            <td style="padding:6px 0; color:#1B2B5E; font-weight:bold; font-size:14px;">${formatDate(date_debut)}</td>
          </tr>
          <tr>
            <td style="padding:6px 0; color:#6B7280; font-size:14px;">Départ</td>
            <td style="padding:6px 0; color:#1B2B5E; font-weight:bold; font-size:14px;">${formatDate(date_fin)}</td>
          </tr>
          <tr>
            <td style="padding:6px 0; color:#6B7280; font-size:14px;">Montant</td>
            <td style="padding:6px 0; color:#1B2B5E; font-weight:bold; font-size:18px;">CHF ${montant.toFixed(2)}</td>
          </tr>
        </table>
      </div>

      <div style="background-color:#FFF8E1; border-left:4px solid #C9A84C; border-radius:8px; padding:16px; margin:0 0 24px 0;">
        <p style="margin:0 0 8px 0; color:#7A5C00; font-size:14px; font-weight:bold;">💳 Moyens de paiement</p>
        ${iban ? `
        <p style="margin:0 0 6px 0; color:#7A5C00; font-size:13px;">
          <strong>Virement bancaire :</strong> IBAN ${iban}<br/>
          <strong>Titulaire :</strong> ${titulaire}<br/>
          ${numeroFacture
            ? `<strong>Référence :</strong> ${numeroFacture}`
            : `<strong>Référence :</strong> elle figurera sur votre facture`}
        </p>` : `
        <p style="margin:0 0 6px 0; color:#7A5C00; font-size:13px;">
          Les coordonnées de paiement vous seront communiquées séparément.
        </p>`}
        <p style="margin:8px 0 0 0; color:#7A5C00; font-size:13px;">
          <strong>Twint :</strong> disponible sur demande
        </p>
      </div>

      <p style="color:#6B7280; font-size:14px; margin:0;">
        ${m.message_final}
      </p>
    `),
  });
}

export async function envoyerEmailRelancePaiement({
  email, prenom, montant, date_debut, date_fin, type, iban, titulaire, niveau, numeroFacture,
}: {
  email: string; prenom: string; montant: number;
  date_debut: string; date_fin: string; type: string;
  /** Seule reference de paiement communiquee au client. */
  numeroFacture?: string | null;
  iban: string; titulaire: string; niveau: 1 | 2 | 3;
}) {
  const typeModele =
    niveau === 3 ? "rappel_paiement_2" : niveau === 2 ? "rappel_paiement_1" : "relance_paiement";
  const m = await modeleEmail(typeModele, {
    prenom, montant: montant.toFixed(2),
    date_debut: formatDate(date_debut), date_fin: formatDate(date_fin),
  });
  await envoyerEmail({
    destinataire: email,
    type: typeModele,
    sujet: m.sujet,
    html: emailTemplate(`
      <h2 style="color:#1B2B5E; margin:0 0 8px 0;">${m.titre}</h2>
      <p style="color:#6B7280; margin:0 0 24px 0;">${m.intro}</p>

      <div style="background-color:#F5F0E8; border-radius:12px; padding:20px; margin:0 0 24px 0;">
        <h3 style="color:#1B2B5E; margin:0 0 16px 0; font-size:15px; text-transform:uppercase; letter-spacing:0.5px;">📋 Votre séjour</h3>
        <table cellpadding="0" cellspacing="0" style="width:100%;">
          <tr>
            <td style="padding:6px 0; color:#6B7280; font-size:14px; width:40%;">Type</td>
            <td style="padding:6px 0; color:#1B2B5E; font-weight:bold; font-size:14px;">${typeLabel(type)}</td>
          </tr>
          <tr>
            <td style="padding:6px 0; color:#6B7280; font-size:14px;">Arrivée</td>
            <td style="padding:6px 0; color:#1B2B5E; font-weight:bold; font-size:14px;">${formatDate(date_debut)}</td>
          </tr>
          <tr>
            <td style="padding:6px 0; color:#6B7280; font-size:14px;">Départ</td>
            <td style="padding:6px 0; color:#1B2B5E; font-weight:bold; font-size:14px;">${formatDate(date_fin)}</td>
          </tr>
          <tr>
            <td style="padding:6px 0; color:#6B7280; font-size:14px;">Montant dû</td>
            <td style="padding:6px 0; color:#1B2B5E; font-weight:bold; font-size:18px;">CHF ${montant.toFixed(2)}</td>
          </tr>
        </table>
      </div>

      <div style="background-color:#FFF8E1; border-left:4px solid #C9A84C; border-radius:8px; padding:16px; margin:0 0 24px 0;">
        <p style="margin:0 0 8px 0; color:#7A5C00; font-size:14px; font-weight:bold;">💳 Moyens de paiement</p>
        ${iban ? `
        <p style="margin:0 0 6px 0; color:#7A5C00; font-size:13px;">
          <strong>Virement bancaire :</strong> IBAN ${iban}<br/>
          <strong>Titulaire :</strong> ${titulaire}<br/>
          ${numeroFacture
            ? `<strong>Référence :</strong> ${numeroFacture}`
            : `<strong>Référence :</strong> elle figurera sur votre facture`}
        </p>` : `
        <p style="margin:0 0 6px 0; color:#7A5C00; font-size:13px;">
          Les coordonnées de paiement vous seront communiquées séparément.
        </p>`}
        <p style="margin:8px 0 0 0; color:#7A5C00; font-size:13px;">
          <strong>Twint :</strong> disponible sur demande
        </p>
      </div>

      <p style="color:#6B7280; font-size:14px; margin:0;">
        ${m.message_final}
      </p>
    `),
  });
}

export async function envoyerEmailSatisfactionEssai({
  email, prenom, nom_chien,
}: {
  email: string; prenom: string; nom_chien: string;
}) {
  const m = await modeleEmail("satisfaction_essai", { prenom, nom_chien });
  await envoyerEmail({
    destinataire: email,
    type: "satisfaction_essai",
    sujet: m.sujet,
    html: emailTemplate(`
      <h2 style="color:#1B2B5E; margin:0 0 8px 0;">${m.titre}</h2>
      <p style="color:#6B7280; margin:0 0 24px 0;">
        ${m.intro}
      </p>

      <div style="background-color:#E8F5F4; border-left:4px solid #4AAEA0; border-radius:8px; padding:16px; margin:0 0 24px 0;">
        <p style="margin:0; color:#1B5E4F; font-size:14px;">
          Votre avis nous tient à cœur — si vous avez quelques minutes, nous serions très reconnaissants de recevoir votre retour.
          Cela nous aide à nous améliorer et à faire connaître La Dogosphère.
        </p>
      </div>

      <p style="color:#6B7280; font-size:14px; margin:0 0 24px 0;">
        ${m.message_final}
      </p>
    `),
  });
}

/**
 * Résultat de la journée d'essai, envoyé automatiquement au départ du chien.
 * Aucun e-mail en cas de refus : le résultat est expliqué de vive voix au
 * propriétaire. La note interne saisie au départ n'est jamais reprise ici.
 */
export async function envoyerEmailResultatEssai({
  email, prenom, nom_chien, resultat,
}: {
  email: string; prenom: string; nom_chien: string;
  resultat: "valide" | "seconde_journee";
}) {
  if (resultat !== "valide" && resultat !== "seconde_journee") return;

  // Le montant de la cotisation vient TOUJOURS du paramètre.
  let montant = 200;
  try {
    const { data } = await supabaseAdmin
      .from("parametres")
      .select("valeur")
      .eq("cle", "cotisation_montant")
      .maybeSingle();
    montant = parseFloat(data?.valeur ?? "200") || 200;
  } catch { /* valeur de repli */ }

  const type = resultat === "valide" ? "essai_valide" : "essai_seconde_journee";
  const m = await modeleEmail(type, { prenom, nom_chien, montant: montant.toFixed(2) });

  const lienReserver = `${SITE_URL}/mon-compte/reservations/nouvelle`;
  const libelleBouton = resultat === "valide" ? "Réserver" : "Réserver la seconde journée";

  const bloc = resultat === "valide"
    ? `
      <div style="background-color:#E8F5F4; border-left:4px solid #4AAEA0; border-radius:8px; padding:16px; margin:0 0 24px 0;">
        <p style="margin:0 0 8px 0; color:#1B5E4F; font-size:14px;">
          Vous pouvez dès maintenant réserver ses journées et ses séjours depuis votre espace client.
        </p>
        <p style="margin:0; color:#1B5E4F; font-size:14px;">
          La cotisation annuelle de <strong>CHF ${montant.toFixed(2)}</strong> se règle avant ou avec la
          première réservation — elle est ajoutée automatiquement à votre première réservation.
        </p>
      </div>`
    : `
      <div style="background-color:#FFF8E1; border-left:4px solid #C9A84C; border-radius:8px; padding:16px; margin:0 0 24px 0;">
        <p style="margin:0 0 8px 0; color:#7A5C00; font-size:14px;">
          Cette seconde journée se réserve depuis votre espace client, au tarif d'une journée de garderie.
        </p>
        <p style="margin:0; color:#7A5C00; font-size:14px;">
          La cotisation n'est pas due tant que la journée d'essai n'est pas concluante.
        </p>
      </div>`;

  await envoyerEmail({
    destinataire: email,
    type,
    sujet: m.sujet,
    html: emailTemplate(`
      <h2 style="color:#1B2B5E; margin:0 0 8px 0;">${m.titre}</h2>
      <p style="color:#6B7280; margin:0 0 24px 0;">
        ${m.intro}
      </p>

      ${bloc}

      <table cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;">
        <tr>
          <td style="background-color:#4AAEA0; border-radius:12px;">
            <a href="${lienReserver}"
              style="display:inline-block; padding:14px 28px; color:#ffffff; font-size:15px; font-weight:bold; text-decoration:none;">
              ${libelleBouton}
            </a>
          </td>
        </tr>
      </table>

      <p style="color:#6B7280; font-size:14px; margin:0;">
        ${m.message_final}
      </p>
    `),
  });
}

export async function envoyerEmailRappelVeille({
  email, prenom, nom_chien, date_debut, heure_arrivee, type,
}: {
  email: string; prenom: string; nom_chien: string;
  date_debut: string; heure_arrivee?: string; type: string;
}) {
  const m = await modeleEmail("rappel_veille", {
    prenom, nom_chien, date_debut: formatDate(date_debut),
  });
  await envoyerEmail({
    destinataire: email,
    type: "rappel_veille",
    sujet: m.sujet,
    html: emailTemplate(`
      <h2 style="color:#1B2B5E; margin:0 0 8px 0;">${m.titre}</h2>
      <p style="color:#6B7280; margin:0 0 24px 0;">
        ${m.intro}
      </p>

      <div style="background-color:#F5F0E8; border-radius:12px; padding:20px; margin:0 0 24px 0;">
        <h3 style="color:#1B2B5E; margin:0 0 16px 0; font-size:15px; text-transform:uppercase; letter-spacing:0.5px;">📋 Votre réservation</h3>
        <table cellpadding="0" cellspacing="0" style="width:100%;">
          <tr>
            <td style="padding:6px 0; color:#6B7280; font-size:14px; width:40%;">Type</td>
            <td style="padding:6px 0; color:#1B2B5E; font-weight:bold; font-size:14px;">${typeLabel(type)}</td>
          </tr>
          <tr>
            <td style="padding:6px 0; color:#6B7280; font-size:14px;">Arrivée</td>
            <td style="padding:6px 0; color:#1B2B5E; font-weight:bold; font-size:14px;">${formatDate(date_debut)}${heure_arrivee ? ` à ${heure_arrivee}` : ""}</td>
          </tr>
        </table>
      </div>

      <div style="background-color:#E8F5F4; border-left:4px solid #4AAEA0; border-radius:8px; padding:16px; margin:0 0 24px 0;">
        <p style="margin:0 0 8px 0; color:#1B5E4F; font-size:14px; font-weight:bold;">🎒 N'oubliez pas :</p>
        <p style="margin:0; color:#1B5E4F; font-size:13px;">
          ✔ Sa nourriture habituelle (quantités pour toute la durée du séjour)<br/>
          ✔ Son carnet de vaccination à jour<br/>
          ✔ Un jouet ou une couverture pour le rassurer<br/>
          ✔ Tout médicament en cours avec les instructions
        </p>
      </div>

      <div style="background-color:#FFF8E1; border-left:4px solid #C9A84C; border-radius:8px; padding:16px; margin:0 0 24px 0;">
        <p style="margin:0 0 4px 0; color:#7A5C00; font-size:14px; font-weight:bold;">⏰ Horaires d'arrivée</p>
        <p style="margin:0; color:#7A5C00; font-size:13px;">
          Journée : 7h35 – 10h00<br/>
          Séjour : 9h00 – 10h00 ou 17h00 – 18h00
        </p>
      </div>

      <p style="color:#6B7280; font-size:14px; margin:0;">
        ${m.message_final}
      </p>
    `),
  });
}

/**
 * Rappel de cotisation échue. Deux variantes, un seul modèle `rappel_cotisation` :
 * - "echue"  : envoyé le lendemain de la date de fin ;
 * - "rappel" : envoyé 30 jours après la date de fin.
 * Seuls le titre et la première phrase changent.
 */
const VARIANTES_RAPPEL_COTISATION = {
  echue: {
    titre: "Bonjour {prenom} ! ⭐",
    intro:
      "Votre adhésion membre La Dogosphère est arrivée à échéance le <strong>{date_fin}</strong>. " +
      "Renouvelez-la pour continuer à profiter des tarifs membres.",
  },
  rappel: {
    titre: "Bonjour {prenom}, petit rappel ⭐",
    intro:
      "Votre adhésion membre La Dogosphère est échue depuis un mois (échéance le <strong>{date_fin}</strong>). " +
      "Sans renouvellement, les tarifs membres ne s'appliquent plus à vos réservations.",
  },
} as const;

export type VarianteRappelCotisation = keyof typeof VARIANTES_RAPPEL_COTISATION;

export async function envoyerEmailRappelCotisation({
  email, prenom, nom, date_fin, montant, iban, titulaire, variante = "echue",
}: {
  email: string; prenom: string; nom: string;
  /** date_fin de la cotisation échue, au format ISO "YYYY-MM-DD". */
  date_fin: string;
  montant: number; iban: string; titulaire: string;
  variante?: VarianteRappelCotisation;
}) {
  const finLisible = formatDate(date_fin);
  const vars = { prenom, nom, date_fin: finLisible, montant: montant.toFixed(2) };
  const m = await modeleEmail("rappel_cotisation", vars);
  const v = VARIANTES_RAPPEL_COTISATION[variante];
  // Titre + première phrase : pilotés par la variante (échue / rappel).
  const titre = interpoler(v.titre, vars);
  const intro = interpoler(v.intro, vars);
  // Référence de paiement : mois de début de la NOUVELLE période (lendemain de
  // l'échéance), pour que le virement soit rattachable sans ambiguïté.
  const debutNouvellePeriode = ajouterJoursISO(date_fin, 1);
  const [anneeRef, moisRef] = debutNouvellePeriode.split("-");
  const referencePaiement = `${prenom} ${nom} Adhesion ${moisRef}.${anneeRef}`;
  await envoyerEmail({
    destinataire: email,
    type: "rappel_cotisation",
    sujet: m.sujet,
    html: emailTemplate(`
      <h2 style="color:#1B2B5E; margin:0 0 8px 0;">${titre}</h2>
      <p style="color:#6B7280; margin:0 0 24px 0;">
        ${intro}
      </p>

      <div style="background-color:#F5F0E8; border-radius:12px; padding:20px; margin:0 0 24px 0;">
        <h3 style="color:#1B2B5E; margin:0 0 16px 0; font-size:15px; text-transform:uppercase; letter-spacing:0.5px;">⭐ Votre adhésion</h3>
        <table cellpadding="0" cellspacing="0" style="width:100%;">
          <tr>
            <td style="padding:6px 0; color:#6B7280; font-size:14px; width:40%;">Statut actuel</td>
            <td style="padding:6px 0; color:#1B2B5E; font-weight:bold; font-size:14px;">⏳ Adhésion échue</td>
          </tr>
          <tr>
            <td style="padding:6px 0; color:#6B7280; font-size:14px;">Échue le</td>
            <td style="padding:6px 0; color:#1B2B5E; font-weight:bold; font-size:14px;">${finLisible}</td>
          </tr>
          <tr>
            <td style="padding:6px 0; color:#6B7280; font-size:14px;">Renouvellement de l'adhésion</td>
            <td style="padding:6px 0; color:#1B2B5E; font-weight:bold; font-size:18px;">CHF ${montant.toFixed(2)}</td>
          </tr>
        </table>
      </div>

      <div style="background-color:#E8F5F4; border-left:4px solid #4AAEA0; border-radius:8px; padding:16px; margin:0 0 24px 0;">
        <p style="margin:0 0 8px 0; color:#1B5E4F; font-size:14px; font-weight:bold;">🐾 Avantages membres</p>
        <p style="margin:0; color:#1B5E4F; font-size:13px;">
          ✔ Tarifs préférentiels sur toutes les réservations<br/>
          ✔ Accès aux réservations d'urgence<br/>
          ✔ Priorité lors des périodes chargées
        </p>
      </div>

      <div style="background-color:#FFF8E1; border-left:4px solid #C9A84C; border-radius:8px; padding:16px; margin:0 0 24px 0;">
        <p style="margin:0 0 12px 0; color:#7A5C00; font-size:14px; font-weight:bold;">🏦 Comment renouveler ?</p>
        <p style="margin:0 0 8px 0; color:#7A5C00; font-size:13px;">
          Effectuez un virement bancaire avec les informations suivantes :
        </p>
        <table cellpadding="0" cellspacing="0" style="width:100%;">
          ${iban ? `
          <tr>
            <td style="padding:4px 0; color:#7A5C00; font-size:13px; width:35%;">IBAN</td>
            <td style="padding:4px 0; color:#7A5C00; font-weight:bold; font-size:13px;">${iban}</td>
          </tr>
          <tr>
            <td style="padding:4px 0; color:#7A5C00; font-size:13px;">Titulaire</td>
            <td style="padding:4px 0; color:#7A5C00; font-weight:bold; font-size:13px;">${titulaire}</td>
          </tr>` : `
          <tr>
            <td colspan="2" style="padding:4px 0; color:#7A5C00; font-size:13px;">Coordonnées bancaires communiquées séparément.</td>
          </tr>`}
          <tr>
            <td style="padding:4px 0; color:#7A5C00; font-size:13px;">Montant</td>
            <td style="padding:4px 0; color:#7A5C00; font-weight:bold; font-size:13px;">CHF ${montant.toFixed(2)}</td>
          </tr>
          <tr>
            <td style="padding:4px 0; color:#7A5C00; font-size:13px;">Référence</td>
            <td style="padding:4px 0; color:#7A5C00; font-weight:bold; font-size:13px;">${referencePaiement}</td>
          </tr>
        </table>
      </div>

      <p style="color:#6B7280; font-size:14px; margin:0;">
        ${m.message_final}
      </p>
    `),
  });
}

/**
 * Facture émise : le PDF part en pièce jointe, avec un lien vers l'espace
 * client. Une seule référence de paiement est communiquée : le numéro de
 * facture (et sa QRR sur le bulletin) — jamais le numéro de réservation.
 */
export async function envoyerEmailFactureEmise(p: {
  email: string;
  prenom: string;
  numero: string;
  date: string;
  echeance: string;
  montant: number;
  pdf?: Buffer | null;
}) {
  const vars = {
    prenom: p.prenom,
    numero: p.numero,
    date: formatDate(p.date),
    echeance: formatDate(p.echeance),
    montant: p.montant.toFixed(2),
  };
  const m = await modeleEmail("facture_emise", vars);

  await envoyerEmail({
    destinataire: p.email,
    type: "facture_emise",
    sujet: m.sujet,
    piecesJointes: p.pdf ? [{ filename: `${p.numero}.pdf`, content: p.pdf }] : undefined,
    html: emailTemplate(`
      <h2 style="color:#1B2B5E; margin:0 0 8px 0;">${m.titre}</h2>
      <p style="color:#6B7280; margin:0 0 24px 0;">${m.intro}</p>

      <div style="background-color:#F5F0E8; border-radius:12px; padding:20px; margin:0 0 24px 0;">
        <table cellpadding="0" cellspacing="0" style="width:100%;">
          <tr>
            <td style="padding:6px 0; color:#6B7280; font-size:14px; width:45%;">Facture</td>
            <td style="padding:6px 0; color:#1B2B5E; font-weight:bold; font-size:14px;">${p.numero}</td>
          </tr>
          <tr>
            <td style="padding:6px 0; color:#6B7280; font-size:14px;">Date</td>
            <td style="padding:6px 0; color:#1B2B5E; font-size:14px;">${formatDate(p.date)}</td>
          </tr>
          <tr>
            <td style="padding:6px 0; color:#6B7280; font-size:14px;">À payer jusqu'au</td>
            <td style="padding:6px 0; color:#1B2B5E; font-weight:bold; font-size:14px;">${formatDate(p.echeance)}</td>
          </tr>
          <tr>
            <td style="padding:6px 0; color:#6B7280; font-size:14px;">Montant</td>
            <td style="padding:6px 0; color:#1B2B5E; font-weight:bold; font-size:18px;">CHF ${p.montant.toFixed(2)}</td>
          </tr>
        </table>
      </div>

      <p style="margin:0 0 24px 0;">
        <a href="${SITE_URL}/mon-compte/factures"
           style="display:inline-block; background-color:#1B2B5E; color:white; text-decoration:none;
                  padding:12px 24px; border-radius:12px; font-weight:bold; font-size:14px;">
          Voir mes factures
        </a>
      </p>

      <p style="color:#6B7280; font-size:14px; margin:0;">${m.message_final}</p>
    `),
  });
}

/**
 * Ticket de caisse envoyé au client, en pièce jointe.
 * Pas de modèle configurable : un ticket ne se négocie pas, il constate.
 */
export async function envoyerEmailTicketBoutique(p: {
  email: string;
  prenom: string;
  numero: string;
  date: string;
  montant: number;
  pdf: Buffer;
}) {
  await envoyerEmail({
    destinataire: p.email,
    type: "ticket_boutique",
    sujet: `Votre ticket ${p.numero} — La Dogosphère`,
    piecesJointes: [{ filename: `${p.numero}.pdf`, content: p.pdf }],
    html: emailTemplate(`
      <h2 style="color:#1B2B5E; margin:0 0 8px 0;">Merci de votre visite</h2>
      <p style="color:#6B7280; margin:0 0 24px 0;">
        Voici le ticket de votre achat à la boutique, en pièce jointe.
      </p>

      <div style="background-color:#F5F0E8; border-radius:12px; padding:20px; margin:0 0 24px 0;">
        <table cellpadding="0" cellspacing="0" style="width:100%;">
          <tr>
            <td style="padding:6px 0; color:#6B7280; font-size:14px; width:45%;">Ticket</td>
            <td style="padding:6px 0; color:#1B2B5E; font-weight:bold; font-size:14px;">${p.numero}</td>
          </tr>
          <tr>
            <td style="padding:6px 0; color:#6B7280; font-size:14px;">Date</td>
            <td style="padding:6px 0; color:#1B2B5E; font-size:14px;">${formatDate(p.date)}</td>
          </tr>
          <tr>
            <td style="padding:6px 0; color:#6B7280; font-size:14px;">Montant</td>
            <td style="padding:6px 0; color:#1B2B5E; font-weight:bold; font-size:18px;">CHF ${Math.abs(p.montant).toFixed(2)}</td>
          </tr>
        </table>
      </div>

      <p style="color:#6B7280; font-size:14px; margin:0;">À bientôt à la Dogosphère.</p>
    `),
  });
}

/**
 * « Votre commande sur mesure est prête. » Le récapitulatif des choix est du
 * TEXTE : il est échappé et ses sauts de ligne sont conservés, jamais
 * interprété comme du HTML — une gravure peut contenir n'importe quoi.
 */
export async function envoyerEmailCommandePrete(p: {
  email: string;
  prenom: string;
  numero: string;
  article: string;
  /** Une ligne par choix : « Couleur : Bleu nuit ». */
  recapitulatif: string[];
}) {
  const m = await modeleEmail("commande_prete", {
    prenom: p.prenom,
    numero: p.numero,
    article: p.article,
    recapitulatif: p.recapitulatif.join(" · "),
  });

  const lignes = p.recapitulatif
    .map(
      (l) =>
        `<tr><td style="padding:6px 0; color:#1B2B5E; font-size:14px;">${echapper(l)}</td></tr>`
    )
    .join("");

  await envoyerEmail({
    destinataire: p.email,
    type: "commande_prete",
    sujet: m.sujet,
    html: emailTemplate(`
      <h2 style="color:#1B2B5E; margin:0 0 8px 0;">${m.titre}</h2>
      <p style="color:#6B7280; margin:0 0 24px 0;">${m.intro}</p>

      <div style="background-color:#F5F0E8; border-radius:12px; padding:20px; margin:0 0 24px 0;">
        <table cellpadding="0" cellspacing="0" style="width:100%;">
          <tr>
            <td style="padding:6px 0; color:#6B7280; font-size:14px; width:45%;">Commande</td>
            <td style="padding:6px 0; color:#1B2B5E; font-weight:bold; font-size:14px;">${echapper(p.numero)}</td>
          </tr>
          <tr>
            <td style="padding:6px 0; color:#6B7280; font-size:14px;">Article</td>
            <td style="padding:6px 0; color:#1B2B5E; font-size:14px;">${echapper(p.article)}</td>
          </tr>
        </table>
        ${lignes ? `<table cellpadding="0" cellspacing="0" style="width:100%; margin-top:10px; border-top:1px solid rgba(27,43,94,0.12);">${lignes}</table>` : ""}
      </div>

      <p style="color:#6B7280; font-size:14px; margin:0;">${m.message_final}</p>
    `),
  });
}

/** Le texte du client reste du texte : rien n'est interprété dans l'e-mail. */
function echapper(texte: string): string {
  return String(texte ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "<br />");
}


// ===========================================================================
// BOUTIQUE EN LIGNE
// ===========================================================================

const chfEmail = (n: number) =>
  new Intl.NumberFormat("fr-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const LIBELLES_REMISE: Record<string, string> = {
  retrait: "Retrait à la pension",
  depart_chien: "Remise au départ de votre chien",
  postal: "Envoi postal",
};

/** Ce que le client doit savoir pour venir chercher, ou attendre son colis. */
function consigneRemise(mode: string | null, delaiJours: number): string {
  if (mode === "postal") {
    return `Votre colis part sous ${delaiJours} jour${delaiJours > 1 ? "s" : ""} ouvrable${delaiJours > 1 ? "s" : ""}. Vous recevrez le numéro de suivi dès l'expédition.`;
  }
  if (mode === "depart_chien") {
    return "Votre commande vous sera remise au départ de votre chien, avec lui.";
  }
  return `Votre commande sera prête sous ${delaiJours} jour${delaiJours > 1 ? "s" : ""} ouvrable${delaiJours > 1 ? "s" : ""}. Vous pourrez la retirer à la pension aux heures d'ouverture.`;
}

/**
 * Confirmation d'une commande en ligne : le récapitulatif, le mode de remise
 * et le délai. Le modèle « commande_confirmee » est éditable depuis l'écran
 * des e-mails, comme les autres.
 */
export async function envoyerEmailCommandeConfirmee(commandeId: string): Promise<void> {
  const { data: cmd } = await supabaseAdmin
    .from("commandes")
    .select("id, numero, mode_remise, mode_paiement, frais_port, remise_membre, montant_total, client_id")
    .eq("id", commandeId)
    .maybeSingle();
  if (!cmd) return;

  const [{ data: client }, { data: lignes }, { data: params }] = await Promise.all([
    supabaseAdmin.from("clients").select("prenom, email").eq("id", cmd.client_id).maybeSingle(),
    supabaseAdmin.from("commandes_lignes")
      .select("libelle, quantite, prix_unitaire, montant")
      .eq("commande_id", commandeId).order("created_at"),
    supabaseAdmin.from("parametres").select("valeur").eq("cle", "delai_preparation_jours").maybeSingle(),
  ]);
  if (!client?.email) return;

  const delai = Math.max(Number(params?.valeur ?? 2) || 2, 1);
  const m = await modeleEmail("commande_confirmee", {
    prenom: client.prenom ?? "",
    numero: cmd.numero ?? "",
  });

  const lignesHtml = ((lignes ?? []) as { libelle: string; quantite: number; montant: number }[])
    .map((l) => `
      <tr>
        <td style="padding:6px 0; color:#1B2B5E; font-size:14px;">${l.quantite} × ${l.libelle}</td>
        <td style="padding:6px 0; color:#1B2B5E; font-size:14px; text-align:right; white-space:nowrap;">${chfEmail(Number(l.montant))} CHF</td>
      </tr>`)
    .join("");

  const remise = Number(cmd.remise_membre ?? 0);
  const port = Number(cmd.frais_port ?? 0);

  await envoyerEmail({
    destinataire: client.email,
    type: "commande_confirmee",
    sujet: m.sujet,
    html: emailTemplate(`
      <h2 style="color:#1B2B5E; margin:0 0 8px 0;">${m.titre}</h2>
      <p style="color:#6B7280; margin:0 0 24px 0;">${m.intro}</p>

      <div style="background-color:#F5F0E8; border-radius:12px; padding:20px; margin:0 0 24px 0;">
        <h3 style="color:#1B2B5E; margin:0 0 16px 0; font-size:15px; text-transform:uppercase; letter-spacing:0.5px;">🛍️ Commande ${cmd.numero ?? ""}</h3>
        <table cellpadding="0" cellspacing="0" style="width:100%;">
          ${lignesHtml}
          ${remise > 0 ? `<tr><td style="padding:6px 0; color:#1F6E5B; font-size:14px;">Remise membre</td><td style="padding:6px 0; color:#1F6E5B; font-size:14px; text-align:right;">−${chfEmail(remise)} CHF</td></tr>` : ""}
          ${port > 0 ? `<tr><td style="padding:6px 0; color:#6B7280; font-size:14px;">Frais de port</td><td style="padding:6px 0; color:#6B7280; font-size:14px; text-align:right;">${chfEmail(port)} CHF</td></tr>` : ""}
          <tr>
            <td style="padding:12px 0 0 0; border-top:2px solid #FFFFFF; color:#1B2B5E; font-weight:bold; font-size:16px;">Prix TTC</td>
            <td style="padding:12px 0 0 0; border-top:2px solid #FFFFFF; color:#1B2B5E; font-weight:bold; font-size:16px; text-align:right;">${chfEmail(Number(cmd.montant_total))} CHF</td>
          </tr>
        </table>
      </div>

      <div style="background-color:#E8F5F4; border-left:4px solid #4AAEA0; border-radius:8px; padding:16px; margin:0 0 24px 0;">
        <p style="margin:0 0 6px 0; color:#1B5E4F; font-size:14px;"><strong>${LIBELLES_REMISE[cmd.mode_remise ?? ""] ?? "Retrait à la pension"}</strong></p>
        <p style="margin:0; color:#1B5E4F; font-size:14px;">${consigneRemise(cmd.mode_remise, delai)}</p>
      </div>

      ${cmd.mode_paiement === "facture"
        ? '<p style="color:#6B7280; font-size:14px; margin:0 0 24px 0;">Votre facture vous parvient par un second e-mail, avec son bulletin de versement QR.</p>'
        : '<p style="color:#6B7280; font-size:14px; margin:0 0 24px 0;">Vous réglerez votre commande au retrait.</p>'}

      <p style="color:#6B7280; font-size:14px; margin:0;">${m.message_final}</p>
    `),
  });
}

/** Expédition : le numéro de suivi, quand il existe. */
export async function envoyerEmailCommandeExpediee(commandeId: string): Promise<void> {
  const { data: cmd } = await supabaseAdmin
    .from("commandes")
    .select("numero, numero_suivi, client_id, adresse_livraison")
    .eq("id", commandeId)
    .maybeSingle();
  if (!cmd) return;

  const { data: client } = await supabaseAdmin
    .from("clients").select("prenom, email").eq("id", cmd.client_id).maybeSingle();
  if (!client?.email) return;

  const m = await modeleEmail("commande_expediee", {
    prenom: client.prenom ?? "", numero: cmd.numero ?? "",
  });

  const adresse = (cmd.adresse_livraison ?? {}) as Record<string, string>;
  const lignesAdresse = [adresse.nom, adresse.rue, `${adresse.npa ?? ""} ${adresse.localite ?? ""}`]
    .map((l) => (l ?? "").trim()).filter(Boolean).join("<br>");

  await envoyerEmail({
    destinataire: client.email,
    type: "commande_expediee",
    sujet: m.sujet,
    html: emailTemplate(`
      <h2 style="color:#1B2B5E; margin:0 0 8px 0;">${m.titre}</h2>
      <p style="color:#6B7280; margin:0 0 24px 0;">${m.intro}</p>

      ${cmd.numero_suivi
        ? `<div style="background-color:#F5F0E8; border-radius:12px; padding:20px; margin:0 0 24px 0;">
             <p style="margin:0 0 4px 0; color:#6B7280; font-size:13px;">Numéro de suivi</p>
             <p style="margin:0; color:#1B2B5E; font-size:18px; font-weight:bold; letter-spacing:1px;">${cmd.numero_suivi}</p>
           </div>`
        : ""}

      ${lignesAdresse
        ? `<div style="background-color:#F5F0E8; border-radius:12px; padding:20px; margin:0 0 24px 0;">
             <p style="margin:0 0 4px 0; color:#6B7280; font-size:13px;">Envoyé à</p>
             <p style="margin:0; color:#1B2B5E; font-size:14px;">${lignesAdresse}</p>
           </div>`
        : ""}

      <p style="color:#6B7280; font-size:14px; margin:0;">${m.message_final}</p>
    `),
  });
}

// ===========================================================================
// ALERTE DE RETOUR EN STOCK (APP 15)
// ===========================================================================

/**
 * « L'article que vous attendiez est revenu. »
 *
 * Message TRANSACTIONNEL : il est sollicité, pour un article précis, par la
 * personne qui le reçoit. Il ne dépend donc pas de `emails_info_ok`, qui ne
 * gouverne que les messages libres — quelqu'un qui s'est désabonné de toute
 * communication garde ses alertes, et ne reçoit rien d'autre.
 *
 * Le lien de désinscription qu'il porte n'ouvre QUE cette alerte-ci.
 */
export async function envoyerEmailRetourEnStock(p: {
  email: string;
  article: string;
  prix: number | string;
  articleId: string;
  token: string;
  photoUrl?: string | null;
}): Promise<void> {
  const prix = chfEmail(Number(p.prix ?? 0));
  const m = await modeleEmail("retour_en_stock", { article: p.article, prix });

  const lienArticle = `${SITE_URL}/catalogue/${p.articleId}`;
  const lienDesinscription =
    `${SITE_URL}/alerte-stock?t=${encodeURIComponent(p.token)}`;

  const photo = p.photoUrl
    ? `<tr><td style="padding:0 0 16px 0;">
         <img src="${p.photoUrl}" alt="${echapper(p.article)}"
              style="width:100%; max-width:320px; border-radius:12px; display:block;" />
       </td></tr>`
    : "";

  await envoyerEmail({
    destinataire: p.email,
    type: "retour_en_stock",
    sujet: m.sujet,
    html: emailTemplate(`
      <h2 style="color:#1B2B5E; margin:0 0 8px 0;">${m.titre}</h2>
      <p style="color:#6B7280; margin:0 0 24px 0;">${m.intro}</p>

      <table cellpadding="0" cellspacing="0" style="width:100%;">
        ${photo}
        <tr>
          <td style="padding:0 0 6px 0; color:#1B2B5E; font-size:18px; font-weight:bold;">
            ${echapper(p.article)}
          </td>
        </tr>
        <tr>
          <td style="padding:0 0 20px 0; color:#1B2B5E; font-size:22px; font-weight:bold;">
            ${prix} CHF <span style="color:#6B7280; font-size:14px; font-weight:normal;">TTC</span>
          </td>
        </tr>
        <tr>
          <td style="padding:0 0 20px 0;">
            <a href="${lienArticle}"
               style="display:inline-block; background-color:#1F6E5B; color:#FFFFFF;
                      padding:14px 24px; border-radius:12px; text-decoration:none;
                      font-weight:bold; font-size:15px;">
              Voir l'article
            </a>
          </td>
        </tr>
      </table>

      <p style="color:#8A5A1F; background-color:#F4EAC9; border:1px solid #C9A84C;
                border-radius:10px; padding:10px 12px; font-size:14px; margin:0 0 20px 0;">
        ${MENTION_SANS_RESERVATION}
      </p>

      <p style="color:#6B7280; font-size:14px; margin:0;">${m.message_final}</p>

      <table cellpadding="0" cellspacing="0" style="width:100%; margin-top:28px; border-top:1px solid #F5F0E8;">
        <tr>
          <td style="padding-top:16px;">
            <p style="margin:0 0 4px 0; color:#9CA3AF; font-size:12px; line-height:1.6;">
              Vous recevez cet e-mail parce que vous avez demandé à être prévenu du retour
              de cet article. Il ne s'agit pas d'une lettre d'information.
            </p>
            <p style="margin:0; font-size:12px;">
              <a href="${lienDesinscription}" style="color:#9CA3AF; text-decoration:underline;">
                Ne plus être prévenu pour cet article
              </a>
              <span style="color:#9CA3AF;"> — cela n'affecte aucun autre e-mail.</span>
            </p>
          </td>
        </tr>
      </table>
    `),
  });
}
