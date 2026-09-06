"use server";

import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { verifierPermission } from "@/src/lib/verifierPermission";

export async function modifierClient(id: string, formData: FormData) {
  const verif = await verifierPermission("perm_clients_modifier");
  if (verif.error) throw new Error(verif.error);

  // Accord photos : horodaté seulement s'il change réellement.
  const photosOk = formData.get("photos_ok") === "on";
  const { data: avant } = await supabaseAdmin
    .from("clients")
    .select("photos_ok")
    .eq("id", id)
    .maybeSingle();

  const updateData: Record<string, unknown> = {
    photos_ok: photosOk,
    prenom: formData.get("prenom") as string,
    nom: formData.get("nom") as string,
    email: formData.get("email") as string,
    telephone: formData.get("telephone") as string || null,
    adresse: formData.get("adresse") as string || null,
    membre: formData.get("membre") === "on",
    contact_urgence_prenom: formData.get("contact_urgence_prenom") as string || null,
    contact_urgence_nom: formData.get("contact_urgence_nom") as string || null,
    contact_urgence_telephone: formData.get("contact_urgence_telephone") as string || null,
  };

  if (avant && photosOk !== avant.photos_ok) {
    updateData.photos_ok_modifie_le = new Date().toISOString();
  }

  // Champs admin uniquement : ne pas modifier si employé
  if (verif.isAdmin) {
    updateData.cotisation_exemptee = formData.get("cotisation_exemptee") === "on";
    updateData.cotisation_exemptee_raison = formData.get("cotisation_exemptee_raison") as string || null;
  }

  const { error } = await supabaseAdmin
    .from("clients")
    .update(updateData)
    .eq("id", id);

  if (error) {
    console.error(error);
    throw new Error(error.message);
  }

  redirect(`/clients/${id}`);
}
