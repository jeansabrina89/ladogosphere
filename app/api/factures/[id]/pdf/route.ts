import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/src/utils/supabase/server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { urlSigneePdf, genererPdfFacture } from "@/src/lib/factureDocument";

// Sert le PDF STOCKÉ d'une facture, via une URL signée de courte durée.
// Le personnel voit tout ; un client ne voit que ses propres factures.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

  const { id } = await params;

  const { data: profile } = await supabase
    .from("profiles").select("role, perm_encaissements").eq("id", user.id).single();
  const estPersonnel = profile?.role === "admin" || profile?.role === "employe";

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
  if (!facture.pdf_path && estPersonnel) {
    await genererPdfFacture(id);
  }

  const url = await urlSigneePdf(id, 120);
  if (!url) return NextResponse.json({ error: "PDF indisponible." }, { status: 404 });

  return NextResponse.redirect(url);
}
