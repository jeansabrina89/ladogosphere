import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/src/utils/supabase/server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { exigerPermissionApi } from "@/src/lib/apiAuth";
import { verifierChiensPourReservation, marquerChiensEssaiProgramme } from "@/src/lib/essaiReservation";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const garde = await exigerPermissionApi(supabase, "perm_reservations_creer");
  if (garde) return garde;
  const formData = await req.formData();

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

  // Tarif urgence : permission supplémentaire requise
  if (urgence) {
    const urgGarde = await exigerPermissionApi(supabase, "perm_tarifs_urgence");
    if (urgGarde) return urgGarde;
  }

  // Règle de la journée d'essai, chien par chien. Le personnel peut passer
  // outre avec « forcer » + une raison, qui est journalisée dans la réservation.
  const forcer = formData.get("forcer") === "on";
  const forcer_raison = (formData.get("forcer_raison") as string) || null;
  if (chien_ids.length > 0 && !forcer) {
    const refus = await verifierChiensPourReservation(chien_ids, type_reservation);
    if (refus) return NextResponse.json({ error: refus }, { status: 400 });
  }
  if (forcer && !forcer_raison?.trim()) {
    return NextResponse.json(
      { error: "Indiquez la raison du passage outre de la journée d'essai." },
      { status: 400 }
    );
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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (chien_ids.length > 0) {
    // Lier les chiens à la réservation
    await supabaseAdmin.from("reservation_chiens").insert(
      chien_ids.map(chien_id => ({ reservation_id: reservation.id, chien_id }))
    );

    // Créer les occupations de box
    await supabaseAdmin.from("occupation_boxes").insert(
      chien_ids.map(chien_id => ({
        box_id,
        chien_id,
        reservation_id: reservation.id,
        date_debut,
        date_fin,
      }))
    );

    // Créer les entrées checkin_checkout
    const heureArriveeStr = heure_arrivee || "09:00";
    const heureDepartStr = heure_depart || "17:00";

    await supabaseAdmin.from("checkin_checkout").insert(
      chien_ids.map(chien_id => ({
        reservation_id: reservation.id,
        chien_id,
        date_arrivee_prevue: `${date_debut}T${heureArriveeStr}:00`,
        date_depart_prevu: `${date_fin}T${heureDepartStr}:00`,
        statut: "attendu",
      }))
    );

    // Essai créé directement validé : les chiens passent à 'programme'.
    if (statut === "validee") {
      await marquerChiensEssaiProgramme(reservation.id);
    }
  }

  return NextResponse.json({ id: reservation.id });
}
