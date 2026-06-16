"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "../../../src/lib/supabase-admin";
import { verifierPermission } from "../../../src/lib/verifierPermission";
function calculerStatut(montantPaye: number, total: number): string {
  if (montantPaye <= 0) return "impaye";
  if (total > 0 && montantPaye >= total) return "paye";
  return "partiel";
}

export async function marquerFactureReglee(
  factureId: string,
  mode: "cash" | "virement"
): Promise<{ error?: string }> {
  const verif = await verifierPermission("perm_encaissements");
  if (verif.error) return verif;

  // 1. Charger la facture + ses lignes + réservations liées
  const { data: facture, error: facErr } = await supabaseAdmin
    .from("factures")
    .select(`
      id, statut, montant_total,
      facture_reservations (
        reservation_id,
        reservations (id, montant_final, montant_calcule)
      )
    `)
    .eq("id", factureId)
    .single();

  if (facErr || !facture) return { error: "Facture introuvable." };
  if (facture.statut === "acquittee") return { error: "Cette facture est déjà acquittée." };
  if (facture.statut === "annulee") return { error: "Cette facture est annulée et ne peut pas être réglée." };

  const today = new Date().toISOString().split("T")[0];
  const lignes = (facture.facture_reservations ?? []) as any[];

  // 2. Payer chaque réservation en cascade
  for (const ligne of lignes) {
    const r = ligne.reservations;
    if (!r) continue;
    const total = Number(r.montant_final ?? r.montant_calcule ?? 0);
    const { error: updErr } = await supabaseAdmin
      .from("reservations")
      .update({
        montant_paye: total,
        statut_paiement: calculerStatut(total, total),
        date_paiement: today,
        mode_paiement: mode,
      })
      .eq("id", ligne.reservation_id);
    if (updErr) return { error: updErr.message };
  }

  // 3. Acquitter la facture
  const montantTotal = Number(facture.montant_total ?? 0);
  const { error: facUpdateErr } = await supabaseAdmin
    .from("factures")
    .update({ statut: "acquittee", montant_paye: montantTotal, montant_restant: 0 })
    .eq("id", factureId);
  if (facUpdateErr) return { error: facUpdateErr.message };

  // 4. Tracer le paiement dans la table paiements
  const { error: paiErr } = await supabaseAdmin
    .from("paiements")
    .insert({
      facture_id: factureId,
      date_paiement: today,
      mode_paiement: mode,
      montant: montantTotal,
      commentaire: "Règlement facture groupée",
    });
  if (paiErr) return { error: paiErr.message };

  revalidatePath(`/factures/${factureId}`);
  revalidatePath("/reservations");
  return {};
}

export async function annulerFacture(
  factureId: string
): Promise<{ error?: string }> {
  const verif = await verifierPermission("perm_encaissements");
  if (verif.error) return verif;

  const { data: facture, error: facErr } = await supabaseAdmin
    .from("factures")
    .select("id, statut")
    .eq("id", factureId)
    .single();

  if (facErr || !facture) return { error: "Facture introuvable." };
  if (facture.statut === "acquittee") {
    return { error: "Impossible d'annuler une facture déjà réglée." };
  }
  if (facture.statut === "annulee") return {};

  const { error: updErr } = await supabaseAdmin
    .from("factures")
    .update({ statut: "annulee" })
    .eq("id", factureId);
  if (updErr) return { error: updErr.message };

  // Libérer les réservations pour re-facturation (index unique partiel)
  const { error: liensErr } = await supabaseAdmin
    .from("facture_reservations")
    .update({ facture_annulee: true })
    .eq("facture_id", factureId);
  if (liensErr) return { error: liensErr.message };

  revalidatePath(`/factures/${factureId}`);
  revalidatePath("/reservations");
  return {};
}
