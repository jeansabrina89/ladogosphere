import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../../src/utils/supabase/server";
import { supabaseAdmin } from "../../../../../src/lib/supabase-admin";
import { envoyerEmailReservationValidee, envoyerEmailReservationAnnulee } from "../../../../../src/lib/email";
import { formatBoxLabel } from "../../../../../src/lib/boxes";
import { exigerPermissionApi } from "../../../../../src/lib/apiAuth";
import { calculerMontant } from "../../../../../src/lib/calculTarif";
import { recalculerMontantSejour, enregistrerMontantCalcule } from "../../../../reservations/[id]/actions";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const garde = await exigerPermissionApi(supabase, "perm_reservations_modifier");
  if (garde) return garde;
  const { id } = await params;
  const { statut } = await req.json();

  const { error } = await supabaseAdmin
    .from("reservations")
    .update({ statut })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Calcul automatique du montant à la validation (seulement si pas déjà calculé)
  if (statut === "validee") {
    try {
      const { data: resa } = await supabaseAdmin
        .from("reservations")
        .select(`
          type_reservation, urgence, date_debut, date_fin, heure_arrivee, heure_depart,
          montant_calcule,
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
              est_membre: (resa.clients as any)?.membre ?? false,
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
      }
    }
  } catch (emailError) {
    console.error("Erreur envoi email:", emailError);
  }

  return NextResponse.json({ ok: true });
}
