import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../../src/utils/supabase/server";
import { exigerPersonnel } from "../../../../../src/lib/apiAuth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const garde = await exigerPersonnel(supabase);
  if (garde) return garde;
  const { id } = await params;

  const { data: ententes } = await supabase
    .from("ententes_chiens")
    .select(`
      id, chien_cible_id, type, note,
      chien_cible:chiens!ententes_chiens_chien_cible_id_fkey (nom, race)
    `)
    .eq("chien_id", id)
    .neq("type", "famille_uniquement");

  const { data: famille } = await supabase
    .from("ententes_chiens")
    .select("id")
    .eq("chien_id", id)
    .eq("type", "famille_uniquement")
    .maybeSingle();

  return NextResponse.json({
    ententes: ententes ?? [],
    famille_uniquement: !!famille,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const garde = await exigerPersonnel(supabase);
  if (garde) return garde;
  const { id } = await params;
  const { chien_cible_id, type, note, famille_uniquement } = await req.json();

  if (famille_uniquement) {
    // Toggle famille uniquement
    const { data: existing } = await supabase
      .from("ententes_chiens")
      .select("id")
      .eq("chien_id", id)
      .eq("type", "famille_uniquement")
      .maybeSingle();

    if (existing) {
      await supabase.from("ententes_chiens").delete().eq("id", existing.id);
    } else {
      await supabase.from("ententes_chiens").insert({
        chien_id: id,
        chien_cible_id: id, // self-reference pour famille
        type: "famille_uniquement",
      });
    }
    return NextResponse.json({ ok: true });
  }

  const { error } = await supabase
    .from("ententes_chiens")
    .upsert({
      chien_id: id,
      chien_cible_id,
      type,
      note: note || null,
    });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}