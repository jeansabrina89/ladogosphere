import { NextRequest, NextResponse } from "next/server";
import { lireCorpsJson } from "@/src/lib/corpsRequete";
import { createClient } from "@/src/utils/supabase/server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { exigerPermissionApi } from "@/src/lib/apiAuth";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const garde = await exigerPermissionApi(supabase, "perm_planning");
  if (garde) return garde;
  const lecture = await lireCorpsJson(req);
  if (!lecture.ok) return lecture.reponse;
  const { lignes } = lecture.corps;

  const { error } = await supabaseAdmin
    .from("planning_employes")
    .upsert(lignes, { onConflict: "employe_id,date" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
