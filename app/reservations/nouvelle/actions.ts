"use server";

import { redirect } from "next/navigation";
import { supabase } from "../../../src/lib/supabase";

export async function creerReservation(formData: FormData) {
  const client_id = formData.get("client_id") as string;
  const box_id = formData.get("box_id") as string;
  const type_reservation = formData.get("type_reservation") as string;
  const date_debut = formData.get("date_debut") as string;
  const date_fin = formData.get("date_fin") as string;
  const heure_arrivee = formData.get("heure_arrivee") as string || null;
  const heure_depart = formData.get("heure_depart") as string || null;
  const urgence = formData.get("urgence") === "on";
  const statut = formData.get("statut") as string;
  const commentaire_admin = formData.get("commentaire_admin") as string || null;
  const chien_ids = formData.getAll("chien_ids") as string[];

  // Créer la réservation
  const { data: reservation, error } = await supabase
    .from("reservations")
    .insert({
      client_id,
      box_id,
      type_reservation,
      date_debut,
      date_fin,
      heure_arrivee,
      heure_depart,
      urgence,
      statut,
      commentaire_admin,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Lier les chiens à la réservation
  if (chien_ids.length > 0) {
    const { error: errorChiens } = await supabase
      .from("reservation_chiens")
      .insert(
        chien_ids.map(chien_id => ({
          reservation_id: reservation.id,
          chien_id,
        }))
      );
    if (errorChiens) throw new Error(errorChiens.message);

    // Créer les occupations de box
    const { error: errorOccupations } = await supabase
      .from("occupation_boxes")
      .insert(
        chien_ids.map(chien_id => ({
          box_id,
          chien_id,
          reservation_id: reservation.id,
          date_debut,
          date_fin,
        }))
      );
    if (errorOccupations) throw new Error(errorOccupations.message);
  }

  redirect(`/reservations/${reservation.id}`);
}