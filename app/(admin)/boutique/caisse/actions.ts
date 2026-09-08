"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { verifierPermissionBoutique } from "@/src/lib/permissions";
// L'encaissement sur facture reste sa propre permission : porter un achat sur
// la facture d'un client n'est pas le même geste que d'encaisser au comptoir.
import { verifierPermission } from "@/src/lib/verifierPermission";
import {
  finaliserVente,
  retournerVente,
  factureCibleClient,
  sejourEnCours,
  type ResultatVente,
} from "@/src/lib/caisse";
import type { ModeReglementVente } from "@/src/lib/caisseLogique";
import { estMembreActif } from "@/src/lib/membre";

/**
 * Caisse — actions d'écran. Ouvrir la caisse demande « Boutique — vente » ; porter un
 * achat sur la facture d'un client demande en plus perm_encaissements, comme
 * tout ce qui touche au compte d'un client.
 *
 * Un refus est RETOURNÉ, jamais lancé : une exception d'action serveur est
 * masquée en production, et l'utilisateur ne verrait rien.
 */

const MODES: ModeReglementVente[] = ["especes", "twint", "carte", "facture_client"];

async function garde(mode?: string): Promise<{ userId?: string; erreur?: string }> {
  const verif = await verifierPermissionBoutique("vente");
  if (verif.error) return { erreur: verif.error };

  if (mode === "facture_client") {
    const encaissements = await verifierPermission("perm_encaissements");
    if (encaissements.error) {
      return { erreur: "Porter un achat sur la facture d'un client demande la permission « Encaissements »." };
    }
  }
  return { userId: verif.userId };
}

export type EntreePanier = { article_id: string; quantite: number };

/** Finalisation d'une vente au comptoir. */
export async function encaisserVente(entree: {
  cle_idempotence: string;
  lignes: EntreePanier[];
  mode: ModeReglementVente;
  client_id?: string | null;
  montant_recu?: number | null;
  creer_facture_libre?: boolean;
}): Promise<ResultatVente> {
  const g = await garde(entree.mode);
  if (g.erreur) return { error: g.erreur };

  if (!MODES.includes(entree.mode)) return { error: "Choisissez le mode de règlement." };
  if (!entree.cle_idempotence) return { error: "Panier illisible : recommencez." };

  const res = await finaliserVente({
    cle_idempotence: entree.cle_idempotence,
    lignes: entree.lignes,
    mode: entree.mode,
    client_id: entree.client_id ?? null,
    montant_recu: entree.montant_recu ?? null,
    creer_facture_libre: entree.creer_facture_libre,
    user_id: g.userId ?? null,
  });

  if (!res.error) {
    revalidatePath("/boutique/caisse");
    revalidatePath("/boutique/ventes");
    revalidatePath("/boutique/articles");
    revalidatePath("/");
  }
  return res;
}

/** Retour ou erreur de caisse sur une vente finalisée. Le motif est obligatoire. */
export async function passerRetour(entree: {
  vente_id: string;
  cle_idempotence: string;
  quantites: Record<string, number>;
  motif: string;
}): Promise<ResultatVente> {
  const g = await garde();
  if (g.erreur) return { error: g.erreur };

  const res = await retournerVente({
    vente_id: entree.vente_id,
    cle_idempotence: entree.cle_idempotence,
    quantites: entree.quantites,
    motif: entree.motif,
    user_id: g.userId ?? null,
  });

  if (!res.error) {
    revalidatePath("/boutique/ventes");
    revalidatePath(`/boutique/ventes/${entree.vente_id}`);
    revalidatePath("/boutique/articles");
    revalidatePath("/");
  }
  return res;
}

export type ClientCaisse = {
  id: string;
  nom: string;
  factureId: string | null;
  /** Ce que la caisse pourra faire de cet achat, dit en français. */
  etat: string;
  prete: boolean;
  /** Son adhésion est-elle en cours ? C'est elle qui ouvre la remise membre. */
  estMembre: boolean;
};

/**
 * Recherche d'un client pour le mode « Sur la facture du client ».
 * On dit tout de suite, pour chacun, s'il a une facture ouverte ou un séjour
 * en cours : le refus ne doit pas arriver après le choix.
 */
export async function chercherClients(q: string): Promise<ClientCaisse[]> {
  const g = await garde("facture_client");
  if (g.erreur) return [];

  const recherche = q.trim();
  if (recherche.length < 2) return [];

  const motif = `%${recherche}%`;
  const { data } = await supabaseAdmin
    .from("clients")
    .select("id, prenom, nom, email")
    .or(`prenom.ilike.${motif},nom.ilike.${motif},email.ilike.${motif}`)
    .eq("actif", true)
    .order("nom")
    .limit(8);

  const clients: ClientCaisse[] = [];
  for (const c of data ?? []) {
    const cible = await factureCibleClient(c.id as string);
    const nom = `${c.prenom ?? ""} ${c.nom ?? ""}`.trim();
    // L'adhésion décide de la remise membre : elle voyage avec le client, pour
    // que le panier se recalcule dès qu'on le choisit.
    const estMembre = await estMembreActif(supabaseAdmin, c.id as string);

    if (cible.factureId !== null) {
      clients.push({
        id: c.id as string, nom, factureId: cible.factureId,
        etat: "Facture en brouillon", prete: true, estMembre,
      });
      continue;
    }
    const sejour = await sejourEnCours(c.id as string);
    clients.push({
      id: c.id as string,
      nom,
      factureId: null,
      etat: sejour ? "Séjour en cours — une facture sera créée" : cible.erreur,
      prete: sejour,
      estMembre,
    });
  }
  return clients;
}

/** Envoi du ticket au client rattaché à la vente. */
export async function envoyerTicket(venteId: string): Promise<{ error?: string; message?: string }> {
  const g = await garde();
  if (g.erreur) return { error: g.erreur };

  const { genererTicket } = await import("@/src/lib/ticketDocument");
  const { envoyerEmailTicketBoutique } = await import("@/src/lib/email");
  const { lireVente } = await import("@/src/lib/caisse");

  const vente = await lireVente(venteId);
  if (!vente) return { error: "Vente introuvable." };

  const ticket = await genererTicket(venteId);
  if (!ticket) return { error: "Ticket indisponible." };
  if (!ticket.infos.clientEmail) {
    return { error: "Aucun client n'est rattaché à cette vente : il n'y a pas d'adresse où l'envoyer." };
  }

  try {
    await envoyerEmailTicketBoutique({
      email: ticket.infos.clientEmail,
      prenom: ticket.infos.clientPrenom ?? "",
      numero: ticket.infos.numero,
      date: vente.date_vente.slice(0, 10),
      montant: ticket.infos.total,
      pdf: ticket.buffer,
    });
  } catch {
    return { error: "L'envoi a échoué. Réessayez dans un instant." };
  }

  return { message: `Ticket envoyé à ${ticket.infos.clientEmail}.` };
}
