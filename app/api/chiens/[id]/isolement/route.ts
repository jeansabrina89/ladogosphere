import { NextRequest, NextResponse } from "next/server";
import { lireCorpsJson } from "@/src/lib/corpsRequete";
import { exiger, garderRoute } from "@/src/lib/garde";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { tracerEvenement } from "@/src/lib/journalEvenements";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const g = await garderRoute(exiger({ action: "isolement_chien" }));
  if (g.refus) return g.refus;
  const user = { id: g.appelant.userId };

  const lecture = await lireCorpsJson(req);
  if (!lecture.ok) return lecture.reponse;
  const { doit_etre_isole } = lecture.corps;

  const { error } = await supabaseAdmin
    .from("chiens")
    // Décision de la PENSION : elle prime et verrouille le choix du client.
    .update({ doit_etre_isole: !!doit_etre_isole, cohabitation_source: "pension" })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await tracerEvenement({
    entite: "chien", entiteId: id, evenement: "isolement",
    apres: { doit_etre_isole: !!doit_etre_isole },
    userId: user.id,
  });
  return NextResponse.json({ ok: true });
}
