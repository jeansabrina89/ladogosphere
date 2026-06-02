"use server";

import { redirect } from "next/navigation";
import { supabase } from "../../../../src/lib/supabase";

export async function modifierClient(
  id: string,
  formData: FormData
) {
  const { error } = await supabase
    .from("clients")
    .update({
      prenom: formData.get("prenom") as string,
      nom: formData.get("nom") as string,
      email: formData.get("email") as string,
      telephone: formData.get("telephone") as string || null,
      adresse: formData.get("adresse") as string || null,
      membre: formData.get("membre") === "on",
    })
    .eq("id", id);

  if (error) {
    console.error(error);
    throw new Error(error.message);
  }

  redirect(`/clients/${id}`);
}