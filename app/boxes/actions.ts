"use server";

import { createSupabaseServerClient } from "../../src/lib/supabase-server";
import { supabaseAdmin } from "../../src/lib/supabase-admin";
import { revalidatePath } from "next/cache";

async function verifierAdmin(): Promise<{ error?: string }> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté" };
  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return { error: "Accès réservé à l'admin" };
  return {};
}

export async function creerBox(formData: FormData): Promise<{ error?: string }> {
  const verif = await verifierAdmin();
  if (verif.error) return verif;

  const numero = parseInt(formData.get("numero") as string);
  if (!numero) return { error: "Le numéro est requis" };

  const nom = (formData.get("nom") as string)?.trim() || null;
  const capaciteStandardRaw = formData.get("capacite_standard") as string;
  const capacitePetitsRaw = formData.get("capacite_petits_chiens") as string;
  const notes = (formData.get("notes") as string)?.trim() || null;

  const { error } = await supabaseAdmin.from("boxes").insert({
    numero,
    nom,
    capacite_standard: capaciteStandardRaw ? parseInt(capaciteStandardRaw) : null,
    capacite_petits_chiens: capacitePetitsRaw ? parseInt(capacitePetitsRaw) : null,
    notes,
    actif: true,
  });
  if (error) {
    if (error.code === "23505") return { error: "Une box avec ce numéro existe déjà." };
    return { error: error.message };
  }

  revalidatePath("/boxes");
  return {};
}

export async function modifierBox(id: string, formData: FormData): Promise<{ error?: string }> {
  const verif = await verifierAdmin();
  if (verif.error) return verif;

  const nom = (formData.get("nom") as string)?.trim() || null;
  const capaciteStandardRaw = formData.get("capacite_standard") as string;
  const capacitePetitsRaw = formData.get("capacite_petits_chiens") as string;
  const notes = (formData.get("notes") as string)?.trim() || null;
  const actif = formData.get("actif") === "on";

  const { error } = await supabaseAdmin.from("boxes")
    .update({
      nom,
      capacite_standard: capaciteStandardRaw ? parseInt(capaciteStandardRaw) : null,
      capacite_petits_chiens: capacitePetitsRaw ? parseInt(capacitePetitsRaw) : null,
      notes,
      actif,
    })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/boxes");
  return {};
}

export async function ajouterIndisponibilite(formData: FormData): Promise<{ error?: string }> {
  const verif = await verifierAdmin();
  if (verif.error) return verif;

  const box_id = formData.get("box_id") as string;
  const date_debut = formData.get("date_debut") as string;
  const date_fin = formData.get("date_fin") as string;
  const motif = (formData.get("motif") as string)?.trim() || null;

  if (!box_id || !date_debut || !date_fin) return { error: "Champs requis manquants" };
  if (date_fin < date_debut) return { error: "La date de fin doit être postérieure à la date de début" };

  const { error } = await supabaseAdmin.from("box_indisponibilites").insert({
    box_id, date_debut, date_fin, motif,
  });
  if (error) return { error: error.message };

  revalidatePath("/boxes");
  return {};
}

export async function supprimerIndisponibilite(id: string): Promise<{ error?: string }> {
  const verif = await verifierAdmin();
  if (verif.error) return verif;

  const { error } = await supabaseAdmin.from("box_indisponibilites").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/boxes");
  return {};
}
