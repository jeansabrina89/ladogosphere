import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../../src/lib/supabase";

export async function POST(req: NextRequest) {
  const { lignes } = await req.json();

  const { error } = await supabase
    .from("planning_employes")
    .upsert(lignes, { onConflict: "employe_id,date" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}