import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../../src/lib/supabase";

export async function POST(req: NextRequest) {
  const formData = await req.formData();

  const client_id = formData.get("client_id") as string;
  const type_reservation = formData.get("type_reservation") as string;
  const date_debut = formData.get("date_debut") as string;
  const date_fin = formData.get("date_fin") as string;
  const heure_arrivee = formData.get("heure_arrivee") as string || null;
  const heure_depart = formData.get("heure_depart") as string || null;
  const commentaire_client = formData.get("commentaire_client") as string || null;
  const chien_ids = formData.getAll("chien_ids") as string[];

  if (!client_id || !date_debut || !date_fin) {
    return NextResponse.json({ error: "Données manquantes." }, { status: 400 });
  }

  if (chien_ids.length === 0) {
    return NextResponse.json({ error: "Veuillez sélectionner au moins un chien." }, { status: 400 });
  }

  // Créer la réservation en attente — sans box assigné pour l'instant
  const { data: reservation, error } = await supabase
    .from("reservations")
    .insert({
      client_id,
      type_reservation,
      date_debut,
      date_fin,
      heure_arrivee,
      heure_depart,
      statut: "en_attente",
      commentaire_admin: commentaire_client,
      urgence: false,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Lier les chiens
  if (chien_ids.length > 0) {
    await supabase.from("reservation_chiens").insert(
      chien_ids.map(chien_id => ({ reservation_id: reservation.id, chien_id }))
    );
  }

  return NextResponse.json({ id: reservation.id });
}