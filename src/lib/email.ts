import { Resend } from "resend";

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

export async function envoyerEmailConfirmationDemande({
  email, prenom, date_debut, date_fin, type,
}: {
  email: string; prenom: string; date_debut: string; date_fin: string; type: string;
}) {
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: "🐾 Votre demande de réservation a été reçue",
    html: emailTemplate(`
      <h2 style="color:#1B2B5E; margin:0 0 8px 0;">Bonjour ${prenom} ! 👋</h2>
      <p style="color:#6B7280; margin:0 0 24px 0;">Nous avons bien reçu votre demande de réservation et nous vous en remercions.</p>

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
        Pour toute question, n'hésitez pas à nous contacter directement par email ou téléphone.
      </p>
    `),
  });
}

export async function envoyerEmailReservationValidee({
  email, prenom, date_debut, date_fin, type, box_numero, heure_arrivee, heure_depart,
}: {
  email: string; prenom: string; date_debut: string; date_fin: string;
  type: string; box_numero?: number; heure_arrivee?: string; heure_depart?: string;
}) {
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: "✅ Votre réservation est confirmée !",
    html: emailTemplate(`
      <h2 style="color:#1B2B5E; margin:0 0 8px 0;">Bonjour ${prenom} ! 🎉</h2>
      <p style="color:#6B7280; margin:0 0 24px 0;">Excellente nouvelle ! Votre réservation a été <strong style="color:#4AAEA0;">confirmée</strong> par notre équipe.</p>

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
          ${box_numero ? `
          <tr>
            <td style="padding:6px 0; color:#6B7280; font-size:14px;">Box assigné</td>
            <td style="padding:6px 0; color:#1B2B5E; font-weight:bold; font-size:14px;">Box ${box_numero}</td>
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
        Nous sommes impatients d'accueillir votre compagnon ! 🐶
      </p>
    `),
  });
}

export async function envoyerEmailReservationAnnulee({
  email, prenom, date_debut, date_fin, type,
}: {
  email: string; prenom: string; date_debut: string; date_fin: string; type: string;
}) {
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: "❌ Votre réservation a été annulée",
    html: emailTemplate(`
      <h2 style="color:#1B2B5E; margin:0 0 8px 0;">Bonjour ${prenom},</h2>
      <p style="color:#6B7280; margin:0 0 24px 0;">Nous vous informons que votre réservation a été <strong style="color:#E8847A;">annulée</strong>.</p>

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
        Nous espérons vous revoir bientôt à La Dogosphère ! 🐾
      </p>
    `),
  });
}
export async function envoyerEmailPaiement({
  email, prenom, montant, date_debut, date_fin, type,
}: {
  email: string; prenom: string; montant: number;
  date_debut: string; date_fin: string; type: string;
}) {
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: "💰 Règlement de votre séjour à La Dogosphère",
    html: emailTemplate(`
      <h2 style="color:#1B2B5E; margin:0 0 8px 0;">Bonjour ${prenom},</h2>
      <p style="color:#6B7280; margin:0 0 24px 0;">Voici le récapitulatif de votre séjour et les informations de paiement.</p>

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
        <p style="margin:0 0 6px 0; color:#7A5C00; font-size:13px;">
          <strong>Virement bancaire :</strong> IBAN CH00 0000 0000 0000 0000 0<br/>
          <strong>Titulaire :</strong> La Dogosphère Sàrl<br/>
          <strong>Référence :</strong> Votre nom + date du séjour
        </p>
        <p style="margin:8px 0 0 0; color:#7A5C00; font-size:13px;">
          <strong>Twint :</strong> disponible sur demande
        </p>
      </div>

      <p style="color:#6B7280; font-size:14px; margin:0;">
        Merci de procéder au règlement dans les meilleurs délais. N'hésitez pas à nous contacter pour toute question. 🐾
      </p>
    `),
  });
}

export async function envoyerEmailSatisfactionEssai({
  email, prenom, nom_chien,
}: {
  email: string; prenom: string; nom_chien: string;
}) {
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: "🐾 Comment s'est passée la journée d'essai ?",
    html: emailTemplate(`
      <h2 style="color:#1B2B5E; margin:0 0 8px 0;">Bonjour ${prenom} ! 🐶</h2>
      <p style="color:#6B7280; margin:0 0 24px 0;">
        Nous espérons que <strong>${nom_chien}</strong> est bien rentré à la maison !
        Toute l'équipe a été ravie de l'avoir avec nous.
      </p>

      <div style="background-color:#E8F5F4; border-left:4px solid #4AAEA0; border-radius:8px; padding:16px; margin:0 0 24px 0;">
        <p style="margin:0; color:#1B5E4F; font-size:14px;">
          Votre avis nous tient à cœur — si vous avez quelques minutes, nous serions très reconnaissants de recevoir votre retour. 
          Cela nous aide à nous améliorer et à faire connaître La Dogosphère.
        </p>
      </div>

      <p style="color:#6B7280; font-size:14px; margin:0 0 24px 0;">
        À très bientôt pour un prochain séjour ! 🐾
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
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: "📅 Rappel — votre chien arrive demain !",
    html: emailTemplate(`
      <h2 style="color:#1B2B5E; margin:0 0 8px 0;">Bonjour ${prenom} ! 🐶</h2>
      <p style="color:#6B7280; margin:0 0 24px 0;">
        Petit rappel — <strong>${nom_chien}</strong> arrive <strong>demain</strong> à La Dogosphère !
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
        En cas d'imprévu, contactez-nous au plus vite. À demain ! 🐾
      </p>
    `),
  });
}
export async function envoyerEmailRappelCotisation({
  email, prenom, nom, annee, montant, iban,
}: {
  email: string; prenom: string; nom: string; annee: number; montant: number; iban: string;
}) {
  const anneeProchaine = annee + 1;
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: `⭐ Renouvellement de votre adhésion membre ${annee}`,
    html: emailTemplate(`
      <h2 style="color:#1B2B5E; margin:0 0 8px 0;">Bonjour ${prenom} ! ⭐</h2>
      <p style="color:#6B7280; margin:0 0 24px 0;">
        Votre adhésion membre La Dogosphère arrive à échéance le <strong>31 décembre ${annee}</strong>.
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
          <tr>
            <td style="padding:4px 0; color:#7A5C00; font-size:13px; width:35%;">IBAN</td>
            <td style="padding:4px 0; color:#7A5C00; font-weight:bold; font-size:13px;">${iban}</td>
          </tr>
          <tr>
            <td style="padding:4px 0; color:#7A5C00; font-size:13px;">Titulaire</td>
            <td style="padding:4px 0; color:#7A5C00; font-weight:bold; font-size:13px;">La Dogosphère Sàrl</td>
          </tr>
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
        Merci pour votre fidélité ! Nous espérons vous accueillir encore longtemps. 🐶
      </p>
    `),
  });
}