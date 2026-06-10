"use server";

import { redirect } from "next/navigation";
import { createClient } from "../../../../src/utils/supabase/server";

export async function modifierReservation(id: string, formData: FormData) {
  const supabase = await createClient();
  const statut = formData.get("statut") as string;
  const box_id = formData.get("box_id") as string || null;
  const commentaire_admin = formData.get("commentaire_admin") as string || null;
  const heure_arrivee = formData.get("heure_arrivee") as string || null;
  const heure_depart = formData.get("heure_depart") as string || null;
  const urgence = formData.get("urgence") === "on";
  const date_debut = formData.get("date_debut") as string;
  const date_fin = formData.get("date_fin") as string;
  const montant_final = formData.get("montant_final") as string;

  const { error } = await supabase
    .from("reservations")
    .update({
      statut,
      box_id,
      commentaire_admin,
      heure_arrivee,
      heure_depart,
      urgence,
      date_debut,
      date_fin,
      montant_final: montant_final ? parseFloat(montant_final) : null,
    })
    .eq("id", id);

  if (error) throw new Error(error.message);

  // Mettre à jour les occupations de boxes
  if (box_id) {
    await supabase
      .from("occupation_boxes")
      .delete()
      .eq("reservation_id", id);

    // Récupérer les chiens de la réservation
    const { data: resChiens } = await supabase
      .from("reservation_chiens")
      .select("chien_id")
      .eq("reservation_id", id);

    if (resChiens && resChiens.length > 0) {
      await supabase.from("occupation_boxes").insert(
        resChiens.map((rc: any) => ({
          box_id,
          chien_id: rc.chien_id,
          reservation_id: id,
          date_debut,
          date_fin,
        }))
      );
    }
  }

  // Mettre à jour checkin_checkout
  await supabase
    .from("checkin_checkout")
    .update({
      date_arrivee_prevue: heure_arrivee
        ? `${date_debut}T${heure_arrivee}:00`
        : `${date_debut}T09:00:00`,
      date_depart_prevu: heure_depart
        ? `${date_fin}T${heure_depart}:00`
        : `${date_fin}T17:00:00`,
    })
    .eq("reservation_id", id);

  redirect(`/reservations/${id}`);
}

export async function annulerReservation(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;

  const { error } = await supabase
    .from("reservations")
    .update({ statut: "annulee" })
    .eq("id", id);

  if (error) throw new Error(error.message);

  await supabase
    .from("occupation_boxes")
    .delete()
    .eq("reservation_id", id);

  redirect(`/reservations/${id}`);
}