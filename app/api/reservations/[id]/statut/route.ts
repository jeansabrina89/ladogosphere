import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../../src/utils/supabase/server";
import { envoyerEmailReservationValidee, envoyerEmailReservationAnnulee } from "../../../../../src/lib/email";
import { formatBoxLabel } from "../../../../../src/lib/boxes";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id } = await params;
  const { statut } = await req.json();

  const { error } = await supabase
    .from("reservations")
    .update({ statut })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Envoyer email selon le statut
  try {
    const { data: reservation } = await supabase
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