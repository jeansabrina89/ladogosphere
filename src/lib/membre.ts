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

export function anneesPertinentes(dateRefISO?: string): number[] {
  const ref = (dateRefISO ?? new Date().toISOString()).slice(0, 10);
  const [annee, mois] = ref.split("-").map(Number);
  if (!annee) return [];
  const dansGrace = mois === 1 || mois === 2;
  return dansGrace ? [annee, annee - 1] : [annee];
}

/**
 * Statut membre "à jour" pour la tarification, à une date de prestation donnée.
 * Cotisation payée pour l'année de la prestation, OU grâce janvier-février
 * avec cotisation payée l'année précédente.
 */
export async function estMembreActif(
  supabase: SupabaseClient,
  client_id: string | null | undefined,
  dateRefISO?: string
): Promise<boolean> {
  if (!client_id) return false;
  const annees = anneesPertinentes(dateRefISO);
  if (annees.length === 0) return false;
  const { data } = await supabase
    .from("cotisations_membres")
    .select("annee")
    .eq("client_id", client_id)
    .eq("statut", "payee")
    .in("annee", annees)
    .limit(1);
  return !!(data && data.length > 0);
}

/**
 * Statut « membre à jour » pour le DROIT à réserver une pension.
 * DIFFÉRENT de estMembreActif : ici une cotisation 'en_attente' compte AUSSI
 * (une adhésion demandée mais pas encore encaissée donne accès).
 * Ne PAS utiliser pour l'achat d'abonnement / la tarification (garder estMembreActif).
 */
export async function estMembreAJourReservation(
  supabase: SupabaseClient,
  client_id: string | null | undefined,
  dateRefISO?: string
): Promise<boolean> {
  if (!client_id) return false;
  const annees = anneesPertinentes(dateRefISO);
  if (annees.length === 0) return false;
  const { data } = await supabase
    .from("cotisations_membres")
    .select("annee")
    .eq("client_id", client_id)
    .in("statut", ["payee", "en_attente"])
    .in("annee", annees)
    .limit(1);
  return !!(data && data.length > 0);
}

/**
 * Version groupée : retourne l'ensemble des client_id qui ont une cotisation
 * à jour, en une seule requête (pour les listes).
 */
export async function clientsMembresAJour(
  supabase: SupabaseClient,
  clientIds: (string | null | undefined)[],
  dateRefISO?: string
): Promise<Set<string>> {
  const ids = [...new Set(clientIds.filter(Boolean) as string[])];
  if (ids.length === 0) return new Set();
  const annees = anneesPertinentes(dateRefISO);
  if (annees.length === 0) return new Set();
  const { data } = await supabase
    .from("cotisations_membres")
    .select("client_id")
    .in("client_id", ids)
    .eq("statut", "payee")
    .in("annee", annees);
  return new Set((data ?? []).map((r: any) => r.client_id as string));
}
