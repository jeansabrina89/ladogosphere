import { NextRequest, NextResponse } from "next/server";
import { lireCorpsJson } from "@/src/lib/corpsRequete";
import { exigerAdmin, garderRoute } from "@/src/lib/garde";
import { supabaseAdmin } from "@/src/lib/supabase-admin";

const CHAMPS = ["sujet", "titre", "intro", "message_final"] as const;

export async function POST(req: NextRequest) {
  const g = await garderRoute(exigerAdmin("modele_email"));
  if (g.refus) return g.refus;
  const user = { id: g.appelant.userId };

  const lecture = await lireCorpsJson(req);
  if (!lecture.ok) return lecture.reponse;
  const body = lecture.corps;
  const type = typeof body?.type === "string" ? body.type.trim() : "";
  if (!type) {
    return NextResponse.json({ error: "Type manquant" }, { status: 400 });
  }

  const ligne: Record<string, unknown> = { type, updated_at: new Date().toISOString(), updated_by: user.id };
  for (const champ of CHAMPS) {
    const v = body?.[champ];
    // Chaine vide -> null = repli sur le texte par defaut
    ligne[champ] = typeof v === "string" && v.trim() !== "" ? v : null;
  }

  const { error } = await supabaseAdmin
    .from("modeles_email")
    .upsert(ligne, { onConflict: "type" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
