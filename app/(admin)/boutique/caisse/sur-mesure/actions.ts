"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { verifierPermission } from "@/src/lib/verifierPermission";
import { aujourdhuiISO } from "@/src/lib/dates";
import { lireArticle } from "@/src/lib/boutique";
import { factureCibleClient } from "@/src/lib/caisse";
import {
  encaissementVente,
  lignesEcritureVente,
  rendreMonnaie,
  type ModeReglementVente,
} from "@/src/lib/caisseLogique";
import { creerCommande, lireCatalogueOptions } from "@/src/lib/personnalisation";
import {
  datePromise,
  delaiTotal,
  figerChoix,
  prixTotal,
  refusConfigurationAvecDependances,
  type ChoixParGroupe,
} from "@/src/lib/personnalisationLogique";

/**
 * Commande sur mesure au comptoir : la configuration devient une commande, et
 * l'encaissement passe par le mécanisme d'APP 11 — comptant ou porté sur la
 * facture du client. Rien de nouveau côté comptable.
 *
 * Le prix et le délai sont RECALCULÉS ici, depuis le catalogue en base : ce que
 * le navigateur envoie, ce sont des choix, jamais des montants.
 */

export type ResultatCommande = {
  error?: string;
  proposerFactureLibre?: boolean;
  id?: string;
  numero?: string;
  vente_id?: string | null;
  deja?: boolean;
  prix?: number;
  aRegler?: number;
  arrondi?: number;
  rendu?: number | null;
  datePromise?: string | null;
};

const MODES: ModeReglementVente[] = ["especes", "twint", "carte", "facture_client"];

export async function commanderSurMesure(entree: {
  cle_idempotence: string;
  article_id: string;
  client_id: string;
  choix: ChoixParGroupe;
  mode: ModeReglementVente;
  montant_recu?: number | null;
  creer_facture_libre?: boolean;
  notes?: string | null;
}): Promise<ResultatCommande> {
  const verif = await verifierPermission("perm_boutique");
  if (verif.error) return { error: verif.error };

  if (!MODES.includes(entree.mode)) return { error: "Choisissez le mode de règlement." };
  if (entree.mode === "facture_client") {
    const encaissements = await verifierPermission("perm_encaissements");
    if (encaissements.error) {
      return { error: "Porter une commande sur la facture d'un client demande la permission « Encaissements »." };
    }
  }
  // Une commande sur mesure se rappelle : elle a toujours un client.
  if (!entree.client_id) return { error: "Rattachez la commande à un client." };

  const article = await lireArticle(entree.article_id);
  if (!article || article.type_article !== "personnalisable" || !article.actif) {
    return { error: "Cet article ne se commande pas sur mesure." };
  }

  // Le navigateur a déjà filtré, mais c'est ici que cela compte : une
  // combinaison devenue impossible ne passe pas, même envoyée à la main.
  const { groupes, dependances } = await lireCatalogueOptions(entree.article_id);
  const refus = refusConfigurationAvecDependances(groupes, entree.choix, dependances);
  if (refus) return { error: refus };

  const prix = prixTotal(article.prix_vente, groupes, entree.choix);
  const delai = delaiTotal(article.delai_fabrication_jours, groupes, entree.choix);
  const promise = datePromise(aujourdhuiISO(), delai);
  const choixFiges = figerChoix(groupes, entree.choix);

  const { aRegler, arrondi } = encaissementVente(prix, entree.mode);

  let factureId: string | null = null;
  if (entree.mode === "facture_client") {
    const cible = await factureCibleClient(entree.client_id, {
      creerSiAbsente: entree.creer_facture_libre === true,
      userId: verif.userId ?? null,
    });
    if (cible.factureId === null) {
      return { error: cible.erreur, proposerFactureLibre: cible.proposerFactureLibre };
    }
    factureId = cible.factureId;
  }

  const ligne = {
    article_id: article.id,
    libelle: `${article.nom} — sur mesure`,
    quantite: 1,
    prix_unitaire: prix,
    taux_tva: Number(article.taux_tva),
    montant: prix,
  };

  const res = await creerCommande({
    cle_idempotence: entree.cle_idempotence,
    client_id: entree.client_id,
    article_id: entree.article_id,
    choix: choixFiges,
    prix,
    delai,
    date_promise: promise,
    notes: entree.notes ?? null,
    user_id: verif.userId ?? null,
    vente: {
      cle_idempotence: `${entree.cle_idempotence}-vente`,
      mode: entree.mode,
      lignes: [ligne],
      total: prix,
      arrondi,
      ecriture_lignes: lignesEcritureVente({ totalLignes: prix, arrondi, mode: entree.mode }),
      facture_id: factureId,
      montant_recu: entree.mode === "especes" ? entree.montant_recu ?? null : null,
    },
  });

  if (res.error) return { error: res.error };

  revalidatePath("/boutique/commandes");
  revalidatePath("/boutique/ventes");
  revalidatePath("/boutique/articles");
  revalidatePath("/");

  return {
    id: res.id,
    numero: res.numero,
    vente_id: res.vente_id,
    deja: res.deja,
    prix,
    aRegler,
    arrondi,
    rendu: entree.mode === "especes" ? rendreMonnaie(aRegler, entree.montant_recu ?? null) : null,
    datePromise: promise,
  };
}

export type ClientTrouve = { id: string; nom: string; email: string | null };

/** Recherche d'un client : une commande sur mesure se rappelle toujours. */
export async function chercherClientCommande(q: string): Promise<ClientTrouve[]> {
  const verif = await verifierPermission("perm_boutique");
  if (verif.error) return [];

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

  return (data ?? []).map((c) => ({
    id: c.id as string,
    nom: `${c.prenom ?? ""} ${c.nom ?? ""}`.trim(),
    email: (c.email as string) ?? null,
  }));
}
