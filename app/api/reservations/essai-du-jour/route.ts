import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/src/utils/supabase/server";
import { exigerPersonnel } from "@/src/lib/apiAuth";
import { etatJourneeEssai } from "@/src/lib/essaiReservation";

/**
 * État de la journée d'essai à une date : la pension n'en accueille qu'une par
 * jour. Sert au formulaire admin pour annoncer l'heure déjà prise et proposer
 * les créneaux encore libres à un forçage.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const garde = await exigerPersonnel(supabase);
  if (garde) return garde;

  const date = new URL(req.url).searchParams.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Date invalide" }, { status: 400 });
  }

  return NextResponse.json(await etatJourneeEssai(date));
}
