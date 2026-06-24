"use server";

import { revalidatePath } from "next/cache";
import { synchroniserComptaResa } from "@/src/lib/comptaResa";

export async function resynchroniserCompta(reservationId: string) {
  await synchroniserComptaResa(reservationId);
  revalidatePath("/comptabilite/reconciliation");
}
