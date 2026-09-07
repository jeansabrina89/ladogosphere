"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { verifierPermission } from "@/src/lib/verifierPermission";
import { calculerMontant } from "@/src/lib/calculTarif";
import { estMembreActif } from "@/src/lib/membre";
import { estPrivatifPourSelection } from "@/src/lib/cohabitation";
import { lireCohabitationChiens } from "@/src/lib/cohabitationDb";
import { getProfilePerms } from "@/src/lib/getProfilePerms";
import { factureEmisePourReservation } from "@/src/lib/factureResa";
import { recalculerTotalEtPaiement, type RecalculResult } from "@/src/lib/prixReservation";

async function verifierAdmin(): Promise<{ error?: string; userId?: string }> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté" };
  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return { error: "Accès réservé à l'admin" };
  return { userId: user.id };
}

const STATUTS_CLOTURES = ["terminee", "annulee", "refusee"];

function estCloturee(statut: string | null | undefined): boolean {
  return !!statut && STATUTS_CLOTURES.includes(statut);
}

/**
 * Une facture émise fige le prix de la réservation : la corriger, c'est créer
 * un avoir puis une nouvelle facture. Renvoie le message de refus, ou null.
 */
async function refusSiFactureEmise(reservationId: string): Promise<string | null> {
  const facture = await factureEmisePourReservation(reservationId);
  if (!facture) return null;
  return `La facture ${facture.numero} est émise : créez un avoir puis une nouvelle facture.`;
}

/**
 * Met à jour le montant calculé automatiquement (base avant ajustement manuel et extras),
 * puis recalcule le total dû et le paiement.
 */
export async function enregistrerMontantCalcule(reservationId: string, montant: number): Promise<RecalculResult> {
  const verif = await verifierPermission("perm_reservations_modifier");
  if (verif.error) return verif;

  if (!reservationId) return { error: "Réservation introuvable." };
  if (isNaN(montant) || montant < 0) return { error: "Montant invalide." };

  const { data: reservation, error: resError } = await supabaseAdmin
    .from("reservations")
    .select("statut")
    .eq("id", reservationId)
    .single();
  if (resError || !reservation) return { error: "Réservation introuvable." };
  if (estCloturee(reservation.statut)) return { error: "Réservation clôturée : modification impossible." };

  const refus = await refusSiFactureEmise(reservationId);
  if (refus) return { error: refus };

  const { error: updateError } = await supabaseAdmin
    .from("reservations")
    .update({ montant_calcule: montant })
    .eq("id", reservationId);
  if (updateError) return { error: updateError.message };

  const result = await recalculerTotalEtPaiement(reservationId, verif.userId);
  revalidatePath(`/reservations/${reservationId}`);
  return result;
}

/**
 * Recalcule montant_calcule pour une réservation 'sejour' à partir de ses
 * dates/heures actuelles (comptage par tranche horaire : nuits + éventuelle
 * garde à la journée), puis recalcule le total dû et le paiement via
 * recalculerTotalEtPaiement. Sans effet pour les types 'journee'/'essai'.
 * Le caractère privatif/partagé est dérivé de "doit_etre_isole" sur les
 * chiens (même valeur par défaut que CalculFacture), car non persisté.
 * À appeler après toute modif de date_debut, date_fin, heure_arrivee ou
 * heure_depart d'une réservation 'sejour'.
 */
export async function recalculerMontantSejour(reservationId: string): Promise<RecalculResult> {
  const verif = await verifierPermission("perm_reservations_modifier");
  if (verif.error) return verif;

  const { data: reservation, error: resError } = await supabaseAdmin
    .from("reservations")
    .select(`
      statut, type_reservation, urgence, date_debut, date_fin, heure_arrivee, heure_depart,
      client_id,
      clients (membre),
      reservation_chiens (chiens (doit_etre_isole))
    `)
    .eq("id", reservationId)
    .single();
  if (resError || !reservation) return { error: "Réservation introuvable." };
  if (reservation.type_reservation !== "sejour") return {};
  if (estCloturee(reservation.statut)) return { error: "Réservation clôturée : modification impossible." };

  const refus = await refusSiFactureEmise(reservationId);
  if (refus) return { error: refus };

  const { data: tarifs, error: tarifsError } = await supabaseAdmin
    .from("tarifs")
    .select("categorie, membre, prix")
    .eq("actif", true);
  if (tarifsError) return { error: tarifsError.message };

  const chiens = (reservation.reservation_chiens ?? []).map((rc: any) => rc.chiens).filter(Boolean);
  const nb_chiens = chiens.length;
  const chien_isole = estPrivatifPourSelection(
    await lireCohabitationChiens(chiens.map((c: any) => c.id))
  );
  const est_membre = (reservation as any).client_id ? await estMembreActif(supabaseAdmin, (reservation as any).client_id, reservation.date_debut) : false;

  const montant = calculerMontant({
    tarifs: tarifs ?? [],
    type_reservation: "sejour",
    nb_chiens,
    est_membre,
    est_urgence: !!reservation.urgence,
    est_privatif: chien_isole,
    date_debut: reservation.date_debut,
    date_fin: reservation.date_fin,
    heure_arrivee: reservation.heure_arrivee,
    heure_depart: reservation.heure_depart,
  });

  const { error: updateError } = await supabaseAdmin
    .from("reservations")
    .update({ montant_calcule: montant })
    .eq("id", reservationId);
  if (updateError) return { error: updateError.message };

  const result = await recalculerTotalEtPaiement(reservationId, verif.userId);
  revalidatePath(`/reservations/${reservationId}`);
  return result;
}

/**
 * Modifie le prix du séjour retenu : ajustement_manuel = nouveauPrixSejour - montant_calcule,
 * de sorte que montant_calcule + ajustement_manuel = nouveauPrixSejour. Puis recalcule.
 */
export async function modifierPrixSejour(reservationId: string, nouveauPrixSejour: number): Promise<RecalculResult> {
  const verif = await verifierPermission("perm_reservations_modifier");
  if (verif.error) return verif;

  if (!reservationId) return { error: "Réservation introuvable." };
  if (isNaN(nouveauPrixSejour) || nouveauPrixSejour < 0) return { error: "Montant invalide." };

  const { data: reservation, error: resError } = await supabaseAdmin
    .from("reservations")
    .select("statut, montant_calcule")
    .eq("id", reservationId)
    .single();
  if (resError || !reservation) return { error: "Réservation introuvable." };
  if (estCloturee(reservation.statut)) return { error: "Réservation clôturée : modification impossible." };

  const refus = await refusSiFactureEmise(reservationId);
  if (refus) return { error: refus };

  const montantCalcule = Number(reservation.montant_calcule) || 0;
  const ajustement_manuel = nouveauPrixSejour - montantCalcule;

  const { error: updateError } = await supabaseAdmin
    .from("reservations")
    .update({ ajustement_manuel })
    .eq("id", reservationId);
  if (updateError) return { error: updateError.message };

  const result = await recalculerTotalEtPaiement(reservationId, verif.userId);
  revalidatePath(`/reservations/${reservationId}`);
  return result;
}

/**
 * Ajoute une ligne supplémentaire (extra/remise, montant libre +/-) à la réservation, puis recalcule.
 */
export async function ajouterExtraReservation(reservationId: string, libelle: string, montant: number): Promise<RecalculResult> {
  const verif = await verifierPermission("perm_reservations_modifier");
  if (verif.error) return verif;

  if (!reservationId) return { error: "Réservation introuvable." };
  const libelleTrim = (libelle || "").trim();
  if (!libelleTrim) return { error: "Libellé requis." };
  if (isNaN(montant) || montant === 0) return { error: "Montant invalide." };

  const { data: reservation, error: resError } = await supabaseAdmin
    .from("reservations")
    .select("statut")
    .eq("id", reservationId)
    .single();
  if (resError || !reservation) return { error: "Réservation introuvable." };
  if (estCloturee(reservation.statut)) return { error: "Réservation clôturée : modification impossible." };

  const refus = await refusSiFactureEmise(reservationId);
  if (refus) return { error: refus };

  const { error: insertError } = await supabaseAdmin.from("reservation_extras").insert({
    reservation_id: reservationId,
    libelle: libelleTrim,
    montant,
  });
  if (insertError) return { error: insertError.message };

  const result = await recalculerTotalEtPaiement(reservationId, verif.userId);
  revalidatePath(`/reservations/${reservationId}`);
  return result;
}

/**
 * Supprime une ligne supplémentaire et recalcule le total et le paiement de sa réservation.
 */
export async function supprimerExtraReservation(extraId: string): Promise<RecalculResult> {
  const verif = await verifierPermission("perm_reservations_modifier");
  if (verif.error) return verif;

  if (!extraId) return { error: "Ligne introuvable." };

  const { data: extra, error: extraError } = await supabaseAdmin
    .from("reservation_extras")
    .select("reservation_id")
    .eq("id", extraId)
    .single();
  if (extraError || !extra) return { error: "Ligne introuvable." };

  const { data: reservation, error: resError } = await supabaseAdmin
    .from("reservations")
    .select("statut")
    .eq("id", extra.reservation_id)
    .single();
  if (resError || !reservation) return { error: "Réservation introuvable." };
  if (estCloturee(reservation.statut)) return { error: "Réservation clôturée : modification impossible." };

  const refus = await refusSiFactureEmise(extra.reservation_id);
  if (refus) return { error: refus };

  const { error: deleteError } = await supabaseAdmin
    .from("reservation_extras")
    .delete()
    .eq("id", extraId);
  if (deleteError) return { error: deleteError.message };

  const result = await recalculerTotalEtPaiement(extra.reservation_id, verif.userId);
  revalidatePath(`/reservations/${extra.reservation_id}`);
  return result;
}

export async function basculerOffreReservation(reservationId: string, offrir: boolean): Promise<RecalculResult> {
  const perms = await getProfilePerms();
  if (!perms.isAdmin) return { error: "Action reservee aux administrateurs." };
  const { error } = await supabaseAdmin
    .from("reservations")
    .update({ offerte: offrir })
    .eq("id", reservationId);
  if (error) return { error: error.message };
  const result = await recalculerTotalEtPaiement(reservationId);
  revalidatePath(`/reservations/${reservationId}`);
  return result;
}

export async function supprimerReservationDefinitivement(formData: FormData): Promise<{ error?: string }> {
  const verif = await verifierAdmin();
  if (verif.error) return verif;

  const id = formData.get("id") as string;
  if (!id) return { error: "Réservation introuvable." };

  // ── 1. Charger la réservation ─────────────────────────────────────────────
  const { data: reservation, error: resError } = await supabaseAdmin
    .from("reservations")
    .select("id, statut, montant_paye, statut_paiement")
    .eq("id", id)
    .single();
  if (resError || !reservation) return { error: "Réservation introuvable." };

  // ── 2. Gardes métier (fail-closed) ────────────────────────────────────────
  if (reservation.statut !== "annulee") {
    return { error: "Seule une réservation annulée peut être supprimée." };
  }
  if (Number(reservation.montant_paye) > 0 || reservation.statut_paiement !== "impaye") {
    return { error: "Un paiement est rattaché à cette réservation : impossible de supprimer." };
  }

  // Le lien facture ↔ réservation passe par facture_reservations : `factures.reservation_id`
  // est toujours nul pour une facture groupée, la garde ne voyait donc rien.
  const { data: lignesFacture, error: factureErr } = await supabaseAdmin
    .from("facture_reservations")
    .select("facture_annulee")
    .eq("reservation_id", id);
  if (factureErr) return { error: factureErr.message };
  if ((lignesFacture ?? []).some((l) => l.facture_annulee === false)) {
    return { error: "Une facture est liée à cette réservation : impossible de supprimer." };
  }
  if ((lignesFacture ?? []).length > 0) {
    return { error: "Une facture annulée référence encore cette réservation : elle doit rester traçable, la suppression est impossible." };
  }

  const { count: paiementsCount, error: paiementErr } = await supabaseAdmin
    .from("paiements_resa").select("id", { count: "exact", head: true }).eq("reservation_id", id);
  if (paiementErr) return { error: paiementErr.message };
  if ((paiementsCount ?? 0) > 0) return { error: "Le journal des paiements contient des mouvements pour cette réservation : impossible de supprimer." };

  const { count: avoirsCount, error: avoirErr } = await supabaseAdmin
    .from("avoirs_mouvements").select("id", { count: "exact", head: true }).eq("reservation_id", id);
  if (avoirErr) return { error: avoirErr.message };
  if ((avoirsCount ?? 0) > 0) return { error: "Un avoir est lié à cette réservation : impossible de supprimer." };

  const { count: cotisationsCount, error: cotisationErr } = await supabaseAdmin
    .from("cotisations_membres").select("id", { count: "exact", head: true }).eq("reservation_id", id);
  if (cotisationErr) return { error: cotisationErr.message };
  if ((cotisationsCount ?? 0) > 0) return { error: "Une adhésion est liée à cette réservation : impossible de supprimer." };

  // ── 3. Suppression dans l'ordre (lignes liées avant la réservation) ───────
  const { error: e1 } = await supabaseAdmin.from("reservation_extras").delete().eq("reservation_id", id);
  if (e1) return { error: `Erreur suppression extras : ${e1.message}` };

  const { error: e2 } = await supabaseAdmin.from("reservation_chiens").delete().eq("reservation_id", id);
  if (e2) return { error: `Erreur suppression chiens : ${e2.message}` };

  const { error: e3 } = await supabaseAdmin.from("occupation_boxes").delete().eq("reservation_id", id);
  if (e3) return { error: `Erreur suppression occupation : ${e3.message}` };

  const { error: e4 } = await supabaseAdmin.from("checkin_checkout").delete().eq("reservation_id", id);
  if (e4) return { error: `Erreur suppression checkin : ${e4.message}` };

  const { error: e5 } = await supabaseAdmin.from("reservations").delete().eq("id", id);
  if (e5) return { error: `Erreur suppression réservation : ${e5.message}` };

  revalidatePath("/reservations");
  redirect("/reservations");
}
