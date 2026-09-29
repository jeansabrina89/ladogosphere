import { NextRequest, NextResponse } from "next/server";
import { lireCorpsJson } from "@/src/lib/corpsRequete";
import { exigerAdmin, garderRoute } from "@/src/lib/garde";
import { supabaseAdmin } from "@/src/lib/supabase-admin";

const CHAMPS = ["sujet", "titre", "intro", "message_final"] as const;

/**
 * APP 60 — les AUTRES textes de l'e-mail, sous la même garde et le même geste.
 *
 * Une clé absente, vide, ou dont la liste ne garde aucune ligne n'est PAS
 * écrite : elle est retirée de l'objet. C'est ainsi que « Revenir au texte
 * d'origine » fonctionne — il n'écrit rien, il efface. Un bloc enregistré vide
 * aurait produit un e-mail amputé d'un paragraphe, et cela ne se remarque pas.
 *
 * Une clé inconnue du code est acceptée en base mais ignorée au rendu : la
 * base ne peut pas inventer un texte que le code n'attend pas.
 */
function blocsANettoyer(brut: unknown): Record<string, string | string[]> {
  const source = (brut ?? {}) as Record<string, unknown>;
  const propres: Record<string, string | string[]> = {};
  for (const [cle, valeur] of Object.entries(source)) {
    if (Array.isArray(valeur)) {
      const lignes = valeur.map((l) => String(l ?? "").trim()).filter((l) => l !== "");
      if (lignes.length > 0) propres[cle] = lignes;
      continue;
    }
    if (typeof valeur === "string" && valeur.trim() !== "") propres[cle] = valeur;
  }
  return propres;
}

export async function POST(req: NextRequest) {
  const g = await garderRoute(exigerAdmin("modele_email"));
  if (g.refus) return g.refus;
  const user = { id: g.appelant.userId };

  const lecture = await lireCorpsJson(req);
  if (!lecture.ok) return lecture.reponse;
  const body = lecture.corps;
  const type = typeof body?.type === "string" ? body.type.trim() : "";
  if (!type) {
    return NextResponse.json({ error: "Type manquant" }, { status: 400 });
  }

  const ligne: Record<string, unknown> = { type, updated_at: new Date().toISOString(), updated_by: user.id };
  for (const champ of CHAMPS) {
    const v = body?.[champ];
    // Chaine vide -> null = repli sur le texte par defaut
    ligne[champ] = typeof v === "string" && v.trim() !== "" ? v : null;
  }

  ligne.blocs = blocsANettoyer(body?.blocs);

  const { error } = await supabaseAdmin
    .from("modeles_email")
    .upsert(ligne, { onConflict: "type" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
