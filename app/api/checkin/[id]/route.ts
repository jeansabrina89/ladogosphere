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

  // Si check-in effectué → vérifier si c'est une journée d'essai
  if (statut === "arrive") {
    const { data: cc } = await supabase
      .from("checkin_checkout")
      .select(`reservation_id, reservations (type_reservation, reservation_chiens (chien_id))`)
      .eq("id", id)
      .single();

    if (cc?.reservations?.type_reservation === "essai") {
      const chienIds = cc.reservations.reservation_chiens?.map((rc: any) => rc.chien_id) ?? [];
      if (chienIds.length > 0) {
        await supabase
          .from("chiens")
          .update({ journee_essai_effectuee: true })
          .in("id", chienIds);
      }
    }
  }

  return NextResponse.json({ ok: true });
}