"use server";

import { supabaseAdmin } from "../../../src/lib/supabase-admin";
import { verifierPermission } from "../../../src/lib/verifierPermission";
import { revalidatePath } from "next/cache";

type JourPlanning = {
  employe_id: string;
  date: string;
  statut: string;
  note?: string;
};

export async function sauvegarderPlanning(lignes: JourPlanning[]): Promise<{ error?: string }> {
  const verif = await verifierPermission("perm_planning");
  if (verif.error) return verif;

  if (!lignes.length) return {};

  const { error } = await supabaseAdmin
    .from("planning_employes")
    .upsert(
      lignes.map(l => ({
        employe_id: l.employe_id,
        date: l.date,
        statut: l.statut,
        note: l.note ?? null,
      })),
      { onConflict: "employe_id,date" }
    );

  if (error) return { error: error.message };

  revalidatePath("/employes/planning");
  return {};
}
