"use server";

import { revalidatePath } from "next/cache";
import { verifierPermission } from "@/src/lib/verifierPermission";
import { appliquerCheckin, appliquerCheckout } from "@/src/lib/checkinCheckout";

export async function fairerCheckin(formData: FormData) {
  const verif = await verifierPermission("perm_checkin");
  if (verif.error) throw new Error(verif.error);

  const checkin_id = formData.get("checkin_id") as string;

  const { error } = await appliquerCheckin(checkin_id);
  if (error) throw new Error(error);

  revalidatePath("/checkin");
}

export async function fairerCheckout(formData: FormData) {
  const verif = await verifierPermission("perm_checkin");
  if (verif.error) throw new Error(verif.error);

  const checkin_id = formData.get("checkin_id") as string;

  const { error } = await appliquerCheckout(checkin_id);
  if (error) throw new Error(error);

  revalidatePath("/checkin");
}
