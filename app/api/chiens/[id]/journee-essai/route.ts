import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../../src/utils/supabase/server";
import { supabaseAdmin } from "../../../../../src/lib/supabase-admin";
import { exigerPermissionApi } from "../../../../../src/lib/apiAuth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const garde = await exigerPermissionApi(supabase, "perm_journee_essai");
  if (garde) return garde;
  const { id } = await params;
  const data = await req.json();

  const updateData: any = {};
  if (data.journee_essai_effectuee !== undefined)
    updateData.journee_essai_effectuee = data.journee_essai_effectuee;
  if (data.journee_essai_invalide !== undefined)
    updateData.journee_essai_invalide = data.journee_essai_invalide;
  if (data.journee_essai_note !== undefined)
    updateData.journee_essai_note = data.journee_essai_note;

  const { error } = await supabaseAdmin
    .from("chiens")
    .update(updateData)
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
