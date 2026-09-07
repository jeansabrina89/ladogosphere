import { NextRequest, NextResponse } from "next/server";
import { lireCorpsJson } from "@/src/lib/corpsRequete";
import { createClient } from "@/src/utils/supabase/server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { envoyerEmailReservationValidee, envoyerEmailReservationAnnulee, envoyerEmailReservationRefusee } from "@/src/lib/email";
import { formatBoxLabel } from "@/src/lib/boxes";
import { exigerPermissionApi } from "@/src/lib/apiAuth";
import { creerOuMajFactureBrouillon, annulerFactureResa } from "@/src/lib/factureResa";
import { recrediterAbonnementResa } from "@/src/lib/consommationAbonnement";
import { marquerChiensEssaiProgramme } from "@/src/lib/essaiReservation";
import { synchroniserComptaResa } from "@/src/lib/comptaResa";
import { assurerLignesCheckin } from "@/src/lib/lignesCheckin";
import { assurerMontantCalcule } from "@/src/lib/prixReservation";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const garde = await exigerPermissionApi(supabase, "perm_reservations_modifier");
  if (garde) return garde;
  const { id } = await params;
  const lecture = await lireCorpsJson(req);
  if (!lecture.ok) return lecture.reponse;
  const { statut } = lecture.corps;

  const STATUTS_VALIDES = ["en_attente", "validee", "refusee", "annulee", "terminee"];
  if (!statut) return NextResponse.json({ error: "statut manquant" }, { status: 400 });
  if (!STATUTS_VALIDES.includes(statut)) return NextResponse.json({ error: "statut invalide" }, { status: 400 });

  // Le prix se calcule AVANT de valider : une réservation validée sans prix
  // calculé ne doit pas exister. L'échec est visible, jamais avalé.
  if (statut === "validee") {
    const { data: { user } } = await supabase.auth.getUser();
    const prix = await assurerMontantCalcule(id, user?.id ?? null);
    if (prix.erreur) {
      return NextResponse.json(
        { error: `Le prix n'a pas pu être calculé : ${prix.erreur}` },
        { status: 400 }
      );
    }
  }

  const { error } = await supabaseAdmin
    .from("reservations")
    .update({ statut })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Lignes de check-in : une réservation validée doit être pointable, quel que
  // soit le chemin par lequel elle a été créée. Idempotent.
  if (statut === "validee") {
    const r = await assurerLignesCheckin(id);
    if (r.erreur) console.error("Lignes de check-in :", r.erreur);
  }

  // Validation d'une journée d'essai : les chiens concernés passent à 'programme'
  // (le résultat sera saisi à leur départ).
  if (statut === "validee") {
    try {
      await marquerChiensEssaiProgramme(id);
    } catch (e) {
      console.error("Erreur passage des chiens en essai programmé:", e);
    }
  }

  // Facture liée à la réservation (Lot 1)
  if (statut === "validee") {
    try {
      await creerOuMajFactureBrouillon(id);
    } catch (factErr) {
      console.error("Erreur création facture brouillon:", factErr);
    }
  } else if (statut === "annulee" || statut === "refusee") {
    try {
      await annulerFactureResa(id);
    } catch (factErr) {
      console.error("Erreur annulation facture:", factErr);
    }
    try {
      await recrediterAbonnementResa(id);
    } catch (aboErr) {
      console.error("Erreur recredit abonnement:", aboErr);
    }
  }

  // Toute sortie de l'état "terminée" (annulation, refus, retour en attente ou
  // en validée) retire la reconnaissance du produit : le grand livre doit suivre.
  if (statut !== "terminee") {
    await synchroniserComptaResa(id);
  }

  // Envoyer email selon le statut
  try {
    const { data: reservation } = await supabaseAdmin
      .from("reservations")
      .select(`*, clients (email, prenom), boxes (numero, nom)`)
      .eq("id", id)
      .single();

    if (reservation?.clients?.email) {
      if (statut === "validee") {
        await envoyerEmailReservationValidee({
          email: reservation.clients.email,
          prenom: reservation.clients.prenom || "Client",
          date_debut: reservation.date_debut,
          date_fin: reservation.date_fin,
          type: reservation.type_reservation,
          box_label: formatBoxLabel(reservation.boxes),
          heure_arrivee: reservation.heure_arrivee,
          heure_depart: reservation.heure_depart,
        });
      } else if (statut === "annulee") {
        await envoyerEmailReservationAnnulee({
          email: reservation.clients.email,
          prenom: reservation.clients.prenom || "Client",
          date_debut: reservation.date_debut,
          date_fin: reservation.date_fin,
          type: reservation.type_reservation,
        });
      } else if (statut === "refusee") {
        await envoyerEmailReservationRefusee({
          email: reservation.clients.email,
          prenom: reservation.clients.prenom || "Client",
          date_debut: reservation.date_debut,
          date_fin: reservation.date_fin,
          type: reservation.type_reservation,
        });
      }
    }
  } catch (emailError) {
    console.error("Erreur envoi email:", emailError);
  }

  return NextResponse.json({ ok: true });
}
