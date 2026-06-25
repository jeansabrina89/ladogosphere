import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/src/utils/supabase/server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { exigerPersonnel } from "@/src/lib/apiAuth";
import { figerFactureResa, defigerFactureResa } from "@/src/lib/factureResa";
import { synchroniserComptaResa } from "@/src/lib/comptaResa";
import { synchroniserComptaAbonnement } from "@/src/lib/comptaAbonnement";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const garde = await exigerPersonnel(supabase);
  if (garde) return garde;
  const { id } = await params;
  const body = await req.json();
  const action = body.action as string | undefined;

  let updates: Record<string, any>;
  switch (action) {
    case "checkin":
      updates = { statut: "arrive", date_arrivee_reelle: new Date().toISOString() };
      break;
    case "checkout":
      updates = { statut: "parti", date_depart_reel: new Date().toISOString() };
      break;
    case "annuler_checkin":
      updates = { statut: "attendu", date_arrivee_reelle: null };
      break;
    case "annuler_checkout":
      updates = { statut: "arrive", date_depart_reel: null };
      break;
    default:
      return NextResponse.json(
        { error: `Action inconnue : "${action}"` },
        { status: 400 }
      );
  }

  const { error } = await supabase
    .from("checkin_checkout")
    .update(updates)
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Bonus essai : si check-in effectué sur une journée d'essai → marquer journee_essai_effectuee
  if (action === "checkin") {
    const { data: cc } = await supabase
      .from("checkin_checkout")
      .select(`reservation_id, reservations!inner (type_reservation, reservation_chiens (chien_id))`)
      .eq("id", id)
      .single();

    const reservation = cc?.reservations as any;
    if (reservation?.type_reservation === "essai") {
      const chienIds = reservation.reservation_chiens?.map((rc: any) => rc.chien_id) ?? [];
      if (chienIds.length > 0) {
        await supabase
          .from("chiens")
          .update({ journee_essai_effectuee: true })
          .in("id", chienIds);
      }
    }
  }

  // Checkout / annuler_checkout : clôture ou réouvre la réservation + gère la facture
  if (action === "checkout" || action === "annuler_checkout") {
    const { data: cc } = await supabase
      .from("checkin_checkout")
      .select("reservation_id")
      .eq("id", id)
      .single();

    if (cc?.reservation_id) {
      const reservationId = cc.reservation_id;
      if (action === "checkout") {
        await supabaseAdmin.from("reservations").update({ statut: "terminee" }).eq("id", reservationId);
        await figerFactureResa(reservationId);
        const { data: resaDate } = await supabaseAdmin.from("reservations").select("date_fin, abonnement_id").eq("id", reservationId).maybeSingle();
        await synchroniserComptaResa(reservationId, resaDate?.date_fin ?? undefined);
        if (resaDate?.abonnement_id) {
          await synchroniserComptaAbonnement(resaDate.abonnement_id);
        }
      } else {
        await supabaseAdmin.from("reservations").update({ statut: "validee" }).eq("id", reservationId);
        await defigerFactureResa(reservationId);
        const { data: resaAbo } = await supabaseAdmin.from("reservations").select("abonnement_id").eq("id", reservationId).maybeSingle();
        if (resaAbo?.abonnement_id) {
          await synchroniserComptaAbonnement(resaAbo.abonnement_id);
        }
      }
    }
  }

  return NextResponse.json({ ok: true });
}
