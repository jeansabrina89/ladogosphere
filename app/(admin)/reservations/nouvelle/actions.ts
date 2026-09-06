"use server";

import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { verifierPermission } from "@/src/lib/verifierPermission";
import { estMembreActif, reservationAutorisee, MESSAGE_ADHESION_REQUISE } from "@/src/lib/membre";
import { verifierChiensPourReservation, marquerChiensEssaiProgramme } from "@/src/lib/essaiReservation";

export async function creerReservation(formData: FormData) {
  const verif = await verifierPermission("perm_reservations_creer");
  if (verif.error) throw new Error(verif.error);

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

  const aujourdhuiCH = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Zurich" });
  if (date_debut && date_debut < aujourdhuiCH) {
    throw new Error("La date de début ne peut pas être dans le passé.");
  }

  // Règle de la journée d'essai, chien par chien. Le personnel peut passer
  // outre avec « forcer » + une raison, journalisée dans la réservation.
  const forcer = formData.get("forcer") === "on";
  const forcer_raison = (formData.get("forcer_raison") as string) || null;
  if (forcer && !forcer_raison?.trim()) {
    throw new Error("Indiquez la raison du passage outre de la journée d'essai.");
  }
  if (chien_ids.length > 0 && !forcer) {
    const refus = await verifierChiensPourReservation(chien_ids, type_reservation);
    if (refus) throw new Error(refus);
  }

  // Adhésion obligatoire pour réserver (sauf essai ou client exempté).
  if (type_reservation !== "essai" && client_id) {
    const { data: clientRow } = await supabaseAdmin
      .from("clients")
      .select("cotisation_exemptee")
      .eq("id", client_id)
      .maybeSingle();
    const estMembre = await estMembreActif(supabaseAdmin, client_id, date_debut);
    if (!reservationAutorisee({
      estMembre,
      estExempte: !!clientRow?.cotisation_exemptee,
      typeReservation: type_reservation,
    })) {
      throw new Error(MESSAGE_ADHESION_REQUISE);
    }
  }

  // Créer la réservation
  const { data: reservation, error } = await supabaseAdmin
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
      essai_force: forcer,
      essai_force_raison: forcer ? forcer_raison!.trim() : null,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Lier les chiens à la réservation
  if (chien_ids.length > 0) {
    const { error: errorChiens } = await supabaseAdmin
      .from("reservation_chiens")
      .insert(
        chien_ids.map(chien_id => ({
          reservation_id: reservation.id,
          chien_id,
        }))
      );
    if (errorChiens) throw new Error(errorChiens.message);

    // Créer les occupations de box
    const { error: errorOccupations } = await supabaseAdmin
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

    // Essai créé directement validé : les chiens passent à 'programme'.
    if (statut === "validee") {
      await marquerChiensEssaiProgramme(reservation.id);
    }
  }

  redirect(`/reservations/${reservation.id}`);
}
