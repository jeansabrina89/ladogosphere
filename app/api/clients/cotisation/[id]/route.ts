import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/src/utils/supabase/server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { exigerPermissionApi } from "@/src/lib/apiAuth";

// Confirmer le paiement d'une adhésion : passe en "payee"
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const garde = await exigerPermissionApi(supabase, "perm_encaissements");
    if (garde) return garde;
    const { id } = await params;
    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* corps vide */ }
    const { date_paiement, mode_paiement } = body as { date_paiement?: string; mode_paiement?: string };

    if (date_paiement && !/^\d{4}-\d{2}-\d{2}$/.test(date_paiement)) {
      return NextResponse.json({ error: "Format de date invalide" }, { status: 400 });
    }

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
  } catch {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// Annuler le paiement d'une adhésion : repasse en "en_attente"
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const garde = await exigerPermissionApi(supabase, "perm_encaissements");
    if (garde) return garde;
    const { id } = await params;

    const { error } = await supabaseAdmin
      .from("cotisations_membres")
      .update({ statut: "en_attente", date_paiement: null })
      .eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
