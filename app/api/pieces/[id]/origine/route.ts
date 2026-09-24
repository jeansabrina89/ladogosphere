import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/src/utils/supabase/server";
import { exigerPermissionApi } from "@/src/lib/apiAuth";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { urlSigneeOriginePiece } from "@/src/lib/pieces";

/**
 * Sert l'ORIGINAL d'un justificatif — le fichier tel qu'il a été remis, avec
 * ses métadonnées : EXIF, appareil, et parfois la position du lieu de la prise
 * de vue.
 *
 * Aucun écran ne mène ici, et c'est voulu : un lien « original » à côté de
 * chaque pièce serait exactement l'endroit où quelqu'un cliquerait par
 * réflexe. Cette route existe pour la consultation comptable et l'export, le
 * jour d'un contrôle. La version affichée partout ailleurs est la version
 * nettoyée, servie par `/api/pieces/[id]`.
 *
 * Mêmes gardes que la pièce elle-même, et même URL signée de deux minutes sur
 * un bucket privé.
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

  const url = await urlSigneeOriginePiece(id, 120);
  // Un PDF est déjà l'original, et les pièces déposées avant le 24 septembre
  // 2026 n'en ont pas : on le dit, plutôt que de servir le nettoyé à sa place.
  if (!url) {
    return NextResponse.json(
      { error: "Aucun original conservé pour cette pièce." },
      { status: 404 }
    );
  }

  return NextResponse.redirect(url);
}
