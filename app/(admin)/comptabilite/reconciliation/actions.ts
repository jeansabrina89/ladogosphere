"use server";

import { revalidatePath } from "next/cache";
import { synchroniserComptaResa } from "@/src/lib/comptaResa";
import { verifierAdmin } from "@/src/lib/permissions";

// Resynchroniser réécrit le grand livre d'une réservation : réservé à l'admin.
// La page est déjà protégée, mais l'action est un point d'entrée à part entière.
export async function resynchroniserCompta(reservationId: string): Promise<void> {
  const { error, userId } = await verifierAdmin();
  if (error) throw new Error(error);

  await synchroniserComptaResa(reservationId, undefined, userId ?? null);
  revalidatePath("/comptabilite/reconciliation");
}
