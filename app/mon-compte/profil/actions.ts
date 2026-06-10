"use server";

import { redirect } from "next/navigation";
import { createClient } from "../../../src/utils/supabase/server";

export async function modifierProfil(id: string, formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("clients")
    .update({
      prenom: formData.get("prenom") as string,
      nom: formData.get("nom") as string,
      telephone: formData.get("telephone") as string || null,
      adresse: formData.get("adresse") as string || null,
      contact_urgence_prenom: formData.get("contact_urgence_prenom") as string || null,
      contact_urgence_nom: formData.get("contact_urgence_nom") as string || null,
      contact_urgence_telephone: formData.get("contact_urgence_telephone") as string || null,
    })
    .eq("id", id);

  if (error) throw new Error(error.message);
  redirect("/mon-compte");
}