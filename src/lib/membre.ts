import type { SupabaseClient } from "@supabase/supabase-js";
import { formatJJMMAAAA } from "@/src/lib/cotisationPeriode";
import { formatPrixClient } from "@/src/lib/prixClient";

/**
 * Message unique renvoyé côté serveur ET affiché côté UI quand l'adhésion est
 * requise pour réserver.
 *
 * ── LE MONTANT VIENT DU RÉGLAGE (APP 59) ──────────────────────────────────
 *
 * Il citait « 200.- » en dur, et dans un format qui n'est celui de nulle part
 * ailleurs : le reste de l'application écrit « 200.– ». Le jour où la
 * cotisation changerait, ce message aurait annoncé l'ancien prix à quelqu'un
 * à qui l'on demande de payer le nouveau.
 *
 * La constante reste exportée pour les appels qui n'ont pas de montant sous la
 * main ; elle porte alors la valeur de repli, celle de `cotisation_montant`
 * par défaut.
 */
export function messageAdhesionRequise(montant: number): string {
  return `Adhésion requise : l'adhésion annuelle (${formatPrixClient(montant)})`
    + " doit être réglée avant de pouvoir réserver.";
}

/** Le même message, au montant de repli. */
export const MESSAGE_ADHESION_REQUISE = messageAdhesionRequise(200);

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

/**
 * APP 57 — la ligne d'adhésion affichée sur la fiche de modification.
 *
 * ── POURQUOI UNE LIGNE, ET PLUS UNE CASE ──────────────────────────────────
 *
 * L'équipe voyait une case « ⭐ Membre » et pouvait la cocher (décision de
 * Sabrina, 29.09.2026 : elle ne le peut plus). Le statut se met à jour tout
 * seul à l'encaissement de l'adhésion. Une case cochée à la main créait un
 * membre SANS cotisation : la fiche affichait « membre », aucune période ne
 * le justifiait, et l'écart ne se voyait qu'en cherchant pourquoi un
 * renouvellement n'était jamais réclamé.
 *
 * La fonction est PURE : elle ne décide rien, elle met en phrase ce que la
 * fiche client a déjà calculé. Le calcul, lui, reste unique — `cotisationActive`,
 * la même que la fiche.
 *
 * L'ordre compte : une adhésion payée passe AVANT l'exemption, parce qu'elle
 * porte une date. Dire « exempté » à quelqu'un qui a payé lui cacherait
 * jusqu'à quand il est couvert.
 */
export function ligneAdhesionFiche({
  finAdhesion,
  exempte,
}: {
  /** `date_fin` de la cotisation payée valable aujourd'hui, ou null. */
  finAdhesion: string | null | undefined;
  exempte: boolean;
}): { membre: boolean; texte: string } {
  if (finAdhesion) {
    return {
      membre: true,
      texte: `⭐ Membre — adhésion valable jusqu'au ${formatJJMMAAAA(finAdhesion)}`,
    };
  }
  if (exempte) {
    return { membre: true, texte: "⭐ Membre — exempté d'adhésion" };
  }
  return {
    membre: false,
    texte: "Pas d'adhésion en cours — à encaisser depuis la fiche client.",
  };
}

/**
 * Le montant de l'adhésion réglé dans `parametres`, ou 200 à défaut.
 *
 * Une lecture qui échoue rend le repli plutôt qu'une erreur : le message
 * d'adhésion requise sert à REFUSER une réservation, et un refus qui ne
 * s'affiche pas laisserait passer ce qu'il devait arrêter.
 */
export async function lireMontantCotisation(supabase: SupabaseClient): Promise<number> {
  try {
    const { data } = await supabase
      .from("parametres").select("valeur").eq("cle", "cotisation_montant").maybeSingle();
    const n = parseFloat(String(data?.valeur ?? ""));
    return Number.isFinite(n) && n > 0 ? n : 200;
  } catch {
    return 200;
  }
}
