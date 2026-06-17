import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/src/utils/supabase/server";
import { exigerPersonnel } from "@/src/lib/apiAuth";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const garde = await exigerPersonnel(supabase);
  if (garde) return garde;
  const { annee_source, annee_cible } = await req.json();

  // Vérifier que l'année cible n'existe pas déjà
  const { data: existants } = await supabase
    .from("tarifs")
    .select("id")
    .eq("annee", annee_cible)
    .limit(1);

  if (existants && existants.length > 0) {
    return NextResponse.json({ error: `Des tarifs existent déjà pour ${annee_cible}` }, { status: 400 });
  }

  // Récupérer les tarifs source
  const { data: tarifsSource } = await supabase
    .from("tarifs")
    .select("categorie, membre, prix, actif")
    .eq("annee", annee_source);

  if (!tarifsSource || tarifsSource.length === 0) {
    return NextResponse.json({ error: "Aucun tarif source trouvé" }, { status: 404 });
  }

  // Copier avec la nouvelle année
  const { error } = await supabase.from("tarifs").insert(
    tarifsSource.map(t => ({ ...t, annee: annee_cible }))
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}