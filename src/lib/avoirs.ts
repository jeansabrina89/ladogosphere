import type { SupabaseClient } from "@supabase/supabase-js";

export type MouvementAvoir = {
  id: string;
  montant: number;
  type: string;
  motif: string | null;
  created_at: string;
};

export async function getMouvementsAvoir(
  supabase: SupabaseClient,
  client_id: string
): Promise<MouvementAvoir[]> {
  const { data, error } = await supabase
    .from("avoirs_mouvements")
    .select("id, montant, type, motif, created_at")
    .eq("client_id", client_id)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((m) => ({ ...m, montant: Number(m.montant) }));
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
