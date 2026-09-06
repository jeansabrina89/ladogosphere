import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/src/utils/supabase/server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { envoyerEmailReservationValidee, envoyerEmailReservationAnnulee, envoyerEmailReservationRefusee } from "@/src/lib/email";
import { formatBoxLabel } from "@/src/lib/boxes";
import { exigerPermissionApi } from "@/src/lib/apiAuth";
import { calculerMontant } from "@/src/lib/calculTarif";
import { recalculerMontantSejour, enregistrerMontantCalcule } from "@/app/(admin)/reservations/[id]/actions";
import { estMembreActif } from "@/src/lib/membre";
import { creerOuMajFactureBrouillon, annulerFactureResa } from "@/src/lib/factureResa";
import { recrediterAbonnementResa } from "@/src/lib/consommationAbonnement";
import { marquerChiensEssaiProgramme } from "@/src/lib/essaiReservation";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const garde = await exigerPermissionApi(supabase, "perm_reservations_modifier");
  if (garde) return garde;
  const { id } = await params;
  const { statut } = await req.json();

  const STATUTS_VALIDES = ["en_attente", "validee", "refusee", "annulee", "terminee"];
  if (!statut) return NextResponse.json({ error: "statut manquant" }, { status: 400 });
  if (!STATUTS_VALIDES.includes(statut)) return NextResponse.json({ error: "statut invalide" }, { status: 400 });

  const { error } = await supabaseAdmin
    .from("reservations")
    .update({ statut })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Validation d'une journée d'essai : les chiens concernés passent à 'programme'
  // (le résultat sera saisi à leur départ).
  if (statut === "validee") {
    try {
      await marquerChiensEssaiProgramme(id);
    } catch (e) {
      console.error("Erreur passage des chiens en essai programmé:", e);
    }
  }

  // Calcul automatique du montant à la validation (seulement si pas déjà calculé)
  if (statut === "validee") {
    try {
      const { data: resa } = await supabaseAdmin
        .from("reservations")
        .select(`
          type_reservation, urgence, date_debut, date_fin, heure_arrivee, heure_depart,
          montant_calcule,
          client_id,
          clients (membre),
          reservation_chiens (chiens (doit_etre_isole))
        `)
        .eq("id", id)
        .single();

      if (resa && !resa.montant_calcule) {
        if (resa.type_reservation === "sejour") {
          await recalculerMontantSejour(id);
        } else {
          const { data: tarifs } = await supabaseAdmin
            .from("tarifs")
            .select("categorie, membre, prix")
            .eq("actif", true);
          if (tarifs) {
            const chiens = (resa.reservation_chiens ?? [])
              .map((rc: any) => rc.chiens)
              .filter(Boolean);
            const montant = calculerMontant({
              tarifs,
              type_reservation: resa.type_reservation,
              nb_chiens: chiens.length,
              est_membre: (resa as any).client_id ? await estMembreActif(supabaseAdmin, (resa as any).client_id, resa.date_debut) : false,
              est_urgence: !!resa.urgence,
              est_privatif: chiens.some((c: any) => c.doit_etre_isole),
              date_debut: resa.date_debut,
              date_fin: resa.date_fin,
              heure_arrivee: resa.heure_arrivee,
              heure_depart: resa.heure_depart,
            });
            await enregistrerMontantCalcule(id, montant);
          }
        }
      }
    } catch (calcError) {
      console.error("Erreur calcul montant à la validation:", calcError);
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
