import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/src/utils/supabase/server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { exigerPermissionApi } from "@/src/lib/apiAuth";
import { estResultatEssai } from "@/src/lib/journeeEssai";

/**
 * Correction du résultat d'une journée d'essai depuis la fiche chien.
 * Accepte les trois mêmes valeurs qu'au départ, et trace qui a saisi et quand.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const garde = await exigerPermissionApi(supabase, "perm_journee_essai");
  if (garde) return garde;
  const { data: { user } } = await supabase.auth.getUser();
  const { id } = await params;
  const data = await req.json();

  const updateData: Record<string, unknown> = {};

  if (data.statut_essai !== undefined) {
    if (!estResultatEssai(data.statut_essai)) {
      return NextResponse.json(
        { error: "Résultat invalide : attendu valide, seconde_journee ou refuse." },
        { status: 400 }
      );
    }
    updateData.statut_essai = data.statut_essai;
    updateData.journee_essai_resultat_le = new Date().toISOString();
    updateData.journee_essai_resultat_par = user?.id ?? null;
  }

  if (data.journee_essai_note !== undefined) {
    updateData.journee_essai_note = data.journee_essai_note;
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: "Rien à mettre à jour." }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("chiens")
    .update(updateData)
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
