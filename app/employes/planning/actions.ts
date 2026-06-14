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

// Valeurs acceptées par la contrainte planning_employes_statut_check
const DB_STATUTS_VALIDES = new Set([
  "travail", "repos", "vacances", "maladie", "accident", "militaire", "ferie", "autre",
]);

// Mapping UI val → DB val (pour les valeurs UI qui diffèrent de la clé DB)
const UI_VERS_DB: Record<string, string> = {
  absent:          "autre",
  ferie_travaille: "ferie",
  heures_sup:      "autre",
};

function toDbStatut(s: string): string {
  if (DB_STATUTS_VALIDES.has(s)) return s;
  return UI_VERS_DB[s] ?? "autre";
}

export async function sauvegarderPlanning(lignes: JourPlanning[]): Promise<{ error?: string }> {
  const verif = await verifierPermission("perm_planning");
  if (verif.error) return verif;

  const lignesSanitizees = lignes
    .filter(l => l.employe_id && l.date && l.statut)
    .map(l => ({
      employe_id: l.employe_id,
      date: l.date,
      statut: toDbStatut(l.statut),
      note: l.note ?? null,
    }));

  if (!lignesSanitizees.length) return {};

  const { error } = await supabaseAdmin
    .from("planning_employes")
    .upsert(lignesSanitizees, { onConflict: "employe_id,date" });

  if (error) return { error: error.message };

  revalidatePath("/employes/planning");
  return {};
}
