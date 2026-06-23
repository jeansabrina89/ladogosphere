"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { verifierPermission } from "@/src/lib/verifierPermission";
import { getSoldeAvoir, getAvoirAppliqueReservation } from "@/src/lib/avoirs";
import type { EcartType } from "@/src/lib/facturation";
import { calculerMontant } from "@/src/lib/calculTarif";
import { calculerStatut } from "@/src/lib/factures";
import { estMembreActif } from "@/src/lib/membre";
import { getProfilePerms } from "@/src/lib/getProfilePerms";
import { rafraichirFactureBrouillon } from "@/src/lib/factureResa";

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
    .select("montant_calcule, ajustement_manuel, montant_paye, numero, client_id, offerte")
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
  let nouveauTotal = Math.max(0, montantCalcule + ajustement + sommeExtras);
  if (reservation.offerte) nouveauTotal = 0;
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
    statut = nouveauTotal === 0 ? "paye" : calculerStatut(nouveauMontantPaye, nouveauTotal);
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

  await rafraichirFactureBrouillon(reservationId);

  return { nouveau_total: nouveauTotal, ecart, type_ecart };
}

/**
 * Enregistre OU modifie le paiement d'une réservation (partie hors-avoir uniquement).
 * - Plafonne le montant payé au total.
 * - Refuse si le montant saisi est inférieur à l'avoir déjà utilisé sur la résa.
 * - Recalcule le statut automatiquement.
 * - Ne touche pas aux avoirs_mouvements.
 */
export async function enregistrerPaiement(formData: FormData): Promise<{ error?: string }> {
  const verif = await verifierPermission("perm_encaissements");
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
    .select("montant_final, montant_calcule, statut, montant_paye")
    .eq("id", reservation_id)
    .single();
  if (resError || !reservation) return { error: "Réservation introuvable." };

  if (reservation.statut === "annulee") {
    return { error: "Réservation annulée : aucun nouveau paiement ni avoir ne peut être appliqué. Utilisez « Annuler le paiement » pour corriger." };
  }

  const total = Number(reservation.montant_final ?? reservation.montant_calcule ?? 0);

  // Plafond : jamais plus que le total dû
  let nouveauMontant = montantSaisi;
  if (total > 0 && nouveauMontant > total) nouveauMontant = total;

  // Garde : le montant total payé ne peut pas descendre sous l'avoir déjà utilisé
  const avoirApplique = client_id
    ? await getAvoirAppliqueReservation(supabaseAdmin, client_id, reservation_id)
    : 0;
  if (nouveauMontant < avoirApplique) {
    return {
      error: `Le montant payé (CHF ${nouveauMontant.toFixed(2)}) ne peut pas être inférieur à l'avoir déjà utilisé sur cette réservation (CHF ${avoirApplique.toFixed(2)}). Cliquez d'abord « Reprendre l'avoir utilisé ».`,
    };
  }

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

  // Journal des paiements : mouvement liquide (delta)
  const deltaLiquide = Math.round((nouveauMontant - Number(reservation.montant_paye ?? 0)) * 100) / 100;
  if (deltaLiquide !== 0 && mode) {
    await supabaseAdmin.from("paiements_resa").insert({
      reservation_id,
      client_id,
      date_paiement: date_paiement || new Date().toISOString().split("T")[0],
      mode,
      montant: deltaLiquide,
      motif: "Paiement",
      created_by: verif.userId ?? null,
    });
  }

  revalidatePath(`/reservations/${reservation_id}`);
  return {};
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

  const { data: tarifs, error: tarifsError } = await supabaseAdmin
    .from("tarifs")
    .select("categorie, membre, prix")
    .eq("actif", true);
  if (tarifsError) return { error: tarifsError.message };

  const chiens = (reservation.reservation_chiens ?? []).map((rc: any) => rc.chiens).filter(Boolean);
  const nb_chiens = chiens.length;
  const chien_isole = chiens.some((c: any) => c.doit_etre_isole);
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

  const { error: deleteError } = await supabaseAdmin
    .from("reservation_extras")
    .delete()
    .eq("id", extraId);
  if (deleteError) return { error: deleteError.message };

  const result = await recalculerTotalEtPaiement(extra.reservation_id, verif.userId);
  revalidatePath(`/reservations/${extra.reservation_id}`);
  return result;
}

/**
 * Annule le paiement d'une réservation (remet à zéro).
 * - Restitue toujours l'avoir consommé sur la résa (lignes utilisation/annulation_paiement).
 * - La partie cash (hors-avoir) suit le choix mettre_en_avoir.
 */
export async function annulerPaiement(formData: FormData): Promise<{ error?: string }> {
  const verif = await verifierPermission("perm_encaissements");
  if (verif.error) return verif;

  const reservation_id = formData.get("reservation_id") as string;
  const client_id = (formData.get("client_id") as string) || null;
  const mettreEnAvoir = formData.get("mettre_en_avoir") === "true";

  if (!reservation_id) return { error: "Réservation introuvable." };

  const { data: reservation, error: resError } = await supabaseAdmin
    .from("reservations")
    .select("montant_paye, montant_final, montant_calcule, numero, mode_paiement")
    .eq("id", reservation_id)
    .single();
  if (resError || !reservation) return { error: "Réservation introuvable." };

  const montantPaye = Number(reservation.montant_paye) || 0;
  if (montantPaye <= 0) {
    return { error: "Aucun paiement à annuler pour cette réservation." };
  }

  const avoirApplique = client_id
    ? await getAvoirAppliqueReservation(supabaseAdmin, client_id, reservation_id)
    : 0;

  // 1) Restituer l'avoir consommé sur la résa (toujours, indépendamment du choix cash)
  if (avoirApplique > 0) {
    if (!client_id) return { error: "Client introuvable." };
    const { error: e1 } = await supabaseAdmin.from("avoirs_mouvements").insert({
      client_id,
      montant: avoirApplique,
      type: "annulation_paiement",
      motif: `Reprise avoir (annulation paiement résa #${reservation.numero ?? reservation_id})`,
      reservation_id,
      created_by: verif.userId ?? null,
    });
    if (e1) return { error: e1.message };
  }

  // 2) La partie cash suit le choix mettre_en_avoir
  const cashPaye = Math.max(0, montantPaye - avoirApplique);
  if (cashPaye > 0 && mettreEnAvoir) {
    if (!client_id) return { error: "Client introuvable." };
    const { error: e2 } = await supabaseAdmin.from("avoirs_mouvements").insert({
      client_id,
      montant: cashPaye,
      type: "annulation_paiement",
      motif: "Annulation de paiement",
      reservation_id,
      created_by: verif.userId ?? null,
    });
    if (e2) return { error: e2.message };
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

  const dateAnnul = new Date().toISOString().split("T")[0];
  if (cashPaye > 0) {
    await supabaseAdmin.from("paiements_resa").insert({
      reservation_id,
      client_id,
      date_paiement: dateAnnul,
      mode: (reservation.mode_paiement as string) || "cash",
      montant: -cashPaye,
      motif: "Annulation de paiement",
      created_by: verif.userId ?? null,
    });
  }
  if (avoirApplique > 0) {
    await supabaseAdmin.from("paiements_resa").insert({
      reservation_id,
      client_id,
      date_paiement: dateAnnul,
      mode: "avoir",
      montant: -avoirApplique,
      motif: "Reprise avoir (annulation paiement)",
      created_by: verif.userId ?? null,
    });
  }

  revalidatePath(`/reservations/${reservation_id}`);
  return {};
}

/**
 * Applique un montant d'avoir choisi par l'admin sur cette réservation.
 * Consomme min(montantDemande, solde, resteDu) en créant une ligne 'utilisation' (négatif).
 * Ne touche pas à mode_paiement ni date_paiement.
 */
export async function appliquerAvoir(formData: FormData): Promise<{ error?: string }> {
  const verif = await verifierPermission("perm_encaissements");
  if (verif.error) return verif;

  const reservation_id = formData.get("reservation_id") as string;
  const client_id = (formData.get("client_id") as string) || null;
  const montantDemande = parseFloat((formData.get("montant_avoir") as string) || "0");

  if (!reservation_id) return { error: "Réservation introuvable." };
  if (!client_id) return { error: "Client introuvable." };
  if (isNaN(montantDemande) || montantDemande <= 0) return { error: "Montant invalide." };

  const { data: reservation, error: resErr } = await supabaseAdmin
    .from("reservations")
    .select("montant_final, montant_calcule, montant_paye, statut")
    .eq("id", reservation_id)
    .single();
  if (resErr || !reservation) return { error: "Réservation introuvable." };

  if (reservation.statut === "annulee") {
    return { error: "Réservation annulée : aucun nouveau paiement ni avoir ne peut être appliqué. Utilisez « Annuler le paiement » pour corriger." };
  }

  const total = Number(reservation.montant_final ?? reservation.montant_calcule ?? 0);
  const dejaPaye = Number(reservation.montant_paye || 0);
  const resteDu = total - dejaPaye;
  if (resteDu <= 0) return { error: "Rien à payer sur cette réservation." };

  const solde = await getSoldeAvoir(supabaseAdmin, client_id);
  if (solde <= 0) return { error: "Aucun avoir disponible." };

  // On ne prélève jamais plus que ce qui est demandé, ni que le solde, ni que le reste dû
  const montantAvoir = Math.round(Math.min(montantDemande, solde, resteDu) * 100) / 100;
  if (montantAvoir <= 0) return { error: "Montant à utiliser invalide." };

  const { error: insErr } = await supabaseAdmin.from("avoirs_mouvements").insert({
    client_id,
    montant: -montantAvoir,
    type: "utilisation",
    motif: "Paiement par avoir",
    reservation_id,
    created_by: verif.userId ?? null,
  });
  if (insErr) return { error: insErr.message };

  const nouveauPaye = Math.round((dejaPaye + montantAvoir) * 100) / 100;
  const statut = calculerStatut(nouveauPaye, total);

  const { error: updErr } = await supabaseAdmin
    .from("reservations")
    .update({ montant_paye: nouveauPaye, statut_paiement: statut })
    .eq("id", reservation_id);
  if (updErr) return { error: updErr.message };

  await supabaseAdmin.from("paiements_resa").insert({
    reservation_id,
    client_id,
    date_paiement: new Date().toISOString().split("T")[0],
    mode: "avoir",
    montant: montantAvoir,
    motif: "Paiement par avoir",
    created_by: verif.userId ?? null,
  });

  revalidatePath(`/reservations/${reservation_id}`);
  return {};
}

/**
 * Reprend l'avoir utilisé sur cette réservation.
 * Crée une ligne 'annulation_paiement' (montant positif = restitution).
 * Si plus aucun paiement cash, remet mode_paiement et date_paiement à null.
 */
export async function reprendreAvoir(formData: FormData): Promise<{ error?: string }> {
  const verif = await verifierPermission("perm_encaissements");
  if (verif.error) return verif;

  const reservation_id = formData.get("reservation_id") as string;
  const client_id = (formData.get("client_id") as string) || null;

  if (!reservation_id) return { error: "Réservation introuvable." };
  if (!client_id) return { error: "Client introuvable." };

  const avoirApplique = await getAvoirAppliqueReservation(supabaseAdmin, client_id, reservation_id);
  if (avoirApplique <= 0) return { error: "Aucun avoir à reprendre sur cette réservation." };

  const { data: reservation, error: resError } = await supabaseAdmin
    .from("reservations")
    .select("montant_final, montant_calcule, montant_paye, mode_paiement, date_paiement, statut")
    .eq("id", reservation_id)
    .single();
  if (resError || !reservation) return { error: "Réservation introuvable." };

  if (reservation.statut === "annulee") {
    return { error: "Réservation annulée : aucun nouveau paiement ni avoir ne peut être appliqué. Utilisez « Annuler le paiement » pour corriger." };
  }

  const { error: insertError } = await supabaseAdmin.from("avoirs_mouvements").insert({
    client_id,
    montant: avoirApplique,
    type: "annulation_paiement",
    motif: "Reprise de l'avoir utilisé",
    reservation_id,
    created_by: verif.userId ?? null,
  });
  if (insertError) return { error: insertError.message };

  const total = Number(reservation.montant_final ?? reservation.montant_calcule ?? 0);
  const nouveauPaye = Math.max(0, Number(reservation.montant_paye || 0) - avoirApplique);
  const statut = calculerStatut(nouveauPaye, total);

  const { error: updateError } = await supabaseAdmin
    .from("reservations")
    .update({
      montant_paye: nouveauPaye,
      statut_paiement: statut,
      mode_paiement: nouveauPaye > 0 ? reservation.mode_paiement : null,
      date_paiement: nouveauPaye > 0 ? reservation.date_paiement : null,
    })
    .eq("id", reservation_id);
  if (updateError) return { error: updateError.message };

  await supabaseAdmin.from("paiements_resa").insert({
    reservation_id,
    client_id,
    date_paiement: new Date().toISOString().split("T")[0],
    mode: "avoir",
    montant: -avoirApplique,
    motif: "Reprise de l'avoir utilise",
    created_by: verif.userId ?? null,
  });

  revalidatePath(`/reservations/${reservation_id}`);
  return {};
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

  const { count: facturesCount, error: factureErr } = await supabaseAdmin
    .from("factures").select("id", { count: "exact", head: true }).eq("reservation_id", id);
  if (factureErr) return { error: factureErr.message };
  if ((facturesCount ?? 0) > 0) return { error: "Une facture est liée à cette réservation : impossible de supprimer." };

  const { count: avoirsCount, error: avoirErr } = await supabaseAdmin
    .from("avoirs_mouvements").select("id", { count: "exact", head: true }).eq("reservation_id", id);
  if (avoirErr) return { error: avoirErr.message };
  if ((avoirsCount ?? 0) > 0) return { error: "Un avoir est lié à cette réservation : impossible de supprimer." };

  const { count: cotisationsCount, error: cotisationErr } = await supabaseAdmin
    .from("cotisations_membres").select("id", { count: "exact", head: true }).eq("reservation_id", id);
  if (cotisationErr) return { error: cotisationErr.message };
  if ((cotisationsCount ?? 0) > 0) return { error: "Une cotisation est liée à cette réservation : impossible de supprimer." };

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
