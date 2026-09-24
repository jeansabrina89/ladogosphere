import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/src/utils/supabase/server";
import { exigerAdminApi } from "@/src/lib/apiAuth";
import { inventaireExercice } from "@/src/lib/exportComptable";

/**
 * L'inventaire d'un exercice. LECTURE SEULE : cette route ne supprime rien, ne
 * fabrique rien, n'écrit aucune ligne. Elle mesure.
 *
 * Réservée à la gérante : l'inventaire nomme des chemins de fichiers de toute
 * la comptabilité.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const garde = await exigerAdminApi(supabase);
  if (garde) return garde;

  const annee = Number(req.nextUrl.searchParams.get("exercice"));
  if (!Number.isInteger(annee) || annee < 2000 || annee > 2100) {
    return NextResponse.json({ error: "Exercice attendu, sous la forme d'une année." }, { status: 400 });
  }

  const inventaire = await inventaireExercice(annee);
  return NextResponse.json(inventaire);
}
