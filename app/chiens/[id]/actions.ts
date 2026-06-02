"use server";

import { redirect } from "next/navigation";
import { supabase } from "../../../src/lib/supabase";

export async function archiverChien(formData: FormData) {
  const id = formData.get("id") as string;
  const actif = formData.get("actif") === "true";

  const { error } = await supabase
    .from("chiens")
    .update({ actif: !actif })
    .eq("id", id);

  if (error) throw new Error(error.message);
  redirect(`/chiens/${id}`);
}

export async function supprimerChien(formData: FormData) {
  const id = formData.get("id") as string;

  const { error } = await supabase
    .from("chiens")
    .delete()
    .eq("id", id);

  if (error) throw new Error(error.message);
  redirect("/chiens");
}