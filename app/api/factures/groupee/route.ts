import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../src/lib/supabase-server";
import { supabaseAdmin } from "../../../../src/lib/supabase-admin";
import { exigerPermissionApi } from "../../../../src/lib/apiAuth";

const STATUTS_FACTURABLES = ["validee", "terminee"];
const PAIEMENTS_FACTURABLES = ["impaye", "partiel"];

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const garde = await exigerPermissionApi(supabase, "perm_encaissements");
  if (garde) return garde;

  let body: { reservation_ids?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  }

  const { reservation_ids } = body;
  if (!reservation_ids || reservation_ids.length === 0) {
    return NextResponse.json({ error: "Aucune réservation sélectionnée." }, { status: 400 });
  }

  // 1. Charger les réservations
  const { data: reservations, error: resErr } = await supabaseAdmin
    .from("reservations")
    .select("id, client_id, statut, statut_paiement, montant_final, montant_calcule, montant_paye")
    .in("id", reservation_ids);

  if (resErr) return NextResponse.json({ error: resErr.message }, { status: 500 });

  // 2. Toutes existent
  if (!reservations || reservations.length !== reservation_ids.length) {
    return NextResponse.json({ error: "Certaines réservations sont introuvables." }, { status: 400 });
  }

  // 3. Même client_id
  const clientsUniques = new Set(reservations.map(r => r.client_id));
  if (clientsUniques.size !== 1) {
    return NextResponse.json(
      { error: "Toutes les réservations doivent appartenir au même client." },
      { status: 400 }
    );
  }
  const client_id = reservations[0].client_id;

  // 4. Valider statut + statut_paiement + reste > 0
  for (const r of reservations) {
    if (!STATUTS_FACTURABLES.includes(r.statut)) {
      return NextResponse.json(
        { error: `La réservation #${r.id} n'est pas dans un statut facturable (validée ou terminée).` },
        { status: 400 }
      );
    }
    if (!PAIEMENTS_FACTURABLES.includes(r.statut_paiement ?? "")) {
      return NextResponse.json(
        { error: `La réservation #${r.id} est déjà payée ou a un statut de paiement invalide.` },
        { status: 400 }
      );
    }
    const total = Number(r.montant_final ?? r.montant_calcule ?? 0);
    const paye = Number(r.montant_paye ?? 0);
    if (total - paye <= 0) {
      return NextResponse.json(
        { error: `Aucun reste à payer pour la réservation #${r.id}.` },
        { status: 400 }
      );
    }
  }

  // 5. Aucune déjà liée à une facture non annulée
  const { data: liens, error: liensErr } = await supabaseAdmin
    .from("facture_reservations")
    .select("reservation_id, factures!inner(statut)")
    .in("reservation_id", reservation_ids);

  if (liensErr) return NextResponse.json({ error: liensErr.message }, { status: 500 });

  const dejaFacturees = (liens ?? []).filter(
    (l: any) => l.factures?.statut !== "annulee"
  );
  if (dejaFacturees.length > 0) {
    return NextResponse.json(
      { error: "Une ou plusieurs réservations sont déjà liées à une facture active." },
      { status: 400 }
    );
  }

  // 6. Calcul des montants par réservation et du total
  const lignes = reservations.map(r => {
    const total = Number(r.montant_final ?? r.montant_calcule ?? 0);
    const paye = Number(r.montant_paye ?? 0);
    return {
      reservation_id: r.id,
      montant: Math.round((total - paye) * 100) / 100,
    };
  });
  const montantTotal = Math.round(
    lignes.reduce((s, l) => s + l.montant, 0) * 100
  ) / 100;

  // 7. Générer le numéro de facture via la fonction SQL
  const { data: numeroData, error: rpcErr } = await supabaseAdmin.rpc("generer_numero_facture");
  if (rpcErr || !numeroData) {
    return NextResponse.json({ error: "Erreur lors de la génération du numéro de facture." }, { status: 500 });
  }
  const numero = numeroData as string;

  // 8. Insérer la facture
  const { data: facture, error: facErr } = await supabaseAdmin
    .from("factures")
    .insert({
      numero,
      client_id,
      type_facture: "reservation",
      date_facture: new Date().toISOString().split("T")[0],
      montant_total: montantTotal,
      montant_paye: 0,
      montant_restant: montantTotal,
      statut: "envoyee",
      reservation_id: null,
    })
    .select("id")
    .single();

  if (facErr || !facture) {
    return NextResponse.json(
      { error: facErr?.message ?? "Erreur lors de la création de la facture." },
      { status: 500 }
    );
  }

  // 9. Insérer les lignes facture_reservations
  const { error: lignesErr } = await supabaseAdmin
    .from("facture_reservations")
    .insert(
      lignes.map(l => ({
        facture_id: facture.id,
        reservation_id: l.reservation_id,
        montant: l.montant,
      }))
    );

  if (lignesErr) {
    return NextResponse.json({ error: lignesErr.message }, { status: 500 });
  }

  return NextResponse.json({ facture_id: facture.id, numero, total: montantTotal });
}
