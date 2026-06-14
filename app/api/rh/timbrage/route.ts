import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../src/utils/supabase/server";
import { supabaseAdmin } from "../../../../src/lib/supabase-admin";
import { exigerPersonnel, exigerPermissionApi } from "../../../../src/lib/apiAuth";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const garde = await exigerPersonnel(supabase);
  if (garde) return garde;

  const body = await req.json();
  const employe_id_cible = body.employe_id;

  // Déterminer si ce timbrage concerne l'utilisateur courant
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user!.id)
    .single();

  if (profile?.role !== "admin") {
    // Trouver la fiche RH de l'utilisateur courant
    const { data: monEmploye } = await supabaseAdmin
      .from("employes_rh")
      .select("id")
      .eq("profile_id", user!.id)
      .maybeSingle();

    // Si le timbrage ne concerne pas soi-même, exiger perm_timbrage_equipe
    if (!monEmploye || employe_id_cible !== monEmploye.id) {
      const permGarde = await exigerPermissionApi(supabase, "perm_timbrage_equipe");
      if (permGarde) return permGarde;
    }
  }

  const { error } = await supabaseAdmin
    .from("timbrage")
    .upsert(body, { onConflict: "employe_id,date" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
