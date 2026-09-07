"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { verifierPermission } from "@/src/lib/verifierPermission";
import { verifierDatePaiement } from "@/src/lib/datePaiement";
import { anneesExercicesOuverts } from "@/src/lib/exercices";
import { arrondirEspeces } from "@/src/lib/comptaFactureLogique";
import { rafraichirPaiementFacture, synchroniserComptaFacture } from "@/src/lib/comptaFacture";
import { synchroniserComptaResa } from "@/src/lib/comptaResa";
import { tracerEvenement } from "@/src/lib/journalEvenements";
import { finaliserEmission, envoyerFactureParEmail, genererPdfFacture } from "@/src/lib/factureDocument";
import { getSoldeAvoir } from "@/src/lib/avoirs";
import { MODES_ENCAISSEMENT } from "@/src/lib/factureStatut";

const r2 = (n: number) => Math.round(n * 100) / 100;
const MODES = MODES_ENCAISSEMENT.map((m) => m.valeur) as readonly string[];

async function parametre(cle: string, defaut: string): Promise<string> {
  const { data } = await supabaseAdmin.from("parametres").select("valeur").eq("cle", cle).maybeSingle();
  const v = (data?.valeur ?? "").trim();
  return v === "" ? defaut : v;
}

function rafraichir(factureId?: string | null, reservationId?: string | null) {
  revalidatePath("/factures");
  if (factureId) revalidatePath(`/factures/${factureId}`);
  if (reservationId) revalidatePath(`/reservations/${reservationId}`);
  revalidatePath("/reservations");
}

// ─────────────────────────────────────────────────────────────────────────────
// Encaissement — un seul chemin, partout dans l'application.
// ─────────────────────────────────────────────────────────────────────────────

export type ResultatEncaissement = {
  error?: string;
  ok?: boolean;
  /** Arrondi appliqué sur un paiement en espèces, à afficher sur le reçu. */
  arrondi?: number;
};

/**
 * Enregistre UN versement. Le montant saisi est le versement, jamais un cumul :
 * le total payé est toujours recalculé depuis le journal des paiements.
 */
export async function encaisser(formData: FormData): Promise<ResultatEncaissement> {
  const verif = await verifierPermission("perm_encaissements");
  if (verif.error) return { error: verif.error };

  const factureId = ((formData.get("facture_id") as string) || "").trim() || null;
  const reservationId = ((formData.get("reservation_id") as string) || "").trim() || null;
  const mode = ((formData.get("mode") as string) || "").trim();
  const datePaiement = ((formData.get("date_paiement") as string) || "").trim();
  const reference = ((formData.get("reference") as string) || "").trim() || null;
  const cleIdempotence = ((formData.get("cle_idempotence") as string) || "").trim() || null;
  const montantSaisi = parseFloat((formData.get("montant") as string) || "0");

  if (!factureId && !reservationId) return { error: "Aucune pièce à encaisser." };
  if (!MODES.includes(mode)) return { error: "Mode de paiement invalide." };
  if (!Number.isFinite(montantSaisi) || montantSaisi <= 0) return { error: "Montant invalide." };

  // Rejeu du MÊME versement (double clic) : c'est un succès, pas une erreur.
  // Le contrôle passe avant tous les autres, sans quoi le second clic buterait
  // sur « déjà soldée » alors qu'il ne demandait rien de nouveau.
  if (cleIdempotence) {
    const dejaVu = supabaseAdmin
      .from("paiements_resa")
      .select("id", { count: "exact", head: true })
      .eq("cle_idempotence", cleIdempotence);
    const { count } = await (factureId
      ? dejaVu.eq("facture_id", factureId)
      : dejaVu.eq("reservation_id", reservationId!));
    if ((count ?? 0) > 0) return { ok: true, arrondi: 0 };
  }

  // Contexte de la pièce : reste dû, client, date de référence.
  let clientId: string | null = null;
  let resteDu = 0;
  let datePiece: string | null = null;

  if (factureId) {
    const { data: f } = await supabaseAdmin
      .from("factures")
      .select("id, client_id, numero, statut, type, date_facture, montant_total, montant_paye")
      .eq("id", factureId)
      .maybeSingle();
    if (!f) return { error: "Facture introuvable." };
    if (!f.numero) return { error: "Cette facture n'est pas encore émise." };
    if (f.statut === "annulee" || f.statut === "annulee_par_avoir") {
      return { error: "Cette facture est annulée : aucun encaissement possible." };
    }
    clientId = f.client_id as string | null;
    datePiece = (f.date_facture as string) ?? null;
    resteDu = r2(Number(f.montant_total ?? 0) - Number(f.montant_paye ?? 0));
  } else {
    const { data: r } = await supabaseAdmin
      .from("reservations")
      .select("id, client_id, created_at, statut, montant_final, montant_calcule, montant_paye")
      .eq("id", reservationId!)
      .maybeSingle();
    if (!r) return { error: "Réservation introuvable." };
    if (r.statut === "annulee") return { error: "Réservation annulée : aucun encaissement possible." };
    clientId = r.client_id as string | null;
    datePiece = ((r.created_at as string) ?? "").slice(0, 10) || null;
    resteDu = r2(Number(r.montant_final ?? r.montant_calcule ?? 0) - Number(r.montant_paye ?? 0));
  }

  if (!clientId) return { error: "Pièce sans client : encaissement impossible." };

  const verdict = verifierDatePaiement(datePaiement, {
    datePiece,
    aujourdhui: new Date().toISOString().split("T")[0],
    exercicesOuverts: await anneesExercicesOuverts(),
  });
  if (!verdict.ok) return { error: verdict.message };

  // Jamais plus que le reste dû : un trop-perçu se traite par un avoir.
  const montant = r2(Math.min(montantSaisi, Math.max(resteDu, 0)));
  if (montant <= 0) return { error: "Cette pièce est déjà soldée." };

  // Payer par avoir : le solde du client doit suivre.
  if (mode === "avoir") {
    const solde = await getSoldeAvoir(supabaseAdmin, clientId);
    if (solde < montant) {
      return { error: `Avoir insuffisant : solde de CHF ${solde.toFixed(2)}.` };
    }
  }

  // Arrondi suisse aux 5 centimes sur les espèces.
  const arrondiActif = (await parametre("arrondi_especes", "true")) === "true";
  const { arrondi } = mode === "cash" ? arrondirEspeces(montant, arrondiActif) : { arrondi: 0 };

  const { error: insErr } = await supabaseAdmin.from("paiements_resa").insert({
    reservation_id: reservationId,
    facture_id: factureId,
    client_id: clientId,
    date_paiement: datePaiement,
    mode,
    montant,
    arrondi,
    motif: reference,
    source: "manuel",
    created_by: verif.userId ?? null,
    cle_idempotence: cleIdempotence,
  });
  if (insErr) {
    // Doublon de clé : le versement est déjà enregistré, ce n'est pas une erreur.
    if (insErr.code !== "23505") return { error: insErr.message };
    rafraichir(factureId, reservationId);
    return { ok: true, arrondi: 0 };
  }

  // Payer par avoir consomme le solde du client.
  if (mode === "avoir") {
    await supabaseAdmin
      .from("avoirs_mouvements")
      .insert({
        client_id: clientId,
        montant: -montant,
        type: "utilisation",
        motif: "Paiement par avoir",
        reservation_id: reservationId,
        facture_id: factureId,
        created_by: verif.userId ?? null,
      });
    // Aucune ecriture propre a ce mouvement : le versement porte deja le 2035.
  }

  if (factureId) await rafraichirPaiementFacture(factureId, verif.userId ?? null);
  if (reservationId) await rafraichirPaiementReservation(reservationId, verif.userId ?? null);

  await tracerEvenement({
    entite: "paiement",
    entiteId: factureId ?? reservationId!,
    evenement: "paiement",
    apres: { montant, mode, date: datePaiement, arrondi, reference },
    userId: verif.userId ?? null,
  });

  rafraichir(factureId, reservationId);
  return { ok: true, arrondi };
}

/** Recalcule le paiement d'une réservation depuis son journal (jamais saisi). */
async function rafraichirPaiementReservation(reservationId: string, userId?: string | null) {
  const { data: paiements } = await supabaseAdmin
    .from("paiements_resa").select("montant").eq("reservation_id", reservationId);
  const paye = r2((paiements ?? []).reduce(
    (s: number, p: { montant: number | string }) => s + Number(p.montant), 0));

  const { data: r } = await supabaseAdmin
    .from("reservations").select("montant_final, montant_calcule").eq("id", reservationId).maybeSingle();
  const total = Number(r?.montant_final ?? r?.montant_calcule ?? 0);
  const { calculerStatut } = await import("@/src/lib/factures");

  await supabaseAdmin
    .from("reservations")
    .update({ montant_paye: paye, statut_paiement: calculerStatut(paye, total) })
    .eq("id", reservationId);
  await synchroniserComptaResa(reservationId, undefined, userId ?? null);
}

/**
 * Annuler un encaissement : geste séparé, motivé, et jamais une suppression.
 * Le versement est contre-passé par un mouvement inverse ; le client est
 * remboursé (sortie de trésorerie) ou crédité d'un avoir.
 */
export async function annulerPaiement(formData: FormData): Promise<{ error?: string; ok?: boolean }> {
  const verif = await verifierPermission("perm_encaissements");
  if (verif.error) return { error: verif.error };

  const paiementId = ((formData.get("paiement_id") as string) || "").trim();
  const motif = ((formData.get("motif") as string) || "").trim();
  const destination = ((formData.get("destination") as string) || "rembourser").trim();

  if (!paiementId) return { error: "Paiement introuvable." };
  if (!motif) return { error: "Le motif est obligatoire." };
  if (!["rembourser", "avoir"].includes(destination)) return { error: "Destination invalide." };

  const { data: p } = await supabaseAdmin
    .from("paiements_resa")
    .select("id, facture_id, reservation_id, client_id, mode, montant, arrondi, date_paiement")
    .eq("id", paiementId)
    .maybeSingle();
  if (!p) return { error: "Paiement introuvable." };

  const montant = r2(Number(p.montant));
  if (montant <= 0) return { error: "Ce mouvement n'est pas un encaissement." };

  const aujourdhui = new Date().toISOString().split("T")[0];

  // Contre-passation : un versement négatif, jamais une ligne effacée.
  const { error: insErr } = await supabaseAdmin.from("paiements_resa").insert({
    reservation_id: p.reservation_id,
    facture_id: p.facture_id,
    client_id: p.client_id,
    date_paiement: aujourdhui,
    mode: destination === "avoir" ? "avoir" : (p.mode as string),
    montant: -montant,
    arrondi: destination === "avoir" ? 0 : -r2(Number(p.arrondi ?? 0)),
    motif: `Annulation : ${motif}`,
    source: "manuel",
    created_by: verif.userId ?? null,
  });
  if (insErr) return { error: insErr.message };

  // Mise en avoir : la trésorerie ne bouge pas, la dette envers le client naît.
  if (destination === "avoir" && p.client_id) {
    await supabaseAdmin
      .from("avoirs_mouvements")
      .insert({
        client_id: p.client_id,
        montant,
        type: "mise_en_avoir",
        motif: `Annulation de paiement : ${motif}`,
        reservation_id: p.reservation_id,
        facture_id: p.facture_id,
        created_by: verif.userId ?? null,
      });
    // Aucune ecriture propre a ce mouvement : le versement porte deja le 2035.
  }

  if (p.facture_id) await rafraichirPaiementFacture(p.facture_id as string, verif.userId ?? null);
  if (p.reservation_id) await rafraichirPaiementReservation(p.reservation_id as string, verif.userId ?? null);

  await tracerEvenement({
    entite: "paiement",
    entiteId: (p.facture_id as string) ?? (p.reservation_id as string),
    evenement: "paiement_annule",
    avant: { montant, mode: p.mode, date: p.date_paiement },
    apres: { destination },
    motif,
    userId: verif.userId ?? null,
  });

  rafraichir(p.facture_id as string | null, p.reservation_id as string | null);
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Émission et envoi
// ─────────────────────────────────────────────────────────────────────────────

export async function emettreFactureAction(factureId: string): Promise<{ error?: string; numero?: string }> {
  const verif = await verifierPermission("perm_encaissements");
  if (verif.error) return { error: verif.error };

  const { data, error } = await supabaseAdmin.rpc("emettre_facture", {
    p_facture_id: factureId,
    p_user_id: verif.userId ?? null,
  });
  if (error) return { error: error.message };

  // La réservation liée ne porte plus le produit : elle repasse en acompte.
  const { data: lignes } = await supabaseAdmin
    .from("facture_lignes").select("reservation_id").eq("facture_id", factureId).not("reservation_id", "is", null);
  for (const id of new Set((lignes ?? []).map((l: { reservation_id: string }) => l.reservation_id))) {
    await synchroniserComptaResa(id, undefined, verif.userId ?? null);
  }

  await synchroniserComptaFacture(factureId, verif.userId ?? null);
  await finaliserEmission(factureId, verif.userId ?? null);

  rafraichir(factureId);
  return { numero: (data as string) ?? undefined };
}

export async function renvoyerFactureAction(factureId: string): Promise<{ error?: string; ok?: boolean }> {
  const verif = await verifierPermission("perm_encaissements");
  if (verif.error) return { error: verif.error };

  await genererPdfFacture(factureId);
  const res = await envoyerFactureParEmail(factureId, verif.userId ?? null);
  if (res.error) return { error: res.error };

  rafraichir(factureId);
  return { ok: true };
}

/** Un BROUILLON s'annule ; une facture émise ne s'annule jamais (avoir). */
export async function annulerBrouillon(factureId: string): Promise<{ error?: string; ok?: boolean }> {
  const verif = await verifierPermission("perm_encaissements");
  if (verif.error) return { error: verif.error };

  const { data: f } = await supabaseAdmin
    .from("factures").select("id, numero").eq("id", factureId).maybeSingle();
  if (!f) return { error: "Facture introuvable." };
  if (f.numero) {
    return { error: "Cette facture est émise : elle se corrige par un avoir, jamais par une annulation." };
  }

  await tracerEvenement({
    entite: "facture", entiteId: factureId, evenement: "brouillon_annule",
    userId: verif.userId ?? null,
  });
  await supabaseAdmin.from("facture_lignes").delete().eq("facture_id", factureId);
  await supabaseAdmin.from("facture_reservations").delete().eq("facture_id", factureId);
  await supabaseAdmin.from("factures").delete().eq("id", factureId);

  revalidatePath("/factures");
  return { ok: true };
}
