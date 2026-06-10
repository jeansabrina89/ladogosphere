import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../src/utils/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const body = await req.json();

  const { error } = await supabase
    .from("timbrage")
    .upsert(body, { onConflict: "employe_id,date" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}