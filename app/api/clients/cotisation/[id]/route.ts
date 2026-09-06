import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/src/utils/supabase/server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { exigerPermissionApi } from "@/src/lib/apiAuth";
import { synchroniserComptaCotisation } from "@/src/lib/comptaCotisation";
import { calculerPeriodeCotisation } from "@/src/lib/cotisationPeriode";
import { aujourdhuiISO } from "@/src/lib/dates";

// Confirmer le paiement d'une adhésion : passe en "payee"
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const garde = await exigerPermissionApi(supabase, "perm_encaissements");
    if (garde) return garde;
    const { id } = await params;
    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* corps vide */ }
    const { date_paiement, mode_paiement } = body as { date_paiement?: string; mode_paiement?: string };

    if (date_paiement && !/^\d{4}-\d{2}-\d{2}$/.test(date_paiement)) {
      return NextResponse.json({ error: "Format de date invalide" }, { status: 400 });
    }

    const { data: cotisation } = await supabaseAdmin
      .from("cotisations_membres")
      .select("client_id")
      .eq("id", id)
      .maybeSingle();
    if (!cotisation) {
      return NextResponse.json({ error: "Cotisation introuvable" }, { status: 404 });
    }

    // Date d'encaissement = celle fournie, sinon aujourd'hui. La période de
    // validité (12 mois glissants) est recalculée à partir d'elle, en tenant
    // compte d'une cotisation encore en cours (renouvellement anticipé).
    const datePaiement = date_paiement || aujourdhuiISO();
    const { data: periodeRows, error: errPeriode } = await supabaseAdmin.rpc(
      "calculer_periode_cotisation",
      { p_client_id: cotisation.client_id, p_date_paiement: datePaiement, p_exclure_id: id }
    );
    const ligne = Array.isArray(periodeRows) ? periodeRows[0] : periodeRows;
    const periode =
      errPeriode || !ligne?.date_debut
        ? calculerPeriodeCotisation(datePaiement)
        : { date_debut: ligne.date_debut as string, date_fin: ligne.date_fin as string };

    // Le montant d'une adhésion encaissée est TOUJOURS rafraîchi à la valeur
    // courante du paramètre (la période n'étant plus l'année civile, il n'y a
    // plus de notion d'« année passée » à figer ici).
    const { data: paramCotis } = await supabaseAdmin
      .from("parametres")
      .select("valeur")
      .eq("cle", "cotisation_montant")
      .maybeSingle();
    const montantCourant = parseFloat(paramCotis?.valeur ?? "200") || 200;

    const champsModeAcceptes = ["cash", "virement"];
    const updateData: Record<string, unknown> = {
      statut: "payee",
      date_paiement: datePaiement,
      date_debut: periode.date_debut,
      date_fin: periode.date_fin,
      montant: montantCourant,
    };
    if (mode_paiement && champsModeAcceptes.includes(mode_paiement)) {
      updateData.mode_paiement = mode_paiement;
    }

    const { error } = await supabaseAdmin
      .from("cotisations_membres")
      .update(updateData)
      .eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Comptabiliser l'encaissement (3005) — sans effet si liée à une réservation.
    await synchroniserComptaCotisation(id);

    return NextResponse.json({ ok: true, ...periode });
  } catch {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// Annuler le paiement d'une adhésion : repasse en "en_attente"
// (date_debut / date_fin sont conservées telles quelles — elles redeviennent
// provisoires et seront recalculées au prochain encaissement).
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const garde = await exigerPermissionApi(supabase, "perm_encaissements");
    if (garde) return garde;
    const { id } = await params;

    const { error } = await supabaseAdmin
      .from("cotisations_membres")
      .update({ statut: "en_attente", date_paiement: null })
      .eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Contre-passer automatiquement l'écriture d'adhésion (delta → statut non payé).
    await synchroniserComptaCotisation(id);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
