import { supabaseAdmin } from "@/src/lib/supabase-admin";

const r2 = (n: number) => Math.round(n * 100) / 100;

export function calculerSolde(mouvements: { delta: number | string }[]): number {
  return r2(mouvements.reduce((s, m) => s + Number(m.delta), 0));
}

export type AbonnementClient = {
  id: string;
  categorie: string | null;
  statut: string;
  jours_total: number;
  prix_paye: number | null;
  tarif_unitaire: number | null;
  mode_paiement: string | null;
  date_paiement: string | null;
  date_expiration: string | null;
  jours_restants: number;
};

export async function getAbonnementsClient(clientId: string): Promise<AbonnementClient[]> {
  const { data } = await supabaseAdmin
    .from("abonnements")
    .select(
      "id, categorie, statut, jours_total, prix_paye, tarif_unitaire, mode_paiement, date_paiement, date_expiration, abonnements_mouvements(delta)"
    )
    .eq("client_id", clientId)
    .neq("statut", "annule");

  return (data ?? []).map((abo: any) => ({
    id: abo.id,
    categorie: abo.categorie,
    statut: abo.statut,
    jours_total: abo.jours_total ?? 0,
    prix_paye: abo.prix_paye,
    tarif_unitaire: abo.tarif_unitaire,
    mode_paiement: abo.mode_paiement,
    date_paiement: abo.date_paiement,
    date_expiration: abo.date_expiration,
    jours_restants: calculerSolde((abo.abonnements_mouvements ?? []) as { delta: number | string }[]),
  }));
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
