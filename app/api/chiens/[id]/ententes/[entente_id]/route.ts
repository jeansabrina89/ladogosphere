import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../../../../src/lib/supabase";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; entente_id: string }> }
) {
  const { entente_id } = await params;

  const { error } = await supabase
    .from("ententes_chiens")
    .delete()
    .eq("id", entente_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}