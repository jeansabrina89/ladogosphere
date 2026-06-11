"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../../../src/lib/supabase-server";
import { supabaseAdmin } from "../../../src/lib/supabase-admin";

async function verifierAdmin(): Promise<{ error?: string }> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté" };
  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return { error: "Accès réservé à l'admin" };
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
