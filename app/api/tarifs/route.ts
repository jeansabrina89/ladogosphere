import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/src/utils/supabase/server";
import { exigerPersonnel } from "@/src/lib/apiAuth";

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const garde = await exigerPersonnel(supabase);
  if (garde) return garde;
  const { updates, cotisation, iban, tva } = await req.json();

  // Mettre à jour les tarifs
  for (const { id, prix } of updates) {
    await supabase.from("tarifs").update({ prix }).eq("id", id);
  }

  // Mettre à jour le montant de la cotisation
  await supabase.from("parametres")
    .update({ valeur: cotisation.toString(), updated_at: new Date().toISOString() })
    .eq("cle", "cotisation_montant");

  // Mettre à jour l'IBAN
  if (iban) {
    await supabase.from("parametres")
      .update({ valeur: iban, updated_at: new Date().toISOString() })
      .eq("cle", "iban");
  }

  // Mettre à jour les paramètres TVA
  if (tva) {
    for (const [cle, valeur] of Object.entries(tva as Record<string, string>)) {
      await supabase.from("parametres")
        .update({ valeur, updated_at: new Date().toISOString() })
        .eq("cle", cle);
    }
  }

  return NextResponse.json({ ok: true });
}