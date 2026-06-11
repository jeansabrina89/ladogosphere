"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "../../../src/lib/supabase-server";
import { supabaseAdmin } from "../../../src/lib/supabase-admin";
import { getSoldeAvoir } from "../../../src/lib/avoirs";

async function verifierAdmin(): Promise<{ error?: string }> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté" };
  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return { error: "Accès réservé à l'admin" };
  return {};
}

function calculerStatut(montantPaye: number, total: number): string {
  if (montantPaye <= 0) return "impaye";
  if (total > 0 && montantPaye >= total) return "paye";
  return "partiel";
}

/**
 * Enregistre OU modifie le paiement d'une réservation (modèle option 1 : un paiement sur la résa).
 * - Plafonne le montant payé au total (montant_final) : on ne peut jamais payer plus que dû.
 * - Recalcule le statut automatiquement (impaye / partiel / paye).
 * - Cohérence des avoirs : si le paiement ACTUEL était en mode "avoir", on re-crédite d'abord ce
 *   montant, puis on applique le nouveau (débit d'avoir si le nouveau mode est "avoir").
 */
export async function enregistrerPaiement(formData: FormData): Promise<{ error?: string }> {
  const verif = await verifierAdmin();
  if (verif.error) return verif;

  const reservation_id = formData.get("reservation_id") as string;
  const client_id = (formData.get("client_id") as string) || null;
  const montantSaisi = parseFloat((formData.get("montant_paye") as string) || "0");
  const date_paiement = (formData.get("date_paiement") as string) || null;
  const mode = ((formData.get("mode_paiement") as string) || "").trim() || null;

  if (!reservation_id) return { error: "Réservation introuvable." };
  if (isNaN(montantSaisi) || montantSaisi < 0) return { error: "Montant invalide." };

  const { data: reservation, error: resError } = await supabaseAdmin
    .from("reservations")
    .select("montant_paye, mode_paiement, montant_final, montant_calcule")
    .eq("id", reservation_id)
    .single();
  if (resError || !reservation) return { error: "Réservation introuvable." };

  const total = Number(reservation.montant_final ?? reservation.montant_calcule ?? 0);
  const ancienMontant = Number(reservation.montant_paye) || 0;
  const ancienMode = reservation.mode_paiement;

  // Plafond : jamais plus que le total dû
  let nouveauMontant = montantSaisi;
  if (total > 0 && nouveauMontant > total) nouveauMontant = total;

  // 1) Réverser l'avoir consommé par le paiement ACTUEL (mode "avoir" => tout le montant)
  if (ancienMode === "avoir" && ancienMontant > 0) {
    if (!client_id) return { error: "Client introuvable (réversion de l'avoir impossible)." };
    const { error: e } = await supabaseAdmin.from("avoirs_mouvements").insert({
      client_id,
      montant: ancienMontant,
      type: "annulation_paiement",
      motif: "Correction paiement (réversion avoir)",
      reservation_id,
    });
    if (e) return { error: e.message };
  }

  // 2) Si le NOUVEAU mode est "avoir", vérifier le solde (recalculé) et débiter
  if (mode === "avoir" && nouveauMontant > 0) {
    if (!client_id) return { error: "Client introuvable." };
    const solde = await getSoldeAvoir(supabaseAdmin, client_id);
    if (nouveauMontant > solde) {
      return { error: `Paiement par avoir impossible : solde disponible CHF ${solde.toFixed(2)}.` };
    }
    const { error: e } = await supabaseAdmin.from("avoirs_mouvements").insert({
      client_id,
      montant: -nouveauMontant,
      type: "utilisation",
      motif: "Paiement par avoir",
      reservation_id,
    });
    if (e) return { error: e.message };
  }

  // 3) Statut dérivé + mise à jour de la réservation
  const statut = calculerStatut(nouveauMontant, total);
  const { error: updateError } = await supabaseAdmin
    .from("reservations")
    .update({
      montant_paye: nouveauMontant,
      statut_paiement: statut,
      mode_paiement: nouveauMontant > 0 ? mode : null,
      date_paiement: nouveauMontant > 0 ? date_paiement : null,
    })
    .eq("id", reservation_id);
  if (updateError) return { error: updateError.message };

  revalidatePath(`/reservations/${reservation_id}`);
  return {};
}

export async function annulerPaiement(formData: FormData): Promise<{ error?: string }> {
  const verif = await verifierAdmin();
  if (verif.error) return verif;

  const reservation_id = formData.get("reservation_id") as string;
  const client_id = formData.get("client_id") as string;
  const mettreEnAvoir = formData.get("mettre_en_avoir") === "true";

  if (!reservation_id) return { error: "Réservation introuvable." };

  const { data: reservation, error: resError } = await supabaseAdmin
    .from("reservations")
    .select("montant_paye")
    .eq("id", reservation_id)
    .single();
  if (resError || !reservation) return { error: "Réservation introuvable." };

  const montantPaye = Number(reservation.montant_paye) || 0;
  if (montantPaye <= 0) {
    return { error: "Aucun paiement à annuler pour cette réservation." };
  }

  if (mettreEnAvoir) {
    if (!client_id) return { error: "Client introuvable." };
    const { error: mouvementError } = await supabaseAdmin.from("avoirs_mouvements").insert({
      client_id,
      montant: montantPaye,
      type: "annulation_paiement",
      motif: "Annulation de paiement",
      reservation_id,
    });
    if (mouvementError) return { error: mouvementError.message };
  }

  const { error: updateError } = await supabaseAdmin
    .from("reservations")
    .update({
      montant_paye: 0,
      statut_paiement: "impaye",
      mode_paiement: null,
      date_paiement: null,
    })
    .eq("id", reservation_id);
  if (updateError) return { error: updateError.message };

  revalidatePath(`/reservations/${reservation_id}`);
  return {};
}

export async function supprimerReservationDefinitivement(formData: FormData): Promise<{ error?: string }> {
  const verif = await verifierAdmin();
  if (verif.error) return verif;

  const id = formData.get("id") as string;
  if (!id) return { error: "Réservation introuvable." };

  const { data: reservation, error: resError } = await supabaseAdmin
    .from("reservations")
    .select("id, statut")
    .eq("id", id)
    .single();
  if (resError || !reservation) return { error: "Réservation introuvable." };

  if (reservation.statut !== "annulee") {
    return { error: "Suppression impossible : la réservation n'est pas annulée." };
  }

  const { count, error: factureError } = await supabaseAdmin
    .from("factures")
    .select("id", { count: "exact", head: true })
    .eq("reservation_id", id);
  if (factureError) return { error: factureError.message };

  if ((count ?? 0) > 0) {
    return { error: "Suppression impossible : une facture existe pour cette réservation." };
  }

  const { error: deleteError } = await supabaseAdmin
    .from("reservations")
    .delete()
    .eq("id", id);
  if (deleteError) return { error: deleteError.message };

  redirect("/reservations");
}