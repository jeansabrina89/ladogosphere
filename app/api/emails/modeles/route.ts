import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/src/utils/supabase/server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";

async function exigerAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { erreur: NextResponse.json({ error: "Non connecté" }, { status: 401 }), user: null };
  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") {
    return { erreur: NextResponse.json({ error: "Accès réservé à l'administration" }, { status: 403 }), user: null };
  }
  return { erreur: null, user };
}

const CHAMPS = ["sujet", "titre", "intro", "message_final"] as const;

export async function POST(req: NextRequest) {
  const { erreur, user } = await exigerAdmin();
  if (erreur) return erreur;

  const body = await req.json();
  const type = typeof body?.type === "string" ? body.type.trim() : "";
  if (!type) {
    return NextResponse.json({ error: "Type manquant" }, { status: 400 });
  }

  const ligne: Record<string, unknown> = { type, updated_at: new Date().toISOString(), updated_by: user!.id };
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
