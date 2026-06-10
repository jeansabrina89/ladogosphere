import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../src/utils/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { client_id, annee, montant, mode_paiement, statut, date_paiement } = await req.json();

  // Enregistrer la cotisation
  const { error: errCotisation } = await supabase
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
  const { error: errClient } = await supabase
    .from("clients")
    .update({ membre: true })
    .eq("id", client_id);

  if (errClient) {
    return NextResponse.json({ error: errClient.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}