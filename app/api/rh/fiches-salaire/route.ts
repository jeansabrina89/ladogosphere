import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../src/utils/supabase/server";
import { exigerPersonnel } from "../../../../src/lib/apiAuth";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const garde = await exigerPersonnel(supabase);
  if (garde) return garde;
  const { employe_id, mois, annee, salaire_brut, salaire_net, total_deductions, commentaire, deductions } = await req.json();

  const { data: fiche, error } = await supabase
    .from("fiches_salaire")
    .insert({ employe_id, mois, annee, salaire_brut, salaire_net, total_deductions, commentaire })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (deductions?.length > 0) {
    const { error: errorDed } = await supabase
      .from("fiche_salaire_deductions")
      .insert(deductions.map((d: any) => ({ ...d, fiche_id: fiche.id })));
    if (errorDed) return NextResponse.json({ error: errorDed.message }, { status: 500 });
  }

  return NextResponse.json({ id: fiche.id });
}