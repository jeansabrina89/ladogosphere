import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/src/utils/supabase/server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { exigerPermissionApi } from "@/src/lib/apiAuth";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const garde = await exigerPermissionApi(supabase, "perm_box");
  if (garde) return garde;
  const { occupation_id, nouveau_box_id, mode, date_changement } = await req.json();

  // Récupérer l'occupation actuelle
  const { data: occupation } = await supabaseAdmin
    .from("occupation_boxes")
    .select("*")
    .eq("id", occupation_id)
    .single();

  if (!occupation) {
    return NextResponse.json({ error: "Occupation introuvable" }, { status: 404 });
  }

  if (mode === "tout") {
    // Déplacer pour tout le séjour
    const { error } = await supabaseAdmin
      .from("occupation_boxes")
      .update({ box_id: nouveau_box_id })
      .eq("id", occupation_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Mettre à jour la réservation
    if (occupation.reservation_id) {
      await supabaseAdmin
        .from("reservations")
        .update({ box_id: nouveau_box_id })
        .eq("id", occupation.reservation_id);
    }

  } else if (mode === "partir_de" && date_changement) {
    // Calculer la veille du changement
    const veilleChangement = new Date(date_changement);
    veilleChangement.setDate(veilleChangement.getDate() - 1);
    const dateFinPremierePeriode = veilleChangement.toISOString().split("T")[0];

    // Raccourcir l'occupation actuelle
    const { error: errorUpdate } = await supabaseAdmin
      .from("occupation_boxes")
      .update({ date_fin: dateFinPremierePeriode })
      .eq("id", occupation_id);

    if (errorUpdate) return NextResponse.json({ error: errorUpdate.message }, { status: 500 });

    // Créer une nouvelle occupation pour le nouveau box
    const { error: errorInsert } = await supabaseAdmin
      .from("occupation_boxes")
      .insert({
        box_id: nouveau_box_id,
        chien_id: occupation.chien_id,
        reservation_id: occupation.reservation_id,
        date_debut: date_changement,
        date_fin: occupation.date_fin,
      });

    if (errorInsert) return NextResponse.json({ error: errorInsert.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
