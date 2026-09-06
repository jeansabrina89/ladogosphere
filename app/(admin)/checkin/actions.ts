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

  // Journée d'essai : le résultat est saisi par la personne qui rend le chien.
  const { error } = await appliquerCheckout(checkin_id, {
    resultat: (formData.get("resultat") as string) || null,
    note: (formData.get("note") as string) || null,
    profilId: verif.userId ?? null,
  });
  if (error) throw new Error(error);

  revalidatePath("/checkin");
}
