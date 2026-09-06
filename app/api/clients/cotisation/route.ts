import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/src/utils/supabase/server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { exigerPermissionApi } from "@/src/lib/apiAuth";
import { synchroniserComptaCotisation } from "@/src/lib/comptaCotisation";
import { cotisationEnAttente } from "@/src/lib/cotisation";
import { calculerPeriodeCotisation } from "@/src/lib/cotisationPeriode";
import { aujourdhuiISO } from "@/src/lib/dates";

/**
 * Période à poser pour une cotisation PAYÉE : règle des 12 mois glissants,
 * en tenant compte d'une éventuelle cotisation en cours du même client
 * (renouvellement anticipé). Calcul délégué à la fonction SQL, qui partage la
 * règle avec le trigger de flip au paiement d'une réservation.
 */
async function periodePayee(client_id: string, date_paiement: string, exclure_id?: string | null) {
  const { data, error } = await supabaseAdmin.rpc("calculer_periode_cotisation", {
    p_client_id: client_id,
    p_date_paiement: date_paiement,
    p_exclure_id: exclure_id ?? null,
  });
  const ligne = Array.isArray(data) ? data[0] : data;
  if (error || !ligne?.date_debut) {
    // Repli sur la règle pure (mêmes résultats, sans la cotisation précédente).
    return calculerPeriodeCotisation(date_paiement);
  }
  return { date_debut: ligne.date_debut as string, date_fin: ligne.date_fin as string };
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const garde = await exigerPermissionApi(supabase, "perm_encaissements");
  if (garde) return garde;
  const { client_id, mode_paiement, statut, date_paiement } = await req.json();

  if (!client_id) {
    return NextResponse.json({ error: "client_id manquant" }, { status: 400 });
  }
  if (date_paiement && !/^\d{4}-\d{2}-\d{2}$/.test(date_paiement)) {
    return NextResponse.json({ error: "Format de date invalide" }, { status: 400 });
  }

  // Montant TOUJOURS lu depuis le paramètre (jamais une constante ni le corps de requête).
  const { data: paramCotis } = await supabaseAdmin
    .from("parametres")
    .select("valeur")
    .eq("cle", "cotisation_montant")
    .maybeSingle();
  const montant = parseFloat(paramCotis?.valeur ?? "200") || 200;

  // Une demande en attente existe ? On la met à jour ; sinon on insère.
  // (La base n'autorise plus qu'UNE cotisation en_attente par client.)
  const enAttente = await cotisationEnAttente(supabaseAdmin, client_id);

  const aujourdhui = aujourdhuiISO();
  const periode =
    statut === "payee"
      ? await periodePayee(client_id, date_paiement || aujourdhui, enAttente?.id)
      : // Adhésion pas encore réglée : période PROVISOIRE démarrant aujourd'hui,
        // recalculée à la confirmation du paiement.
        calculerPeriodeCotisation(aujourdhui);

  const valeurs = {
    client_id,
    montant,
    mode_paiement,
    statut,
    date_paiement: statut === "payee" ? date_paiement || aujourdhui : date_paiement || null,
    date_debut: periode.date_debut,
    date_fin: periode.date_fin,
  };

  let cotisationId = enAttente?.id ?? null;

  if (enAttente) {
    const { error } = await supabaseAdmin
      .from("cotisations_membres")
      .update(valeurs)
      .eq("id", enAttente.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { data, error } = await supabaseAdmin
      .from("cotisations_membres")
      .insert(valeurs)
      .select("id")
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    cotisationId = data?.id ?? null;
  }

  // Activer le statut membre
  const { error: errClient } = await supabaseAdmin
    .from("clients")
    .update({ membre: true })
    .eq("id", client_id);

  if (errClient) {
    return NextResponse.json({ error: errClient.message }, { status: 500 });
  }

  // Comptabiliser si payée cash/virement (3005) ; sans effet sinon.
  if (cotisationId) await synchroniserComptaCotisation(cotisationId);

  return NextResponse.json({ ok: true, ...periode });
}
