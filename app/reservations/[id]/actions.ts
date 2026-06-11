"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "../../../src/lib/supabase-server";
import { supabaseAdmin } from "../../../src/lib/supabase-admin";
import { getSoldeAvoir } from "../../../src/lib/avoirs";
import type { EcartType } from "../../../src/lib/facturation";
import { calculerMontant } from "../../../src/lib/calculTarif";

async function verifierAdmin(): Promise<{ error?: string; userId?: string }> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté" };
  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return { error: "Accès réservé à l'admin" };
  return { userId: user.id };
}

function calculerStatut(montantPaye: number, total: number): string {
  if (montantPaye <= 0) return "impaye";
  if (total > 0 && montantPaye >= total) return "paye";
  return "partiel";
}

const STATUTS_CLOTURES = ["terminee", "annulee", "refusee"];

function estCloturee(statut: string | null | undefined): boolean {
  return !!statut && STATUTS_CLOTURES.includes(statut);
}

export type RecalculResult = {
  error?: string;
  nouveau_total?: number;
  ecart?: number;
  type_ecart?: EcartType;
};

/**
 * Recalcule montant_final = montant_calcule + ajustement_manuel + Σ(extras) (plancher 0),
 * puis réévalue montant_paye / statut_paiement en conséquence.
 * - Trop-perçu (montant_paye > nouveau_total) : crédite l'avoir du client de la différence.
 * - Manque (0 < montant_paye < nouveau_total) : reste 'partiel', aucun mouvement auto.
 * À appeler après toute modif de montant_calcule, ajustement_manuel ou reservation_extras.
 */
async function recalculerTotalEtPaiement(reservationId: string, createdBy?: string): Promise<RecalculResult> {
  const { data: reservation, error: resError } = await supabaseAdmin
    .from("reservations")
    .select("montant_calcule, ajustement_manuel, montant_paye, numero, client_id")
    .eq("id", reservationId)
    .single();
  if (resError || !reservation) return { error: "Réservation introuvable." };

  const { data: extras, error: extrasError } = await supabaseAdmin
    .from("reservation_extras")
    .select("montant")
    .eq("reservation_id", reservationId);
  if (extrasError) return { error: extrasError.message };

  const montantCalcule = Number(reservation.montant_calcule) || 0;
  const ajustement = Number(reservation.ajustement_manuel) || 0;
  const sommeExtras = (extras ?? []).reduce((s, e) => s + (Number(e.montant) || 0), 0);
  const nouveauTotal = Math.max(0, montantCalcule + ajustement + sommeExtras);
  const montantPaye = Number(reservation.montant_paye) || 0;

  let nouveauMontantPaye = montantPaye;
  let statut: string;
  let ecart = 0;
  let type_ecart: EcartType = "aucun";

  if (montantPaye > nouveauTotal) {
    const tropPercu = montantPaye - nouveauTotal;
    if (!reservation.client_id) return { error: "Client introuvable (impossible de créditer le trop-perçu)." };

    const { error: mvtError } = await supabaseAdmin.from("avoirs_mouvements").insert({
      client_id: reservation.client_id,
      montant: tropPercu,
      type: "trop_percu",
      motif: `Trop-perçu — modification montant résa #${reservation.numero}`,
      reservation_id: reservationId,
      created_by: createdBy ?? null,
    });
    if (mvtError) return { error: mvtError.message };

    nouveauMontantPaye = nouveauTotal;
    statut = "paye";
    ecart = tropPercu;
    type_ecart = "trop_percu";
  } else {
    statut = calculerStatut(nouveauMontantPaye, nouveauTotal);
    if (nouveauMontantPaye > 0 && nouveauMontantPaye < nouveauTotal) {
      ecart = nouveauTotal - nouveauMontantPaye;
      type_ecart = "complement";
    }
  }

  const { error: updateError } = await supabaseAdmin
    .from("reservations")
    .update({
      montant_final: nouveauTotal,
      montant_paye: nouveauMontantPaye,
      statut_paiement: statut,
    })
    .eq("id", reservationId);
  if (updateError) return { error: updateError.message };

  return { nouveau_total: nouveauTotal, ecart, type_ecart };
}

/**
 * Enregistre OU modifie le paiement d'une réservation (modèle option 1 : un paiement sur la résa).
 * - Plafonne le montant payé au total (montant_final) : on ne peut jamais payer plus que dû.
 * - Recalcule le statut automatiquement (impaye / partiel / paye).
 * - Cohérence des avoirs : si le paiement ACTUEL était en mode "avoir", on re-crédite d'abord ce
 *   montant, puis on applique le nouveau (débit d'avoir si le nouveau mode est "avoir").
 */
export async function enregistrerPaiement(formData: FormData): Promise<{ error?: string }> {
  const verif = await verifierAdmin();
  if (verif.error) return verif;

  const reservation_id = formData.get("reservation_id") as string;
  const client_id = (formData.get("client_id") as string) || null;
  const montantSaisi = parseFloat((formData.get("montant_paye") as string) || "0");
  const date_paiement = (formData.get("date_paiement") as string) || null;
  const mode = ((formData.get("mode_paiement") as string) || "").trim() || null;

  if (!reservation_id) return { error: "Réservation introuvable." };
  if (isNaN(montantSaisi) || montantSaisi < 0) return { error: "Montant invalide." };

  const { data: reservation, error: resError } = await supabaseAdmin
    .from("reservations")
    .select("montant_paye, mode_paiement, montant_final, montant_calcule")
    .eq("id", reservation_id)
    .single();
  if (resError || !reservation) return { error: "Réservation introuvable." };

  const total = Number(reservation.montant_final ?? reservation.montant_calcule ?? 0);
  const ancienMontant = Number(reservation.montant_paye) || 0;
  const ancienMode = reservation.mode_paiement;

  // Plafond : jamais plus que le total dû
  let nouveauMontant = montantSaisi;
  if (total > 0 && nouveauMontant > total) nouveauMontant = total;

  // 1) Réverser l'avoir consommé par le paiement ACTUEL (mode "avoir" => tout le montant)
  if (ancienMode === "avoir" && ancienMontant > 0) {
    if (!client_id) return { error: "Client introuvable (réversion de l'avoir impossible)." };
    const { error: e } = await supabaseAdmin.from("avoirs_mouvements").insert({
      client_id,
      montant: ancienMontant,
      type: "annulation_paiement",
      motif: "Correction paiement (réversion avoir)",
      reservation_id,
    });
    if (e) return { error: e.message };
  }

  // 2) Si le NOUVEAU mode est "avoir", vérifier le solde (recalculé) et débiter
  if (mode === "avoir" && nouveauMontant > 0) {
    if (!client_id) return { error: "Client introuvable." };
    const solde = await getSoldeAvoir(supabaseAdmin, client_id);
    if (nouveauMontant > solde) {
      return { error: `Paiement par avoir impossible : solde disponible CHF ${solde.toFixed(2)}.` };
    }
    const { error: e } = await supabaseAdmin.from("avoirs_mouvements").insert({
      client_id,
      montant: -nouveauMontant,
      type: "utilisation",
      motif: "Paiement par avoir",
      reservation_id,
    });
    if (e) return { error: e.message };
  }

  // 3) Statut dérivé + mise à jour de la réservation
  const statut = calculerStatut(nouveauMontant, total);
  const { error: updateError } = await supabaseAdmin
    .from("reservations")
    .update({
      montant_paye: nouveauMontant,
      statut_paiement: statut,
      mode_paiement: nouveauMontant > 0 ? mode : null,
      date_paiement: nouveauMontant > 0 ? date_paiement : null,
    })
    .eq("id", reservation_id);
  if (updateError) return { error: updateError.message };

  revalidatePath(`/reservations/${reservation_id}`);
  return {};
}

/**
 * Met à jour le montant calculé automatiquement (base avant ajustement manuel et extras),
 * puis recalcule le total dû et le paiement.
 */
export async function enregistrerMontantCalcule(reservationId: string, montant: number): Promise<RecalculResult> {
  const verif = await verifierAdmin();
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
  const verif = await verifierAdmin();
  if (verif.error) return verif;

  const { data: reservation, error: resError } = await supabaseAdmin
    .from("reservations")
    .select(`
      statut, type_reservation, urgence, date_debut, date_fin, heure_arrivee, heure_depart,
      clients (membre),
      reservation_chiens (chiens (doit_etre_isole))
    `)
    .eq("id", reservationId)
    .single();
  if (resError || !reservation) return { error: "Réservation introuvable." };
  if (reservation.type_reservation !== "sejour") return {};
  if (estCloturee(reservation.statut)) return { error: "Réservation clôturée : modification impossible." };

  const { data: tarifs, error: tarifsError } = await supabaseAdmin
    .from("tarifs")
    .select("categorie, membre, prix")
    .eq("actif", true);
  if (tarifsError) return { error: tarifsError.message };

  const chiens = (reservation.reservation_chiens ?? []).map((rc: any) => rc.chiens).filter(Boolean);
  const nb_chiens = chiens.length;
  const chien_isole = chiens.some((c: any) => c.doit_etre_isole);
  const est_membre = (reservation.clients as any)?.membre ?? false;

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
  const verif = await verifierAdmin();
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
  const verif = await verifierAdmin();
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
  const verif = await verifierAdmin();
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

  const { error: deleteError } = await supabaseAdmin
    .from("reservation_extras")
    .delete()
    .eq("id", extraId);
  if (deleteError) return { error: deleteError.message };

  const result = await recalculerTotalEtPaiement(extra.reservation_id, verif.userId);
  revalidatePath(`/reservations/${extra.reservation_id}`);
  return result;
}

export async function annulerPaiement(formData: FormData): Promise<{ error?: string }> {
  const verif = await verifierAdmin();
  if (verif.error) return verif;

  const reservation_id = formData.get("reservation_id") as string;
  const client_id = formData.get("client_id") as string;
  const mettreEnAvoir = formData.get("mettre_en_avoir") === "true";

  if (!reservation_id) return { error: "Réservation introuvable." };

  const { data: reservation, error: resError } = await supabaseAdmin
    .from("reservations")
    .select("montant_paye, mode_paiement, montant_final, montant_calcule, numero")
    .eq("id", reservation_id)
    .single();
  if (resError || !reservation) return { error: "Réservation introuvable." };

  const montantPaye = Number(reservation.montant_paye) || 0;
  if (montantPaye <= 0) {
    return { error: "Aucun paiement à annuler pour cette réservation." };
  }

  // Si le paiement annulé était par avoir, on réverse TOUJOURS le débit d'origine
  // (sinon le client perd son crédit), indépendamment du choix "mettre_en_avoir".
  if (reservation.mode_paiement === "avoir") {
    if (!client_id) return { error: "Client introuvable." };
    const { error: mouvementError } = await supabaseAdmin.from("avoirs_mouvements").insert({
      client_id,
      montant: montantPaye,
      type: "annulation_paiement",
      motif: `Annulation paiement avoir résa #${reservation.numero ?? reservation_id}`,
      reservation_id,
    });
    if (mouvementError) return { error: mouvementError.message };
  } else if (mettreEnAvoir) {
    if (!client_id) return { error: "Client introuvable." };
    const { error: mouvementError } = await supabaseAdmin.from("avoirs_mouvements").insert({
      client_id,
      montant: montantPaye,
      type: "annulation_paiement",
      motif: "Annulation de paiement",
      reservation_id,
    });
    if (mouvementError) return { error: mouvementError.message };
  }

  const total = Number(reservation.montant_final ?? reservation.montant_calcule ?? 0);
  const statut = calculerStatut(0, total);

  const { error: updateError } = await supabaseAdmin
    .from("reservations")
    .update({
      montant_paye: 0,
      statut_paiement: statut,
      mode_paiement: null,
      date_paiement: null,
    })
    .eq("id", reservation_id);
  if (updateError) return { error: updateError.message };

  revalidatePath(`/reservations/${reservation_id}`);
  return {};
}

export async function supprimerReservationDefinitivement(formData: FormData): Promise<{ error?: string }> {
  const verif = await verifierAdmin();
  if (verif.error) return verif;

  const id = formData.get("id") as string;
  if (!id) return { error: "Réservation introuvable." };

  const { data: reservation, error: resError } = await supabaseAdmin
    .from("reservations")
    .select("id, statut")
    .eq("id", id)
    .single();
  if (resError || !reservation) return { error: "Réservation introuvable." };

  if (reservation.statut !== "annulee") {
    return { error: "Suppression impossible : la réservation n'est pas annulée." };
  }

  const { count, error: factureError } = await supabaseAdmin
    .from("factures")
    .select("id", { count: "exact", head: true })
    .eq("reservation_id", id);
  if (factureError) return { error: factureError.message };

  if ((count ?? 0) > 0) {
    return { error: "Suppression impossible : une facture existe pour cette réservation." };
  }

  const { error: deleteError } = await supabaseAdmin
    .from("reservations")
    .delete()
    .eq("id", id);
  if (deleteError) return { error: deleteError.message };

  redirect("/reservations");
}