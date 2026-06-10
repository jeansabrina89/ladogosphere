import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../../src/utils/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id } = await params;

  const { data: reservation } = await supabase
    .from("reservations")
    .select(`
      *,
      clients (prenom, nom, membre),
      boxes (numero),
      reservation_chiens (
        chien_id,
        chiens (id, nom, race)
      )
    `)
    .eq("id", id)
    .single();

  const { data: boxes } = await supabase
    .from("boxes")
    .select("id, numero")
    .eq("actif", true)
    .order("numero");

  return NextResponse.json({ reservation, boxes });
}