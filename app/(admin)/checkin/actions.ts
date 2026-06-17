"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { verifierPermission } from "@/src/lib/verifierPermission";

export async function fairerCheckin(formData: FormData) {
  const verif = await verifierPermission("perm_checkin");
  if (verif.error) throw new Error(verif.error);

  const checkin_id = formData.get("checkin_id") as string;

  const { error } = await supabaseAdmin
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
  const verif = await verifierPermission("perm_checkin");
  if (verif.error) throw new Error(verif.error);

  const checkin_id = formData.get("checkin_id") as string;

  const { error } = await supabaseAdmin
    .from("checkin_checkout")
    .update({
      date_depart_reel: new Date().toISOString(),
      statut: "parti",
    })
    .eq("id", checkin_id);

  if (error) throw new Error(error.message);
  revalidatePath("/checkin");
}
