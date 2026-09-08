import { NextRequest, NextResponse } from "next/server";
import { lireCorpsJson } from "@/src/lib/corpsRequete";
import { createClient } from "@/src/utils/supabase/server";
import { exigerPersonnel } from "@/src/lib/apiAuth";

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const garde = await exigerPersonnel(supabase);
  if (garde) return garde;
  const lecture = await lireCorpsJson(req);
  if (!lecture.ok) return lecture.reponse;
  const { updates, cotisation, iban, coordonnees } = lecture.corps;

  // Mettre à jour les tarifs
  for (const { id, prix } of updates) {
    await supabase.from("tarifs").update({ prix }).eq("id", id);
  }

  // Mettre à jour le montant de la cotisation
  await supabase.from("parametres")
    .update({ valeur: cotisation.toString(), updated_at: new Date().toISOString() })
    .eq("cle", "cotisation_montant");

  // Mettre à jour l'IBAN
  if (iban !== undefined) {
    await supabase.from("parametres")
      .update({ valeur: iban, updated_at: new Date().toISOString() })
      .eq("cle", "iban");
  }

  // Coordonnées de paiement (titulaire + adresse) pour le bulletin QR
  if (coordonnees && typeof coordonnees === "object") {
    for (const [cle, valeur] of Object.entries(coordonnees as Record<string, string>)) {
      await supabase.from("parametres")
        .update({ valeur: valeur ?? "", updated_at: new Date().toISOString() })
        .eq("cle", cle);
    }
  }

  // La TVA a son écran et sa table (parametres_tva) : Réglages → TVA. Elle ne
  // se règle plus ici, et surtout plus dans la table clé/valeur — un régime
  // s'historise, il ne s'écrase pas.

  return NextResponse.json({ ok: true });
}
