import { supabaseAdmin } from "@/src/lib/supabase-admin";

/**
 * Réservations de fiches INTERNES que l'admin n'a pas encore vues.
 * Même mécanisme que les badges Adhésions / Abonnements.
 */
export async function compterReservationsPersonnelAVoir(): Promise<number> {
  const { data: fiches } = await supabaseAdmin
    .from("clients")
    .select("id")
    .eq("interne", true);
  const ids = (fiches ?? []).map((f) => f.id as string);
  if (ids.length === 0) return 0;

  const { count } = await supabaseAdmin
    .from("reservations")
    .select("id", { count: "exact", head: true })
    .in("client_id", ids)
    .is("vue_admin_le", null)
    .neq("statut", "annulee");

  return count ?? 0;
}

/** Identifiants des fiches internes (pour filtrer une liste de réservations). */
export async function idsFichesInternes(): Promise<string[]> {
  const { data } = await supabaseAdmin.from("clients").select("id").eq("interne", true);
  return (data ?? []).map((f) => f.id as string);
}
