"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { verifierPermission } from "@/src/lib/verifierPermission";
import { idsFichesInternes } from "@/src/lib/reservationsPersonnelAdmin";

/**
 * Marque comme vues toutes les réservations du personnel encore signalées.
 * C'est ce qui fait retomber le badge « Personnel » de la barre latérale.
 */
export async function marquerReservationsPersonnelVues(): Promise<{ error?: string }> {
  const verif = await verifierPermission("perm_reservations_modifier");
  if (verif.error) return { error: verif.error };

  const ids = await idsFichesInternes();
  if (ids.length === 0) return {};

  const { error } = await supabaseAdmin
    .from("reservations")
    .update({ vue_admin_le: new Date().toISOString() })
    .in("client_id", ids)
    .is("vue_admin_le", null);

  if (error) return { error: error.message };

  revalidatePath("/reservations");
  revalidatePath("/");
  return {};
}
