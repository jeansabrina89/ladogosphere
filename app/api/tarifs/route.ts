import { NextRequest, NextResponse } from "next/server";
import { lireCorpsJson } from "@/src/lib/corpsRequete";
import { createClient } from "@/src/utils/supabase/server";
import { exigerPersonnel } from "@/src/lib/apiAuth";
import { supabaseAdmin } from "@/src/lib/supabase-admin";

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

  // L'IBAN et les coordonnées du créancier vivent désormais sur l'ENTITÉ
  // JURIDIQUE en vigueur, et non plus dans la table clé/valeur : c'est la même
  // source que la raison sociale imprimée en tête d'une facture. Deux sources
  // pour un même créancier finissent par écrire deux titulaires sur la
  // même pièce.
  const champs: Record<string, string | null> = {};
  if (iban !== undefined) champs.iban = String(iban ?? "").trim() || null;
  if (coordonnees && typeof coordonnees === "object") {
    const c = coordonnees as Record<string, string>;
    if (c.titulaire !== undefined) champs.raison_sociale = String(c.titulaire ?? "").trim();
    for (const cle of ["adresse_rue", "adresse_numero", "adresse_npa", "adresse_ville"]) {
      if (c[cle] !== undefined) champs[cle] = String(c[cle] ?? "").trim() || null;
    }
    if (c.adresse_pays !== undefined) champs.adresse_pays = String(c.adresse_pays ?? "").trim() || "CH";
  }

  if (Object.keys(champs).length > 0) {
    // L'entité EN VIGUEUR aujourd'hui : on corrige l'identité courante, on ne
    // touche pas à celle d'une période passée.
    const { data: courante } = await supabaseAdmin
      .from("entites_juridiques")
      .select("id")
      .lte("date_debut", new Date().toISOString().slice(0, 10))
      .order("date_debut", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (courante) {
      if (champs.raison_sociale === "") delete champs.raison_sociale;
      await supabaseAdmin.from("entites_juridiques").update(champs).eq("id", courante.id);
    }
  }

  // La TVA a son écran et sa table (parametres_tva) : Réglages → TVA. Elle ne
  // se règle plus ici, et surtout plus dans la table clé/valeur — un régime
  // s'historise, il ne s'écrase pas.

  return NextResponse.json({ ok: true });
}
