"use server";

import { revalidatePath } from "next/cache";
import { supabase } from "../../src/lib/supabase";

export async function fairerCheckin(formData: FormData) {
  const checkin_id = formData.get("checkin_id") as string;

  const { error } = await supabase
    .from("checkin_checkout")
    .update({
      date_arrivee_reelle: new Date().toISOString(),
      statut: "arrive",
    })
    .eq("id", checkin_id);

  if (error) throw new Error(error.message);
  revalidatePath("/checkin");
}

export async function fairerCheckout(formData: FormData) {
  const checkin_id = formData.get("checkin_id") as string;

  const { error } = await supabase
    .from("checkin_checkout")
    .update({
      date_depart_reel: new Date().toISOString(),
      statut: "parti",
    })
    .eq("id", checkin_id);

  if (error) throw new Error(error.message);
  revalidatePath("/checkin");
}