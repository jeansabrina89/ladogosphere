import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../../src/utils/supabase/server";
import { supabaseAdmin } from "../../../../../src/lib/supabase-admin";
import { envoyerEmailReservationValidee, envoyerEmailReservationAnnulee } from "../../../../../src/lib/email";
import { formatBoxLabel } from "../../../../../src/lib/boxes";
import { exigerPermissionApi } from "../../../../../src/lib/apiAuth";

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
