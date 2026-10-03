import { supabaseAdmin } from "@/src/lib/supabase-admin";

/**
 * Réservations de fiches INTERNES que l'admin n'a pas encore vues.
 * Même mécanisme que les badges Adhésions / Abonnements.
 *
 * APP 73 — UNE lecture, la fiche interne filtrée par jointure. Elle en faisait
 * deux, la seconde attendant la première : servie maintenant dans
 * « Aujourd'hui », elle y aurait remis une étape d'attente (APP 70). Le résultat
 * est le même : les réservations non annulées, pas encore vues, d'une fiche
 * marquée interne.
 */
export async function compterReservationsPersonnelAVoir(): Promise<number> {
  const { count } = await supabaseAdmin
    .from("reservations")
    .select("id, clients!inner(interne)", { count: "exact", head: true })
    .eq("clients.interne", true)
    .is("vue_admin_le", null)
    .neq("statut", "annulee");

  return count ?? 0;
}

/** Identifiants des fiches internes (pour filtrer une liste de réservations). */
export async function idsFichesInternes(): Promise<string[]> {
  const { data } = await supabaseAdmin.from("clients").select("id").eq("interne", true);
  return (data ?? []).map((f) => f.id as string);
}
