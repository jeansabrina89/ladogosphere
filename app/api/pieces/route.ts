import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/src/utils/supabase/server";
import { lireCorpsFormulaire } from "@/src/lib/corpsRequete";
import { exigerPermissionApi } from "@/src/lib/apiAuth";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { deposerPiece, type EntitePiece } from "@/src/lib/pieces";

const ENTITES: EntitePiece[] = ["depense", "facture", "paiement"];

/**
 * Dépôt d'un justificatif. Le fichier ne transite pas par une Server Action :
 * un envoi multipart va plus vite depuis un téléphone et permet la barre de
 * progression du navigateur.
 *
 * Les pièces d'une dépense relèvent de perm_depenses, celles d'une facture ou
 * d'un paiement de perm_encaissements.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const lecture = await lireCorpsFormulaire(req);
  if (!lecture.ok) return lecture.reponse;
  const formData = lecture.corps;

  const entite = String(formData.get("entite") ?? "") as EntitePiece;
  const entite_id = String(formData.get("entite_id") ?? "");
  const fichier = formData.get("fichier");

  if (!ENTITES.includes(entite)) {
    return NextResponse.json({ error: "Type de pièce inconnu." }, { status: 400 });
  }

  const garde = await exigerPermissionApi(
    supabase,
    entite === "depense" ? "perm_depenses" : "perm_encaissements"
  );
  if (garde) return garde;

  if (!entite_id) return NextResponse.json({ error: "Pièce sans rattachement." }, { status: 400 });
  if (!(fichier instanceof File)) {
    return NextResponse.json({ error: "Aucun fichier reçu." }, { status: 400 });
  }

  // Une dépense validée garde ses justificatifs tels quels.
  if (entite === "depense") {
    const { data: depense } = await supabaseAdmin
      .from("depenses").select("numero").eq("id", entite_id).maybeSingle();
    if (!depense) return NextResponse.json({ error: "Dépense introuvable." }, { status: 404 });
    if (depense.numero) {
      return NextResponse.json(
        { error: "Dépense validée : ses justificatifs ne changent plus." },
        { status: 400 }
      );
    }
  }

  const { data: { user } } = await supabase.auth.getUser();
  const res = await deposerPiece({
    entite,
    entite_id,
    fichier,
    uploaded_by: user?.id ?? null,
  });

  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ piece: res.piece });
}
