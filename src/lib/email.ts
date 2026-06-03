import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = "La Dogosphère <noreply@ladogosphere.ch>";

export async function envoyerEmailConfirmationDemande({
  email,
  prenom,
  date_debut,
  date_fin,
  type,
}: {
  email: string;
  prenom: string;
  date_debut: string;
  date_fin: string;
  type: string;
}) {
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: "Votre demande de réservation a été reçue",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #1B2B5E; padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0;">La Dogosphère</h1>
        </div>
        <div style="padding: 30px; background-color: #F5F0E8;">
          <h2 style="color: #1B2B5E;">Bonjour ${prenom} ! 👋</h2>
          <p>Nous avons bien reçu votre demande de réservation.</p>
          <div style="background-color: white; border-radius: 12px; padding: 20px; margin: 20px 0;">
            <p><strong>Type :</strong> ${
              type === "essai" ? "🧪 Journée d'essai" :
              type === "journee" ? "☀️ Journée" : "🏠 Séjour"
            }</p>
            <p><strong>Arrivée :</strong> ${new Date(date_debut).toLocaleDateString("fr-CH")}</p>
            <p><strong>Départ :</strong> ${new Date(date_fin).toLocaleDateString("fr-CH")}</p>
          </div>
          <p>Notre équipe va traiter votre demande et vous confirmer sous 24h.</p>
          <p style="color: #4AAEA0; font-weight: bold;">À bientôt à La Dogosphère ! 🐶</p>
        </div>
        <div style="background-color: #1B2B5E; padding: 15px; text-align: center;">
          <p style="color: #9CA3AF; font-size: 12px; margin: 0;">
            La Dogosphère Sàrl — Sion, Valais
          </p>
        </div>
      </div>
    `,
  });
}

export async function envoyerEmailReservationValidee({
  email,
  prenom,
  date_debut,
  date_fin,
  type,
  box_numero,
  heure_arrivee,
  heure_depart,
}: {
  email: string;
  prenom: string;
  date_debut: string;
  date_fin: string;
  type: string;
  box_numero?: number;
  heure_arrivee?: string;
  heure_depart?: string;
}) {
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: "✅ Votre réservation est confirmée !",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #1B2B5E; padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0;">La Dogosphère</h1>
        </div>
        <div style="padding: 30px; background-color: #F5F0E8;">
          <h2 style="color: #1B2B5E;">Bonjour ${prenom} ! 🎉</h2>
          <p>Votre réservation a été <strong style="color: #4AAEA0;">confirmée</strong> par notre équipe.</p>
          <div style="background-color: white; border-radius: 12px; padding: 20px; margin: 20px 0;">
            <p><strong>Type :</strong> ${
              type === "essai" ? "🧪 Journée d'essai" :
              type === "journee" ? "☀️ Journée" : "🏠 Séjour"
            }</p>
            <p><strong>Arrivée :</strong> ${new Date(date_debut).toLocaleDateString("fr-CH")}${heure_arrivee ? ` à ${heure_arrivee}` : ""}</p>
            <p><strong>Départ :</strong> ${new Date(date_fin).toLocaleDateString("fr-CH")}${heure_depart ? ` à ${heure_depart}` : ""}</p>
            ${box_numero ? `<p><strong>Box :</strong> ${box_numero}</p>` : ""}
          </div>
          <p style="color: #4AAEA0; font-weight: bold;">À bientôt à La Dogosphère ! 🐶</p>
        </div>
        <div style="background-color: #1B2B5E; padding: 15px; text-align: center;">
          <p style="color: #9CA3AF; font-size: 12px; margin: 0;">
            La Dogosphère Sàrl — Sion, Valais
          </p>
        </div>
      </div>
    `,
  });
}

export async function envoyerEmailReservationAnnulee({
  email,
  prenom,
  date_debut,
  date_fin,
  type,
}: {
  email: string;
  prenom: string;
  date_debut: string;
  date_fin: string;
  type: string;
}) {
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: "❌ Votre réservation a été annulée",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #1B2B5E; padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0;">La Dogosphère</h1>
        </div>
        <div style="padding: 30px; background-color: #F5F0E8;">
          <h2 style="color: #1B2B5E;">Bonjour ${prenom},</h2>
          <p>Nous vous informons que votre réservation a été <strong style="color: #E8847A;">annulée</strong>.</p>
          <div style="background-color: white; border-radius: 12px; padding: 20px; margin: 20px 0;">
            <p><strong>Type :</strong> ${
              type === "essai" ? "🧪 Journée d'essai" :
              type === "journee" ? "☀️ Journée" : "🏠 Séjour"
            }</p>
            <p><strong>Arrivée :</strong> ${new Date(date_debut).toLocaleDateString("fr-CH")}</p>
            <p><strong>Départ :</strong> ${new Date(date_fin).toLocaleDateString("fr-CH")}</p>
          </div>
          <p>Pour toute question, contactez-nous à <a href="mailto:ladogosphere@gmail.com" style="color: #4AAEA0;">ladogosphere@gmail.com</a></p>
        </div>
        <div style="background-color: #1B2B5E; padding: 15px; text-align: center;">
          <p style="color: #9CA3AF; font-size: 12px; margin: 0;">
            La Dogosphère Sàrl — Sion, Valais
          </p>
        </div>
      </div>
    `,
  });
}