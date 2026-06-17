import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/src/utils/supabase/server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { exigerPermissionApi } from "@/src/lib/apiAuth";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const garde = await exigerPermissionApi(supabase, "perm_encaissements");
  if (garde) return garde;
  const { client_id, annee, montant, mode_paiement, statut, date_paiement } = await req.json();

  // Enregistrer la cotisation
  const { error: errCotisation } = await supabaseAdmin
    .from("cotisations_membres")
    .upsert({
      client_id,
      annee,
      montant,
      mode_paiement,
      statut,
      date_paiement: date_paiement || null,
    }, { onConflict: "client_id,annee" });

  if (errCotisation) {
    return NextResponse.json({ error: errCotisation.message }, { status: 500 });
  }

  // Activer le statut membre
  const { error: errClient } = await supabaseAdmin
    .from("clients")
    .update({ membre: true })
    .eq("id", client_id);

  if (errClient) {
    return NextResponse.json({ error: errClient.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
