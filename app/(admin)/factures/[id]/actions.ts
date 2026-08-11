"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { verifierPermission } from "@/src/lib/verifierPermission";
import { montantDuReservation } from "@/src/lib/montants";
import { enregistrerPaiement } from "../../reservations/[id]/actions";

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
        reservations (id, client_id, montant_final, montant_calcule, ajustement_manuel)
      )
    `)
    .eq("id", factureId)
    .single();

  if (facErr || !facture) return { error: "Facture introuvable." };
  if (facture.statut === "acquittee") return { error: "Cette facture est déjà acquittée." };
  if (facture.statut === "annulee") return { error: "Cette facture est annulée et ne peut pas être réglée." };

  const today = new Date().toISOString().split("T")[0];
  const lignes = (facture.facture_reservations ?? []) as any[];

  // 2. Garde-fou : aucune réservation ne doit avoir un montant dû ≤ 0
  for (const ligne of lignes) {
    const r = ligne.reservations;
    if (!r) continue;
    if (montantDuReservation(r) <= 0) {
      return { error: "Montant à régler invalide (0 CHF) sur une réservation — vérifie le tarif." };
    }
  }

  // 3. Régler CHAQUE réservation via le vrai chemin comptable (enregistrerPaiement) :
  //    ligne paiements_resa + synchroniserComptaResa. Idempotent par facture+réservation
  //    (cle_idempotence) pour ne jamais double-poster si l'action est rejouée.
  //    Si une réservation échoue, on s'arrête et on NE marque PAS la facture acquittée.
  for (const ligne of lignes) {
    const r = ligne.reservations;
    if (!r) continue;
    const fd = new FormData();
    fd.set("reservation_id", ligne.reservation_id);
    fd.set("client_id", r.client_id ?? "");
    fd.set("montant_paye", String(montantDuReservation(r)));
    fd.set("date_paiement", today);
    fd.set("mode_paiement", mode);
    const res = await enregistrerPaiement(fd, `facture:${factureId}:resa:${ligne.reservation_id}`);
    if (res.error) return { error: res.error };
  }

  // 4. Acquitter la facture
  const montantTotal = Number(facture.montant_total ?? 0);
  const { error: facUpdateErr } = await supabaseAdmin
    .from("factures")
    .update({ statut: "acquittee", montant_paye: montantTotal, montant_restant: 0 })
    .eq("id", factureId);
  if (facUpdateErr) return { error: facUpdateErr.message };

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
