"use server";

import { supabaseAdmin } from "../../../src/lib/supabase-admin";
import { createClient } from "../../../src/utils/supabase/server";
import { verifierPermission } from "../../../src/lib/verifierPermission";
import { revalidatePath } from "next/cache";

export type LignePlanningExport = {
  employe_id: string;
  nom_complet: string;
  date: string;
  statut: string;
};

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

export async function recupererPlanningMois(
  mois: number,
  annee: number,
): Promise<{ error?: string; lignes?: LignePlanningExport[] }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté" };

  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (!["admin", "employe"].includes(profile?.role ?? ""))
    return { error: "Accès réservé au personnel" };

  const debut = `${annee}-${String(mois).padStart(2, "0")}-01`;
  const fin = new Date(annee, mois, 0).toISOString().split("T")[0];

  const [{ data: rows, error: errRows }, { data: employes, error: errEmps }] = await Promise.all([
    supabaseAdmin
      .from("planning_employes")
      .select("employe_id, date, statut")
      .gte("date", debut)
      .lte("date", fin),
    supabaseAdmin
      .from("employes_rh")
      .select("id, nom, prenom")
      .eq("actif", true),
  ]);

  if (errRows) return { error: errRows.message };
  if (errEmps) return { error: errEmps.message };

  const nomParId: Record<string, string> = {};
  employes?.forEach((e: { id: string; nom: string; prenom: string }) => {
    nomParId[e.id] = `${e.prenom} ${e.nom}`;
  });

  const lignes: LignePlanningExport[] = (rows ?? []).map((r: { employe_id: string; date: string; statut: string }) => ({
    employe_id: r.employe_id,
    nom_complet: nomParId[r.employe_id] ?? "—",
    date: r.date,
    statut: r.statut,
  }));

  return { lignes };
}
