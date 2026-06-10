"use server";

import { redirect } from "next/navigation";
import { createClient } from "../../../src/utils/supabase/server";

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