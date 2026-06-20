import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Statut membre "à jour" pour la tarification, à une date de prestation donnée.
 * Règle : cotisation payée pour l'année de la prestation, OU délai de grâce
 * (janvier-février) avec cotisation payée l'année précédente.
 * dateRefISO : date de la prestation "YYYY-MM-DD" (défaut : aujourd'hui).
 */
export async function estMembreActif(
  supabase: SupabaseClient,
  client_id: string | null | undefined,
  dateRefISO?: string
): Promise<boolean> {
  if (!client_id) return false;
  const ref = (dateRefISO ?? new Date().toISOString()).slice(0, 10);
  const [annee, mois] = ref.split("-").map(Number);
  if (!annee) return false;
  const dansGrace = mois === 1 || mois === 2;
  const annees = dansGrace ? [annee, annee - 1] : [annee];
  const { data } = await supabase
    .from("cotisations_membres")
    .select("annee")
    .eq("client_id", client_id)
    .eq("statut", "payee")
    .in("annee", annees)
    .limit(1);
  return !!(data && data.length > 0);
}
