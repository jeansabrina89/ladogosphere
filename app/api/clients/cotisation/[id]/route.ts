import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../../src/utils/supabase/server";
import { supabaseAdmin } from "../../../../../src/lib/supabase-admin";
import { exigerPermissionApi } from "../../../../../src/lib/apiAuth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const garde = await exigerPermissionApi(supabase, "perm_encaissements");
  if (garde) return garde;
  const { id } = await params;
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* corps vide */ }
  const { date_paiement, mode_paiement } = body as { date_paiement?: string; mode_paiement?: string };

  const champsModeAcceptes = ["cash", "virement"];
  const updateData: Record<string, unknown> = {
    statut: "payee",
    date_paiement: date_paiement || new Date().toISOString().split("T")[0],
  };
  if (mode_paiement && champsModeAcceptes.includes(mode_paiement)) {
    updateData.mode_paiement = mode_paiement;
  }

  const { error } = await supabaseAdmin
    .from("cotisations_membres")
    .update(updateData)
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
