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
  const { date_paiement } = await req.json();

  const { error } = await supabaseAdmin
    .from("cotisations_membres")
    .update({
      statut: "payee",
      mode_paiement: "virement",
      date_paiement: date_paiement || new Date().toISOString().split("T")[0],
    })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
