import * as Sentry from "@sentry/nextjs";
import { Resend } from "resend";
import { supabaseAdmin } from "@/src/lib/supabase-admin";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = "La Dogosphère <noreply@ladogosphere.ch>";

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
              <img src="https://ladogosphere.ch/Logo.png" alt="La Dogosphère" style="height:70px; margin-bottom:10px;" />
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
                    <img src="https://ladogosphere.ch/Logo.png" alt="Logo" style="height:50px; opacity:0.3;" />
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
  rappel_veille: {
    sujet: "📅 Rappel — votre chien arrive demain !",
    titre: "Bonjour {prenom} ! 🐶",
    intro: "Petit rappel — <strong>{nom_chien}</strong> arrive <strong>demain</strong> à La Dogosphère !",
    message_final: "En cas d'imprévu, contactez-nous au plus vite. À demain ! 🐾",
  },
  rappel_cotisation: {
    sujet: "⭐ Renouvellement de votre adhésion membre {annee}",
    titre: "Bonjour {prenom} ! ⭐",
    intro: "Votre adhésion membre La Dogosphère arrive à échéance le <strong>31 décembre {annee}</strong>.",
    message_final: "Merci pour votre fidélité ! Nous espérons vous accueillir encore longtemps. 🐶",
  },
};

// Libelles lisibles + variables proposees (pour l'ecran d'administration)
export const MODELES_META: { type: string; label: string; variables: string[] }[] = [
  { type: "confirmation_demande", label: "Demande reçue", variables: ["prenom", "date_debut", "date_fin"] },
  { type: "reservation_validee", label: "Réservation confirmée", variables: ["prenom", "date_debut", "date_fin"] },
  { type: "reservation_annulee", label: "Réservation annulée", variables: ["prenom", "date_debut", "date_fin"] },
  { type: "paiement", label: "Paiement / règlement", variables: ["prenom", "montant", "date_debut", "date_fin"] },
  { type: "satisfaction_essai", label: "Satisfaction après essai", variables: ["prenom", "nom_chien"] },
  { type: "rappel_veille", label: "Rappel la veille", variables: ["prenom", "nom_chien", "date_debut"] },
  { type: "rappel_cotisation", label: "Rappel cotisation", variables: ["prenom", "nom", "annee", "montant"] },
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
}) {
  const { data, error } = await resend.emails.send({
    from: FROM,
    to: p.destinataire,
    subject: p.sujet,
    html: p.html,
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

export async function envoyerEmailPaiement({
  email, prenom, montant, date_debut, date_fin, type, iban, titulaire,
}: {
  email: string; prenom: string; montant: number;
  date_debut: string; date_fin: string; type: string;
  iban: string; titulaire: string;
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
          <strong>Référence :</strong> Votre nom + date du séjour
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

export async function envoyerEmailRappelCotisation({
  email, prenom, nom, annee, montant, iban, titulaire,
}: {
  email: string; prenom: string; nom: string; annee: number; montant: number; iban: string; titulaire: string;
}) {
  const anneeProchaine = annee + 1;
  const m = await modeleEmail("rappel_cotisation", {
    prenom, nom, annee, montant: montant.toFixed(2),
  });
  await envoyerEmail({
    destinataire: email,
    type: "rappel_cotisation",
    sujet: m.sujet,
    html: emailTemplate(`
      <h2 style="color:#1B2B5E; margin:0 0 8px 0;">${m.titre}</h2>
      <p style="color:#6B7280; margin:0 0 24px 0;">
        ${m.intro}
      </p>

      <div style="background-color:#F5F0E8; border-radius:12px; padding:20px; margin:0 0 24px 0;">
        <h3 style="color:#1B2B5E; margin:0 0 16px 0; font-size:15px; text-transform:uppercase; letter-spacing:0.5px;">⭐ Votre adhésion</h3>
        <table cellpadding="0" cellspacing="0" style="width:100%;">
          <tr>
            <td style="padding:6px 0; color:#6B7280; font-size:14px; width:40%;">Statut actuel</td>
            <td style="padding:6px 0; color:#1B2B5E; font-weight:bold; font-size:14px;">⭐ Membre actif</td>
          </tr>
          <tr>
            <td style="padding:6px 0; color:#6B7280; font-size:14px;">Valable jusqu'au</td>
            <td style="padding:6px 0; color:#1B2B5E; font-weight:bold; font-size:14px;">31 décembre ${annee}</td>
          </tr>
          <tr>
            <td style="padding:6px 0; color:#6B7280; font-size:14px;">Adhésion ${anneeProchaine}</td>
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
            <td style="padding:4px 0; color:#7A5C00; font-weight:bold; font-size:13px;">${prenom} ${nom} Adhésion ${anneeProchaine}</td>
          </tr>
        </table>
      </div>

      <p style="color:#6B7280; font-size:14px; margin:0;">
        ${m.message_final}
      </p>
    `),
  });
}
