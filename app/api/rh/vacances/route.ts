import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../../src/lib/supabase";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { employe_id, date_debut, date_fin, nb_jours, note_employe } = body;

  // Vérifier si les dates se chevauchent avec d'autres demandes de cet employé
  const { data: existantes } = await supabase
    .from("demandes_vacances")
    .select("*")
    .eq("employe_id", employe_id)
    .neq("statut", "refusee")
    .or(`and(date_debut.lte.${date_fin},date_fin.gte.${date_debut})`);

  if (existantes && existantes.length > 0) {
    return NextResponse.json({
      error: "Ces dates chevauchent une demande de vacances déjà existante."
    }, { status: 400 });
  }

  const { error } = await supabase
    .from("demandes_vacances")
    .insert({ employe_id, date_debut, date_fin, nb_jours, note_employe });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const { id, statut, note_admin } = await req.json();

  // Côté admin — pas de vérification de chevauchement
  const { error } = await supabase
    .from("demandes_vacances")
    .update({ statut, note_admin })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}