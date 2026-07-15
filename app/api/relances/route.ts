import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { exigerPermissionApi } from "@/src/lib/apiAuth";
import { envoyerEmailRelancePaiement } from "@/src/lib/email";
import { getCoordonneesPaiement } from "@/src/lib/coordonneesPaiement";
import { resteAPayer } from "@/src/lib/montants";
import { niveauRelanceDu } from "@/src/lib/relances";

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const garde = await exigerPermissionApi(supabase, "perm_encaissements");
  if (garde) return garde;

  let body: { reservation_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps de requete invalide." }, { status: 400 });
  }
  const { reservation_id } = body;
  if (!reservation_id) {
    return NextResponse.json({ error: "Reservation manquante." }, { status: 400 });
  }

  const { data: res } = await supabaseAdmin
    .from("reservations")
    .select("*, clients (prenom, email)")
    .eq("id", reservation_id)
    .single();

  if (!res) return NextResponse.json({ error: "Reservation introuvable." }, { status: 404 });
  if (res.type_reservation !== "sejour") {
    return NextResponse.json({ error: "Relance reservee aux sejours." }, { status: 400 });
  }
  if (res.offerte) return NextResponse.json({ error: "Reservation offerte." }, { status: 400 });
  if (res.statut_paiement === "paye") {
    return NextResponse.json({ error: "Reservation deja payee." }, { status: 400 });
  }

  const montant = resteAPayer(res);
  if (montant <= 0) {
    return NextResponse.json({ error: "Rien a relancer (solde nul)." }, { status: 400 });
  }

  const niveau = niveauRelanceDu(res.date_fin);
  const dejaEnvoye = Number(res.relance_niveau ?? 0);
  if (niveau <= 0 || niveau <= dejaEnvoye) {
    return NextResponse.json({ error: "Aucune relance due pour cette reservation." }, { status: 400 });
  }

  const email = res.clients?.email;
  const prenom = res.clients?.prenom || "Client";
  if (!email) return NextResponse.json({ error: "Email client manquant." }, { status: 400 });

  const coords = await getCoordonneesPaiement(supabaseAdmin);
  try {
    await envoyerEmailRelancePaiement({
      email,
      prenom,
      montant,
      date_debut: res.date_debut,
      date_fin: res.date_fin,
      type: res.type_reservation,
      iban: coords.iban,
      titulaire: coords.titulaire,
      niveau: niveau as 1 | 2 | 3,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }

  const today = new Date().toISOString().split("T")[0];
  await supabaseAdmin
    .from("reservations")
    .update({ relance_niveau: niveau, relance_le: today })
    .eq("id", reservation_id);

  return NextResponse.json({ ok: true, niveau });
}
