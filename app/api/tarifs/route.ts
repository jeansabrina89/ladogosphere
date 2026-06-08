import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../src/lib/supabase";

export async function PUT(req: NextRequest) {
  const { updates, cotisation } = await req.json();

  for (const { id, prix } of updates) {
    await supabase.from("tarifs").update({ prix }).eq("id", id);
  }

  await supabase.from("parametres")
    .update({ valeur: cotisation.toString(), updated_at: new Date().toISOString() })
    .eq("cle", "cotisation_montant");

  return NextResponse.json({ ok: true });
}