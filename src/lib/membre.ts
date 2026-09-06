import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Message unique renvoyé côté serveur ET affiché côté UI quand l'adhésion
 * est requise pour réserver. (Le montant reste géré via parametres.cotisation_montant ;
 * ce libellé de blocage cite la valeur courante de 200.-.)
 */
export const MESSAGE_ADHESION_REQUISE =
  "Adhésion requise : la cotisation annuelle (200.-) doit être réglée avant de pouvoir réserver.";

/**
 * Règle métier (pure, testable) : un client peut créer une réservation si et
 * seulement s'il est membre à jour, OU exempté de cotisation, OU s'il s'agit
 * d'une journée d'essai.
 */
export function reservationAutorisee({
  estMembre,
  estExempte,
  typeReservation,
}: {
  estMembre: boolean;
  estExempte: boolean;
  typeReservation: string;
}): boolean {
  return typeReservation === "essai" || estMembre || estExempte;
}

/**
 * Date de référence d'une vérification d'adhésion : la date de prestation
 * fournie, sinon aujourd'hui. Format "YYYY-MM-DD".
 */
function dateReference(dateRefISO?: string): string {
  return (dateRefISO ?? new Date().toISOString()).slice(0, 10);
}

/**
 * Statut membre "à jour" pour la tarification, à une date de prestation donnée.
 * Une cotisation payée couvre la date D si date_debut <= D <= date_fin
 * (validité 12 mois glissants, cf. src/lib/cotisationPeriode.ts).
 */
export async function estMembreActif(
  supabase: SupabaseClient,
  client_id: string | null | undefined,
  dateRefISO?: string
): Promise<boolean> {
  if (!client_id) return false;
  const d = dateReference(dateRefISO);
  const { data } = await supabase
    .from("cotisations_membres")
    .select("id")
    .eq("client_id", client_id)
    .eq("statut", "payee")
    .lte("date_debut", d)
    .gte("date_fin", d)
    .limit(1);
  return !!(data && data.length > 0);
}

/**
 * Une cotisation donne-t-elle le DROIT de réserver une pension ?
 * « À jour » = 'payee', OU 'en_attente' AVEC mode 'prochaine_resa'
 * (adhésion groupée à une réservation / activation admin immédiate — en cours
 * d'encaissement légitime). Une demande 'en_attente' par 'virement' ou 'cash'
 * NON encaissée ne donne PAS accès.
 */
export function cotisationDonneAccesReservation(
  c: { statut?: string | null; mode_paiement?: string | null }
): boolean {
  if (c.statut === "payee") return true;
  return c.statut === "en_attente" && c.mode_paiement === "prochaine_resa";
}

/**
 * État d'adhésion pour le DROIT à réserver une pension, à une date donnée.
 * - aJour : au moins une cotisation couvrant la date donne accès (cf. règle ci-dessus).
 * - enAttenteARegler : pas à jour, MAIS une demande 'en_attente' non réglée
 *   existe (virement/cash) → à régler pour pouvoir réserver.
 * DIFFÉRENT de estMembreActif (payee seul) : ne PAS utiliser pour l'achat
 * d'abonnement / la tarification.
 */
export async function etatAdhesionReservation(
  supabase: SupabaseClient,
  client_id: string | null | undefined,
  dateRefISO?: string
): Promise<{ aJour: boolean; enAttenteARegler: boolean }> {
  if (!client_id) return { aJour: false, enAttenteARegler: false };
  const d = dateReference(dateRefISO);
  const { data } = await supabase
    .from("cotisations_membres")
    .select("statut, mode_paiement")
    .eq("client_id", client_id)
    .lte("date_debut", d)
    .gte("date_fin", d);
  const rows = (data ?? []) as { statut?: string | null; mode_paiement?: string | null }[];
  const aJour = rows.some(cotisationDonneAccesReservation);
  const enAttenteARegler =
    !aJour && rows.some((r) => r.statut === "en_attente" && r.mode_paiement !== "prochaine_resa");
  return { aJour, enAttenteARegler };
}

/**
 * Statut « membre à jour » pour le DROIT à réserver une pension.
 * S'appuie sur cotisationDonneAccesReservation (payee, ou en_attente+prochaine_resa).
 */
export async function estMembreAJourReservation(
  supabase: SupabaseClient,
  client_id: string | null | undefined,
  dateRefISO?: string
): Promise<boolean> {
  return (await etatAdhesionReservation(supabase, client_id, dateRefISO)).aJour;
}

/**
 * Version groupée : retourne l'ensemble des client_id qui ont une cotisation
 * à jour à la date de référence, en une seule requête (pour les listes).
 */
export async function clientsMembresAJour(
  supabase: SupabaseClient,
  clientIds: (string | null | undefined)[],
  dateRefISO?: string
): Promise<Set<string>> {
  const ids = [...new Set(clientIds.filter(Boolean) as string[])];
  if (ids.length === 0) return new Set();
  const d = dateReference(dateRefISO);
  const { data } = await supabase
    .from("cotisations_membres")
    .select("client_id")
    .in("client_id", ids)
    .eq("statut", "payee")
    .lte("date_debut", d)
    .gte("date_fin", d);
  return new Set(((data ?? []) as { client_id: string }[]).map((r) => r.client_id));
}
