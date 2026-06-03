import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../../src/lib/supabase";
import { envoyerEmailConfirmationDemande } from "../../../../src/lib/email";

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
  await supabase.from("reservation_chiens").insert(
    chien_ids.map(chien_id => ({ reservation_id: reservation.id, chien_id }))
  );

  // Envoyer email de confirmation au client
  try {
    const { data: client } = await supabase
      .from("clients")
      .select("email, prenom")
      .eq("id", client_id)
      .single();

    if (client?.email) {
      await envoyerEmailConfirmationDemande({
        email: client.email,
        prenom: client.prenom || "Client",
        date_debut,
        date_fin,
        type: type_reservation,
      });
    }
  } catch (emailError) {
    console.error("Erreur envoi email:", emailError);
  }

  return NextResponse.json({ id: reservation.id });
}