"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { verifierPermission } from "@/src/lib/verifierPermission";

export async function bloquerPeriodeEssai(formData: FormData) {
  const verif = await verifierPermission("perm_journee_essai");
  if (verif.error) throw new Error(verif.error);

  const date_debut = (formData.get("date_debut") as string || "").trim();
  const date_fin = (formData.get("date_fin") as string || "").trim();
  const motifRaw = (formData.get("motif") as string || "").trim();
  const motif = motifRaw || null;

  if (!date_debut || !date_fin) {
    throw new Error("Merci d'indiquer une date de début et une date de fin.");
  }
  if (date_fin < date_debut) {
    throw new Error("La date de fin doit être après la date de début.");
  }

  // Évite un doublon exact (même plage déjà enregistrée).
  const { data: existant } = await supabaseAdmin
    .from("fermetures_essai")
    .select("id")
    .eq("date_debut", date_debut)
    .eq("date_fin", date_fin)
    .limit(1);

  if (!existant || existant.length === 0) {
    const { error } = await supabaseAdmin
      .from("fermetures_essai")
      .insert({ date_debut, date_fin, motif });
    if (error) throw new Error(error.message);
  }

  revalidatePath("/calendrier-essais");
}

export async function debloquerPeriodeEssai(id: string, _formData: FormData) {
  const verif = await verifierPermission("perm_journee_essai");
  if (verif.error) throw new Error(verif.error);

  const { error } = await supabaseAdmin
    .from("fermetures_essai")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/calendrier-essais");
}
