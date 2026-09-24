import { NextRequest, NextResponse } from "next/server";
import { lireAppelant } from "@/src/lib/garde";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { urlSigneePdf, genererPdfFacture } from "@/src/lib/factureDocument";

// Sert le PDF STOCKÉ d'une facture, via une URL signée de courte durée.
// Le personnel voit tout ; un client ne voit que ses propres factures.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // La lecture commune de l'appelant (garde.ts) : un compte désactivé n'ouvre plus rien.
  const appelant = await lireAppelant();
  if (!appelant) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  if (!appelant.actif) return NextResponse.json({ error: "Compte désactivé" }, { status: 403 });
  const user = { id: appelant.userId };

  const { id } = await params;

  const estPersonnel = appelant.role === "admin" || appelant.role === "employe";

  const { data: facture } = await supabaseAdmin
    .from("factures")
    .select("id, numero, client_id, pdf_path, clients (auth_user_id)")
    .eq("id", id)
    .maybeSingle();
  if (!facture) return NextResponse.json({ error: "Facture introuvable" }, { status: 404 });

  if (!estPersonnel) {
    const c = facture.clients as unknown as { auth_user_id?: string } | null;
    if (c?.auth_user_id !== user.id) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }
  }

  if (!facture.numero) {
    return NextResponse.json({ error: "Cette facture n'est pas émise." }, { status: 400 });
  }

  // Le PDF d'une facture émise avant cette phase n'existe pas encore : on le
  // fabrique une fois, puis il ne bouge plus.
  //
  // L'autorisation se joue PLUS HAUT, sur la propriété de la facture : le
  // client qui arrive ici est déjà celui à qui elle appartient. Réserver la
  // fabrication au personnel laissait ce client devant une page vide pour un
  // document qui est le sien.
  //
  // La génération n'a lieu qu'une fois : `genererPdfFacture` sort immédiatement
  // si `pdf_path` est renseigné, et l'écrit dès le dépôt réussi. Un client qui
  // rafraîchit ne fabrique donc pas un PDF à chaque appel.
  if (!facture.pdf_path) {
    await genererPdfFacture(id);
  }

  const url = await urlSigneePdf(id, 120);
  if (!url) return NextResponse.json({ error: "PDF indisponible." }, { status: 404 });

  return NextResponse.redirect(url);
}
