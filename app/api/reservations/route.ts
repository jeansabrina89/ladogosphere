import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../src/utils/supabase/server";
import { supabaseAdmin } from "../../../src/lib/supabase-admin";
import { exigerPermissionApi } from "../../../src/lib/apiAuth";

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

  // Validation statut_essai
  if (chien_ids.length > 0) {
    const { data: chiensData } = await supabaseAdmin
      .from("chiens")
      .select("id, nom, statut_essai")
      .in("id", chien_ids);

    const chiensRefuses = (chiensData ?? []).filter((c: any) => c.statut_essai === 'refuse');
    if (chiensRefuses.length > 0) {
      const nom = chiensRefuses[0].nom;
      return NextResponse.json({
        error: `${nom} n'a pas été accepté à l'issue de sa journée d'essai et ne peut donc pas faire l'objet d'une réservation. N'hésitez pas à nous contacter pour plus d'informations ou pour envisager une nouvelle journée d'essai.`,
      }, { status: 400 });
    }

    if (type_reservation === 'essai') {
      const tousValides = (chiensData ?? []).every((c: any) => c.statut_essai === 'valide');
      if (tousValides) {
        return NextResponse.json({
          error: "Tous les chiens sélectionnés ont déjà validé leur journée d'essai. Veuillez choisir 'Journée' ou 'Séjour'.",
        }, { status: 400 });
      }
    } else {
      const chiensNonValides = (chiensData ?? []).filter((c: any) => c.statut_essai !== 'valide');
      if (chiensNonValides.length > 0) {
        const nom = chiensNonValides[0].nom;
        return NextResponse.json({
          error: `${nom} doit d'abord valider sa journée d'essai avant de pouvoir réserver une journée ou un séjour. Vous pouvez réserver une journée d'essai.`,
        }, { status: 400 });
      }
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
  }

  return NextResponse.json({ id: reservation.id });
}
