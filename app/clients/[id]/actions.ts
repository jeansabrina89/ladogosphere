"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "../../../src/utils/supabase/server";
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

export async function ajouterAvoir(formData: FormData): Promise<{ error?: string }> {
  const verif = await verifierAdmin();
  if (verif.error) return verif;

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  const client_id = formData.get("client_id") as string;
  const montant = parseFloat(formData.get("montant") as string);
  const motif = (formData.get("motif") as string)?.trim();

  if (!client_id) return { error: "Client introuvable." };
  if (!montant || montant <= 0) return { error: "Le montant doit être supérieur à 0." };
  if (!motif) return { error: "Le motif est requis." };

  const { error } = await supabaseAdmin.from("avoirs_mouvements").insert({
    client_id,
    montant,
    type: "ajout_manuel",
    motif,
    created_by: user?.id ?? null,
  });

  if (error) return { error: error.message };

  revalidatePath(`/clients/${client_id}`);
  return {};
}

export async function retirerAvoir(formData: FormData): Promise<{ error?: string }> {
  const verif = await verifierAdmin();
  if (verif.error) return verif;

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  const client_id = formData.get("client_id") as string;
  const montant = parseFloat(formData.get("montant") as string);
  const motif = (formData.get("motif") as string)?.trim();

  if (!client_id) return { error: "Client introuvable." };
  if (!montant || montant <= 0) return { error: "Le montant doit être supérieur à 0." };
  if (!motif) return { error: "Le motif est requis." };

  const solde = await getSoldeAvoir(supabaseAdmin, client_id);
  if (solde - montant < 0) {
    return { error: `Retrait impossible : le solde actuel (CHF ${solde.toFixed(2)}) est insuffisant.` };
  }

  const { error } = await supabaseAdmin.from("avoirs_mouvements").insert({
    client_id,
    montant: -montant,
    type: "retrait_manuel",
    motif,
    created_by: user?.id ?? null,
  });

  if (error) return { error: error.message };

  revalidatePath(`/clients/${client_id}`);
  return {};
}

export async function archiverClient(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;
  const actif = formData.get("actif") === "true";

  const { error } = await supabase
    .from("clients")
    .update({ actif: !actif })
    .eq("id", id);

  if (error) throw new Error(error.message);
  redirect(`/clients/${id}`);
}

export async function supprimerClient(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;

  const { error } = await supabase
    .from("clients")
    .delete()
    .eq("id", id);

  if (error) throw new Error(error.message);
  redirect("/clients");
}