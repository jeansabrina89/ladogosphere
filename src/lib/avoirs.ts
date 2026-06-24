import type { SupabaseClient } from "@supabase/supabase-js";

export type MouvementAvoir = {
  id: string;
  montant: number;
  type: string;
  motif: string | null;
  created_at: string;
  // Champs optionnels : présents dans getMouvementsAvoir, absents dans getMouvementsAvoirReservation
  reservation_id?: string | null;
  reservations?: { numero: number | null } | null;
};

export async function getMouvementsAvoir(
  supabase: SupabaseClient,
  client_id: string
): Promise<MouvementAvoir[]> {
  const { data, error } = await supabase
    .from("avoirs_mouvements")
    .select("id, montant, type, motif, created_at, reservation_id, reservations(numero)")
    .eq("client_id", client_id)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  // Supabase infers the FK join as an array; we know it's a single object or null at runtime
  return (data ?? []).map((m) => ({ ...m, montant: Number(m.montant) })) as unknown as MouvementAvoir[];
}

export function calculerSoldeAvoir(mouvements: { montant: number }[]): number {
  return mouvements.reduce((somme, m) => somme + Number(m.montant), 0);
}

export async function getSoldeAvoir(
  supabase: SupabaseClient,
  client_id: string
): Promise<number> {
  const mouvements = await getMouvementsAvoir(supabase, client_id);
  return calculerSoldeAvoir(mouvements);
}

export async function getMouvementsAvoirReservation(
  supabase: SupabaseClient,
  client_id: string,
  reservation_id: string
): Promise<MouvementAvoir[]> {
  const { data, error } = await supabase
    .from("avoirs_mouvements")
    .select("id, montant, type, motif, created_at")
    .eq("client_id", client_id)
    .eq("reservation_id", reservation_id)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((m) => ({ ...m, montant: Number(m.montant) }));
}

/**
 * Retourne le montant d'avoir NET actuellement appliqué sur une réservation.
 * = -(SUM(montant) des lignes type IN ('utilisation','annulation_paiement') liées à cette résa).
 * Positif = avoir consommé ; 0 si rien ou si tout a été repris.
 */
export async function getAvoirAppliqueReservation(
  supabase: SupabaseClient,
  client_id: string,
  reservation_id: string
): Promise<number> {
  const { data, error } = await supabase
    .from("avoirs_mouvements")
    .select("montant")
    .eq("client_id", client_id)
    .eq("reservation_id", reservation_id)
    .in("type", ["utilisation", "annulation_paiement"]);

  if (error) throw new Error(error.message);

  const somme = (data ?? []).reduce((s, m) => s + Number(m.montant), 0);
  return Math.round(-somme * 100) / 100;
}
