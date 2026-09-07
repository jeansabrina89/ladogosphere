import { supabaseAdmin } from "@/src/lib/supabase-admin";

/**
 * Années dont l'exercice comptable est ouvert, croissantes.
 * Source unique : la table `exercices` — plus aucune liste d'années en dur
 * dans les écrans ni dans les exports.
 */
export async function anneesExercicesOuverts(): Promise<number[]> {
  const { data } = await supabaseAdmin
    .from("exercices")
    .select("annee")
    .eq("statut", "ouvert")
    .order("annee");
  return (data ?? []).map((e: { annee: number }) => Number(e.annee));
}

/** Toutes les années connues (ouvertes ou clôturées), décroissantes : listes déroulantes. */
export async function anneesExercices(): Promise<number[]> {
  const { data } = await supabaseAdmin
    .from("exercices")
    .select("annee")
    .order("annee", { ascending: false });
  const annees = (data ?? []).map((e: { annee: number }) => Number(e.annee));
  // Filet : si la table est vide, on propose au moins l'année en cours.
  return annees.length > 0 ? annees : [new Date().getFullYear()];
}
