import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/src/utils/supabase/server";
import { getProfilePerms } from "@/src/lib/getProfilePerms";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id } = await params;

  const perms = await getProfilePerms();

  const { data: reservation } = await supabase
    .from("reservations")
    .select(`
      *,
      clients (prenom, nom, membre),
      boxes (numero, nom),
      reservation_chiens (
        chien_id,
        chiens (id, nom, race)
      )
    `)
    .eq("id", id)
    .single();

  const { data: boxes } = await supabase
    .from("boxes")
    .select("id, numero, nom")
    .eq("actif", true)
    .order("numero");

  return NextResponse.json({ reservation, boxes, peutUrgence: perms.perm_tarifs_urgence });
}
