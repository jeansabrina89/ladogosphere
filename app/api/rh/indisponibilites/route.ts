import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../src/utils/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const body = await req.json();
  const { error } = await supabase
    .from("indisponibilites")
    .upsert(body, { onConflict: "employe_id,date" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  const { error } = await supabase
    .from("indisponibilites")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}