import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/src/utils/supabase/server";
import { exigerPermissionApi } from "@/src/lib/apiAuth";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { urlSigneePiece } from "@/src/lib/pieces";

/**
 * Sert un justificatif par une URL signée de deux minutes. Le bucket est privé :
 * c'est le seul chemin d'accès, et il est réservé au personnel qui a le droit
 * correspondant.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id } = await params;

  const { data: piece } = await supabaseAdmin
    .from("pieces")
    .select("id, entite")
    .eq("id", id)
    .maybeSingle();
  if (!piece) return NextResponse.json({ error: "Pièce introuvable." }, { status: 404 });

  const garde = await exigerPermissionApi(
    supabase,
    piece.entite === "depense" ? "perm_depenses" : "perm_encaissements"
  );
  if (garde) return garde;

  const url = await urlSigneePiece(id, 120);
  if (!url) return NextResponse.json({ error: "Justificatif indisponible." }, { status: 404 });

  return NextResponse.redirect(url);
}
