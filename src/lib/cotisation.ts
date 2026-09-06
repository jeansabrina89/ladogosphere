import type { SupabaseClient } from "@supabase/supabase-js";

export type EtatAdhesion = "payee" | "en_attente" | "aucune";

/**
 * Ligne de cotisation telle que lue par les helpers ci-dessous.
 * `annee` est dérivée de date_debut (trigger SQL) — historique / comptabilité.
 */
export type LigneCotisation = {
  id: string;
  client_id: string;
  annee: number;
  montant: number | string;
  mode_paiement: string | null;
  statut: string | null;
  date_paiement: string | null;
  date_debut: string;
  date_fin: string;
  reservation_id: string | null;
  created_at?: string | null;
};

const CHAMPS =
  "id, client_id, annee, montant, mode_paiement, statut, date_paiement, date_debut, date_fin, reservation_id, created_at";

/**
 * État de l'adhésion courante, pour l'affichage admin :
 * - "payee"      → verrouillé (✅), rien à faire ;
 * - "en_attente" → une cotisation existe mais n'est pas réglée → à ENCAISSER / corriger ;
 * - "aucune"     → aucune cotisation → à enregistrer.
 *
 * Règle : SEUL le statut 'payee' verrouille l'affichage. Tout autre statut sur
 * une ligne existante est traité comme « en attente » (donc encaissable).
 */
export function etatAdhesion(
  cotisation?: { statut?: string | null } | null
): EtatAdhesion {
  if (!cotisation) return "aucune";
  return cotisation.statut === "payee" ? "payee" : "en_attente";
}

/**
 * Cotisation PAYÉE couvrant la date D (aujourd'hui par défaut), ou null.
 * Remplace l'ancienne recherche « la ligne de l'année en cours » : la validité
 * est désormais portée par la période [date_debut, date_fin].
 * S'il y en a plusieurs (renouvellements enchaînés), renvoie celle qui finit le
 * plus tard — c'est elle qui détermine « membre jusqu'au … ».
 */
export async function cotisationActive(
  supabase: SupabaseClient,
  client_id: string | null | undefined,
  dateRefISO?: string
): Promise<LigneCotisation | null> {
  if (!client_id) return null;
  const d = (dateRefISO ?? new Date().toISOString()).slice(0, 10);
  const { data } = await supabase
    .from("cotisations_membres")
    .select(CHAMPS)
    .eq("client_id", client_id)
    .eq("statut", "payee")
    .lte("date_debut", d)
    .gte("date_fin", d)
    .order("date_fin", { ascending: false })
    .limit(1);
  return ((data ?? [])[0] as LigneCotisation | undefined) ?? null;
}

/**
 * Demande d'adhésion 'en_attente' du client, ou null.
 * La base garantit qu'il y en a AU PLUS UNE
 * (index unique partiel cotisations_membres_une_en_attente_par_client).
 */
export async function cotisationEnAttente(
  supabase: SupabaseClient,
  client_id: string | null | undefined
): Promise<LigneCotisation | null> {
  if (!client_id) return null;
  const { data } = await supabase
    .from("cotisations_membres")
    .select(CHAMPS)
    .eq("client_id", client_id)
    .eq("statut", "en_attente")
    .limit(1);
  return ((data ?? [])[0] as LigneCotisation | undefined) ?? null;
}
