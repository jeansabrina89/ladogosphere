import { supabaseAdmin } from "@/src/lib/supabase-admin";

const r2 = (n: number) => Math.round(n * 100) / 100;

export function calculerSolde(mouvements: { delta: number | string }[]): number {
  return r2(mouvements.reduce((s, m) => s + Number(m.delta), 0));
}

export async function soldeJourneesClient(clientId: string): Promise<number> {
  const today = new Date().toISOString().split("T")[0];

  const { data: abonnements } = await supabaseAdmin
    .from("abonnements")
    .select("id")
    .eq("client_id", clientId)
    .neq("statut", "annule")
    .or(`date_expiration.is.null,date_expiration.gte.${today}`);

  if (!abonnements || abonnements.length === 0) return 0;

  const ids = (abonnements as { id: string }[]).map((a) => a.id);
  const { data: mouvements } = await supabaseAdmin
    .from("abonnements_mouvements")
    .select("delta")
    .in("abonnement_id", ids);

  return calculerSolde((mouvements ?? []) as { delta: number | string }[]);
}
