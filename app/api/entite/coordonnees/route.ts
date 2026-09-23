import { NextRequest, NextResponse } from "next/server";
import { lireCorpsJson } from "@/src/lib/corpsRequete";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { exigerAdmin, garderRoute } from "@/src/lib/garde";
import { tracerEvenement } from "@/src/lib/journalEvenements";

/**
 * Les coordonnées de paiement de l'entreprise : IBAN (ou QR-IBAN), titulaire
 * et adresse du créancier. Elles vivent sur l'ENTITÉ JURIDIQUE en vigueur —
 * la même source que la raison sociale imprimée en tête d'une facture — et
 * partent dans chaque demande de paiement, rappel et bulletin QR.
 *
 * Réservé à l'admin, sans délégation : c'est là que le client envoie son
 * argent. Chaque changement est journalisé, avant et après.
 */
export async function PUT(req: NextRequest) {
  const g = await garderRoute(exigerAdmin("coordonnees_entite"));
  if (g.refus) return g.refus;

  const lecture = await lireCorpsJson(req);
  if (!lecture.ok) return lecture.reponse;
  const { iban, coordonnees } = lecture.corps;

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
  if (champs.raison_sociale === "") delete champs.raison_sociale;
  if (Object.keys(champs).length === 0) return NextResponse.json({ ok: true });

  // L'entité EN VIGUEUR aujourd'hui : on corrige l'identité courante, on ne
  // touche pas à celle d'une période passée.
  const { data: courante } = await supabaseAdmin
    .from("entites_juridiques")
    .select("id, iban, raison_sociale, adresse_rue, adresse_numero, adresse_npa, adresse_ville, adresse_pays")
    .lte("date_debut", new Date().toISOString().slice(0, 10))
    .order("date_debut", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!courante) return NextResponse.json({ error: "Aucune entité en vigueur." }, { status: 400 });

  const avant: Record<string, unknown> = {};
  const apres: Record<string, unknown> = {};
  for (const [cle, valeur] of Object.entries(champs)) {
    const ancienne = (courante as Record<string, unknown>)[cle] ?? null;
    if (ancienne !== valeur) { avant[cle] = ancienne; apres[cle] = valeur; }
  }
  if (Object.keys(apres).length === 0) return NextResponse.json({ ok: true });

  const { error } = await supabaseAdmin.from("entites_juridiques").update(apres).eq("id", courante.id);
  if (error) return NextResponse.json({ error: "L'enregistrement a été refusé." }, { status: 500 });

  await tracerEvenement({
    entite: "entite_juridique", entiteId: courante.id as string, evenement: "coordonnees",
    avant, apres, userId: g.appelant.userId,
  });
  return NextResponse.json({ ok: true });
}
