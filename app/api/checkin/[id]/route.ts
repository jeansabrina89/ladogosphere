import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../../src/lib/supabase";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { statut } = await req.json();

  const updates: any = { statut };
  if (statut === "arrive") updates.date_arrivee_reelle = new Date().toISOString();
  if (statut === "parti") updates.date_depart_reel = new Date().toISOString();

  const { error } = await supabase
    .from("checkin_checkout")
    .update(updates)
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}