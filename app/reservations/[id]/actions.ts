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

export async function enregistrerPaiementAvoir(formData: FormData): Promise<{ error?: string }> {
  const verif = await verifierAdmin();
  if (verif.error) return verif;

  const reservation_id = formData.get("reservation_id") as string;
  const client_id = formData.get("client_id") as string;
  const nouveauMontantPaye = parseFloat(formData.get("montant_paye") as string);
  const statut_paiement = formData.get("statut_paiement") as string;
  const date_paiement = (formData.get("date_paiement") as string) || null;

  if (!reservation_id || !client_id) return { error: "Réservation ou client introuvable." };
  if (isNaN(nouveauMontantPaye)) return { error: "Montant invalide." };

  const { data: reservation, error: resError } = await supabaseAdmin
    .from("reservations")
    .select("montant_paye")
    .eq("id", reservation_id)
    .single();

  if (resError || !reservation) return { error: "Réservation introuvable." };

  const montantAvoir = nouveauMontantPaye - (Number(reservation.montant_paye) || 0);
  if (montantAvoir <= 0) {
    return { error: "Pour un paiement par avoir, le montant reçu doit être supérieur au montant déjà payé." };
  }

  const solde = await getSoldeAvoir(supabaseAdmin, client_id);
  if (montantAvoir > solde) {
    return { error: `Paiement par avoir impossible : solde disponible CHF ${solde.toFixed(2)}.` };
  }

  const { error: mouvementError } = await supabaseAdmin.from("avoirs_mouvements").insert({
    client_id,
    montant: -montantAvoir,
    type: "utilisation",
    motif: "Paiement par avoir",
    reservation_id,
  });

  if (mouvementError) return { error: mouvementError.message };

  const { error: updateError } = await supabaseAdmin
    .from("reservations")
    .update({
      montant_paye: nouveauMontantPaye,
      statut_paiement,
      mode_paiement: "avoir",
      date_paiement,
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
