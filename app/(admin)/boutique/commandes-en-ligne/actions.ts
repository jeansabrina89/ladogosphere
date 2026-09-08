"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { verifierPermissionBoutique } from "@/src/lib/permissions";
import { envoyerEmailCommandeExpediee } from "@/src/lib/email";
import { lignesEcritureVente, encaissementVente } from "@/src/lib/caisseLogique";
import { lireCommande, lignesDeCommande } from "@/src/lib/venteEnLigne";
import { statutSortie, type StatutCommandeLigne } from "@/src/lib/venteEnLigneLogique";
import type { ModeReglementVente } from "@/src/lib/caisseLogique";

/**
 * Les commandes en ligne, côté pension.
 *
 * La vente, les mouvements de stock et l'écriture sont produits par le moteur
 * d'APP 11 (finaliser_vente), appelé depuis remettre_commande dans la même
 * transaction que la libération de la réservation. Rien n'est refait ici.
 */

export type Retour = { error?: string; message?: string; venteId?: string };

async function garde(): Promise<{ userId?: string; erreur?: string }> {
  const verif = await verifierPermissionBoutique("vente");
  if (verif.error) return { erreur: verif.error };
  return { userId: verif.userId };
}

function rafraichir(commandeId?: string) {
  revalidatePath("/boutique/commandes-en-ligne");
  revalidatePath("/boutique");
  revalidatePath("/chiens-du-jour");
  if (commandeId) revalidatePath(`/boutique/commandes-en-ligne/${commandeId}`);
}

/** Avancer dans la préparation : à préparer → en préparation → prête. */
export async function changerStatutPreparation(
  commandeId: string,
  statut: StatutCommandeLigne
): Promise<Retour> {
  const g = await garde();
  if (g.erreur) return { error: g.erreur };

  if (!["confirmee", "en_preparation", "prete"].includes(statut)) {
    return { error: "Ce statut ne se pose pas à la main." };
  }

  const commande = await lireCommande(commandeId);
  if (!commande) return { error: "Commande introuvable." };
  if (!["confirmee", "en_preparation", "prete"].includes(commande.statut)) {
    return { error: "Cette commande n'est plus en préparation." };
  }

  const { error } = await supabaseAdmin
    .from("commandes").update({ statut }).eq("id", commandeId);
  if (error) return { error: "Le changement de statut a été refusé." };

  await supabaseAdmin.from("journal_evenements").insert({
    entite: "commande_en_ligne", entite_id: commandeId, evenement: "statut",
    apres: { statut }, user_id: g.userId ?? null,
  });

  rafraichir(commandeId);
  return { message: "Statut enregistré." };
}

/**
 * Remise ou expédition.
 *
 * C'est ici que la vente naît : canal « en_ligne », mouvements de stock
 * définitifs, écriture selon le règlement. Une commande déjà facturée ne
 * repasse rien en comptabilité — la facture porte déjà le produit.
 */
export async function remettreCommande(entree: {
  commande_id: string;
  /** Comment le client règle au comptoir, quand il n'y avait pas de facture. */
  mode?: ModeReglementVente | null;
  montant_recu?: number | null;
  numero_suivi?: string | null;
}): Promise<Retour> {
  const g = await garde();
  if (g.erreur) return { error: g.erreur };

  const commande = await lireCommande(entree.commande_id);
  if (!commande) return { error: "Commande introuvable." };
  if (commande.statut === "remise" || commande.statut === "expediee") {
    return { error: "Cette commande a déjà été remise." };
  }
  if (commande.statut === "annulee") return { error: "Cette commande est annulée." };
  if (commande.statut === "panier") return { error: "Cette commande n'est pas confirmée." };

  const statut = statutSortie(commande.mode_remise as "retrait" | "depart_chien" | "postal" | null);
  if (statut === "expediee" && !String(entree.numero_suivi ?? "").trim()) {
    // Le suivi reste facultatif : un colis peut partir sans, et le client
    // recevra son e-mail sans numéro plutôt que rien du tout.
  }

  const lignes = await lignesDeCommande(entree.commande_id);
  if (lignes.length === 0) return { error: "Cette commande n'a aucune ligne." };

  const total = Number(commande.montant_total);
  const dejaFacturee = commande.mode_paiement === "facture" && commande.facture_id;

  // Sans facture, le règlement se fait au comptoir : c'est l'encaissement
  // d'APP 11, avec son arrondi aux cinq centimes.
  const mode: ModeReglementVente = dejaFacturee
    ? "facture_client"
    : (entree.mode ?? "especes");
  if (!dejaFacturee && !entree.mode) {
    return { error: "Choisissez comment le client règle." };
  }

  const { aRegler, arrondi } = encaissementVente(total, mode);

  // La remise et le port sont des LIGNES de la vente, pas un rabais caché sur
  // le total. Sans elles, les lignes ne totaliseraient pas la vente : un retour
  // rendrait 80 là où 72 ont été encaissés, et le grand livre le dirait.
  const lignesVente: {
    article_id: string | null; libelle: string; quantite: number;
    prix_unitaire: number; taux_tva: number; montant: number;
  }[] = lignes.map((l) => ({
    // Un article sur mesure ne sort pas du stock : il vient d'être fabriqué.
    article_id: l.article_id,
    libelle: l.libelle,
    quantite: Number(l.quantite),
    prix_unitaire: Number(l.prix_unitaire),
    taux_tva: Number(l.taux_tva),
    montant: Number(l.montant),
  }));

  const remise = Number(commande.remise_membre ?? 0);
  if (remise > 0) {
    lignesVente.push({
      article_id: null, libelle: "Remise membre",
      quantite: 1, prix_unitaire: -remise, taux_tva: 0, montant: -remise,
    });
  }
  const port = Number(commande.frais_port ?? 0);
  if (port > 0) {
    lignesVente.push({
      article_id: null, libelle: "Frais de port",
      quantite: 1, prix_unitaire: port, taux_tva: 0, montant: port,
    });
  }

  const vente = {
    cle_idempotence: `commande-${entree.commande_id}`,
    mode,
    lignes: lignesVente,
    total,
    arrondi,
    ecriture_lignes: dejaFacturee
      ? []
      : lignesEcritureVente({ totalLignes: total, arrondi, mode }),
    facture_id: commande.facture_id,
    montant_recu: mode === "especes" ? entree.montant_recu ?? null : null,
  };

  const { data, error } = await supabaseAdmin.rpc("remettre_commande", {
    p_commande_id: entree.commande_id,
    p_statut: statut,
    p_numero_suivi: entree.numero_suivi ?? null,
    p_vente: vente,
    p_user_id: g.userId ?? null,
  });
  if (error) return { error: messageRemise(error.message) };

  const res = data as { id: string; vente_id: string | null; deja: boolean };

  if (statut === "expediee") {
    await envoyerEmailCommandeExpediee(entree.commande_id).catch(() => {});
  }

  rafraichir(entree.commande_id);
  return {
    venteId: res.vente_id ?? undefined,
    message: statut === "expediee"
      ? `Commande expédiée. Le client a reçu son e-mail${entree.numero_suivi ? " avec le numéro de suivi" : ""}.`
      : `Commande remise. Vente enregistrée${aRegler !== total ? `, arrondi de ${(aRegler - total).toFixed(2)}` : ""}.`,
  };
}

function messageRemise(message: string): string {
  const m = message ?? "";
  if (/déjà|confirmée|remet|expédie/.test(m)) return m;
  return "La remise a été refusée.";
}

/** Le numéro de suivi peut arriver après coup : on ne rouvre pas la vente. */
export async function enregistrerNumeroSuivi(
  commandeId: string,
  numero: string
): Promise<Retour> {
  const g = await garde();
  if (g.erreur) return { error: g.erreur };

  const suivi = String(numero ?? "").trim();
  if (!suivi) return { error: "Indiquez le numéro de suivi." };

  const commande = await lireCommande(commandeId);
  if (!commande) return { error: "Commande introuvable." };

  const { error } = await supabaseAdmin
    .from("commandes").update({ numero_suivi: suivi }).eq("id", commandeId);
  if (error) return { error: "L'enregistrement a été refusé." };

  await envoyerEmailCommandeExpediee(commandeId).catch(() => {});

  rafraichir(commandeId);
  return { message: "Numéro de suivi enregistré et envoyé au client." };
}

/**
 * Annulation d'une commande non remise : motif obligatoire, réservation de
 * stock libérée. Une facture déjà émise s'annule par AVOIR — jamais en la
 * supprimant : elle est numérotée, elle est partie chez le client.
 */
export async function annulerCommande(commandeId: string, motif: string): Promise<Retour> {
  const g = await garde();
  if (g.erreur) return { error: g.erreur };

  const raison = String(motif ?? "").trim();
  if (!raison) return { error: "Indiquez le motif de l'annulation." };

  const commande = await lireCommande(commandeId);
  if (!commande) return { error: "Commande introuvable." };
  if (commande.statut === "remise" || commande.statut === "expediee") {
    return { error: "Cette commande a déjà été remise : passez un retour de vente." };
  }

  const { error } = await supabaseAdmin.rpc("annuler_commande_en_ligne", {
    p_commande_id: commandeId,
    p_motif: raison,
    p_user_id: g.userId ?? null,
  });
  if (error) {
    return {
      error: /motif|déjà remise/.test(error.message) ? error.message : "L'annulation a été refusée.",
    };
  }

  // La commande d'atelier attachée n'a plus lieu d'être non plus.
  const lignes = await lignesDeCommande(commandeId);
  for (const l of lignes) {
    if (!l.commande_personnalisee_id) continue;
    await supabaseAdmin.rpc("changer_statut_commande", {
      p_commande_id: l.commande_personnalisee_id,
      p_statut: "annulee",
      p_user_id: g.userId ?? null,
    });
  }

  let note = "";
  if (commande.facture_id) {
    const avoir = await avoirSurFacture(commande.facture_id, raison, g.userId ?? null);
    note = avoir.error
      ? ` La facture n'a PAS été créditée : ${avoir.error}`
      : ` La facture a été annulée par l'avoir ${avoir.numero ?? ""}.`;
  }

  rafraichir(commandeId);
  return { message: `Commande annulée, stock libéré.${note}` };
}

/**
 * L'avoir passe par le moteur de factures — mêmes lignes, même numérotation,
 * même écriture. On ne fabrique pas un avoir à la main.
 */
async function avoirSurFacture(
  factureId: string,
  motif: string,
  userId: string | null
): Promise<{ error?: string; numero?: string }> {
  const { creerAvoir } = await import("@/app/(admin)/(espace-comptabilite)/factures/actionsCreation");

  const { data: lignes } = await supabaseAdmin
    .from("facture_lignes").select("id, quantite").eq("facture_id", factureId);

  const aCrediter = ((lignes ?? []) as unknown as { id: string; quantite: number | string }[])
    // Une ligne négative (la remise membre) ne se crédite pas : elle se reprend
    // avec le reste, et le moteur refuse une quantité négative.
    .filter((l) => Number(l.quantite) > 0)
    .map((l) => ({ ligne_id: l.id, quantite: Number(l.quantite) }));

  if (aCrediter.length === 0) return { error: "cette facture n'a aucune ligne à créditer." };

  const corps = new FormData();
  corps.set("facture_id", factureId);
  corps.set("lignes", JSON.stringify(aCrediter));
  corps.set("motif", `Commande annulée : ${motif}`);
  corps.set("destination", "credit");

  const res = await creerAvoir(corps);
  void userId;
  return res.error ? { error: res.error } : { numero: res.numero };
}
