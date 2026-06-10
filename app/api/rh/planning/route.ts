import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../src/utils/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { lignes } = await req.json();

  const { error } = await supabase
    .from("planning_employes")
    .upsert(lignes, { onConflict: "employe_id,date" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}