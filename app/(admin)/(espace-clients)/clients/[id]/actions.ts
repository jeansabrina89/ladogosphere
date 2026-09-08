"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/src/utils/supabase/server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { getSoldeAvoir } from "@/src/lib/avoirs";
import { verifierPermission } from "@/src/lib/verifierPermission";
import { labelAbonnement } from "@/src/lib/abonnementsTypes";
import { synchroniserComptaAbonnement } from "@/src/lib/comptaAbonnement";
import { porterAbonnementSurFacture } from "@/src/lib/abonnementFacture";
import { synchroniserProduitAbonnement } from "@/src/lib/abonnementCompta";
import { encaisser } from "@/app/(admin)/(espace-comptabilite)/factures/actions";
import { creerAvoir } from "@/app/(admin)/(espace-comptabilite)/factures/actionsCreation";
import { tracerEvenement } from "@/src/lib/journalEvenements";
import { synchroniserComptaAvoir, contrePasserComptaAvoir } from "@/src/lib/comptaAvoir";

// Types crédit (montant positif) vs débit (montant négatif)
const TYPES_CREDIT = ["ajout_manuel", "annulation_paiement", "trop_percu"];

// Seuls les gestes saisis à la main se corrigent à la main. Les mouvements
// produits par l'application (utilisation, trop-perçu, annulation de paiement…)
// sont le reflet d'une réservation : on les corrige par un mouvement inverse
// motivé, jamais en réécrivant l'historique.
const TYPES_MANUELS = ["ajout_manuel", "retrait_manuel"];

export async function ajouterAvoir(formData: FormData): Promise<{ error?: string }> {
  const verif = await verifierPermission("perm_encaissements");
  if (verif.error) return verif;

  const client_id = formData.get("client_id") as string;
  const montant = parseFloat(formData.get("montant") as string);
  const motif = (formData.get("motif") as string)?.trim();

  if (!client_id) return { error: "Client introuvable." };
  if (!montant || montant <= 0) return { error: "Le montant doit être supérieur à 0." };
  if (!motif) return { error: "Le motif est requis." };

  const { data: mvt, error } = await supabaseAdmin
    .from("avoirs_mouvements")
    .insert({
      client_id,
      montant,
      type: "ajout_manuel",
      motif,
      created_by: verif.userId ?? null,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  // Geste commercial : D 3800 diminutions de produits / C 2035 avoirs clients.
  await synchroniserComptaAvoir(mvt.id, verif.userId ?? null);

  revalidatePath(`/clients/${client_id}`);
  return {};
}

export async function retirerAvoir(formData: FormData): Promise<{ error?: string }> {
  const verif = await verifierPermission("perm_encaissements");
  if (verif.error) return verif;

  const client_id = formData.get("client_id") as string;
  const montant = parseFloat(formData.get("montant") as string);
  const motif = (formData.get("motif") as string)?.trim();

  if (!client_id) return { error: "Client introuvable." };
  if (!montant || montant <= 0) return { error: "Le montant doit être supérieur à 0." };
  if (!motif) return { error: "Le motif est requis." };

  const solde = await getSoldeAvoir(supabaseAdmin, client_id);
  if (solde - montant < 0) {
    return { error: `Retrait impossible : le solde actuel (CHF ${solde.toFixed(2)}) est insuffisant.` };
  }

  const { data: mvt, error } = await supabaseAdmin
    .from("avoirs_mouvements")
    .insert({
      client_id,
      montant: -montant,
      type: "retrait_manuel",
      motif,
      created_by: verif.userId ?? null,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  // Reprise : D 2035 avoirs clients / C 3800 diminutions de produits.
  await synchroniserComptaAvoir(mvt.id, verif.userId ?? null);

  revalidatePath(`/clients/${client_id}`);
  return {};
}

export async function modifierMouvementAvoir(formData: FormData): Promise<{ error?: string }> {
  const verif = await verifierPermission("perm_encaissements");
  if (verif.error) return verif;

  const mouvement_id  = (formData.get("mouvement_id") as string)?.trim();
  const client_id     = (formData.get("client_id") as string)?.trim();
  const nouveau_montant = parseFloat(formData.get("nouveau_montant") as string);
  const nouveau_motif = (formData.get("nouveau_motif") as string)?.trim();

  if (!mouvement_id) return { error: "Mouvement introuvable." };
  if (!client_id)    return { error: "Client introuvable." };
  if (!nouveau_montant || nouveau_montant <= 0)
    return { error: "Le montant doit être supérieur à 0." };
  if (!nouveau_motif) return { error: "Le motif est requis." };

  // Récupère la ligne et vérifie l'ownership
  const { data: ligne, error: fetchErr } = await supabaseAdmin
    .from("avoirs_mouvements")
    .select("montant, type, client_id")
    .eq("id", mouvement_id)
    .single();

  if (fetchErr || !ligne || ligne.client_id !== client_id) {
    return { error: "Mouvement introuvable." };
  }

  if (!TYPES_MANUELS.includes(ligne.type)) {
    return {
      error: "Ce mouvement est généré automatiquement par une réservation : il ne se modifie pas. Pour le corriger, saisissez un ajout ou un retrait d'avoir avec le motif.",
    };
  }

  // Calcule le montant signé selon le type (le signe ne change pas)
  const signe = TYPES_CREDIT.includes(ligne.type) ? 1 : -1;
  const nouveauMontantSigne = signe * Math.abs(nouveau_montant);

  // Invariant : le solde après modification ne doit pas être négatif
  const solde = await getSoldeAvoir(supabaseAdmin, client_id);
  const soldeApres = solde - Number(ligne.montant) + nouveauMontantSigne;
  if (soldeApres < 0) {
    return {
      error: `Modification impossible : le solde deviendrait négatif (CHF ${soldeApres.toFixed(2)}).`,
    };
  }

  const { error: updateErr } = await supabaseAdmin
    .from("avoirs_mouvements")
    .update({ montant: nouveauMontantSigne, motif: nouveau_motif })
    .eq("id", mouvement_id);

  if (updateErr) return { error: updateErr.message };

  // Le grand livre suit le nouveau montant (delta, pas de doublon).
  await synchroniserComptaAvoir(mouvement_id, verif.userId ?? null);

  revalidatePath(`/clients/${client_id}`);
  return {};
}

export async function supprimerMouvementAvoir(formData: FormData): Promise<{ error?: string }> {
  const verif = await verifierPermission("perm_encaissements");
  if (verif.error) return verif;

  const mouvement_id = (formData.get("mouvement_id") as string)?.trim();
  const client_id    = (formData.get("client_id") as string)?.trim();

  if (!mouvement_id) return { error: "Mouvement introuvable." };
  if (!client_id)    return { error: "Client introuvable." };

  // Récupère la ligne et vérifie l'ownership
  const { data: ligne, error: fetchErr } = await supabaseAdmin
    .from("avoirs_mouvements")
    .select("montant, type, client_id")
    .eq("id", mouvement_id)
    .single();

  if (fetchErr || !ligne || ligne.client_id !== client_id) {
    return { error: "Mouvement introuvable." };
  }

  if (!TYPES_MANUELS.includes(ligne.type)) {
    return {
      error: "Ce mouvement est généré automatiquement par une réservation : il ne se supprime pas. Pour le corriger, saisissez un ajout ou un retrait d'avoir avec le motif.",
    };
  }

  // Invariant : la suppression ne doit pas rendre le solde négatif
  const solde = await getSoldeAvoir(supabaseAdmin, client_id);
  const soldeApres = solde - Number(ligne.montant);
  if (soldeApres < 0) {
    return {
      error: `Suppression impossible : le solde deviendrait négatif (CHF ${soldeApres.toFixed(2)}).`,
    };
  }

  // Contre-passer AVANT de supprimer : après la suppression, la pièce n'existe
  // plus et l'écriture resterait seule au grand livre.
  await contrePasserComptaAvoir(mouvement_id, verif.userId ?? null);

  const { error: deleteErr } = await supabaseAdmin
    .from("avoirs_mouvements")
    .delete()
    .eq("id", mouvement_id);

  if (deleteErr) return { error: deleteErr.message };

  revalidatePath(`/clients/${client_id}`);
  return {};
}

export async function confirmerPaiementAbonnement(
  abonnementId: string,
  mode: string,
): Promise<{ ok?: boolean; error?: string }> {
  const verif = await verifierPermission("perm_encaissements");
  if (verif.error) return verif;

  const modesValides = ["cash", "twint", "virement", "stripe"];
  if (!modesValides.includes(mode)) return { error: "Mode de paiement invalide." };

  const { data: abo } = await supabaseAdmin
    .from("abonnements")
    .select("id, client_id, statut, jours_total, categorie, prix_paye")
    .eq("id", abonnementId)
    .maybeSingle();
  if (!abo) return { error: "Abonnement introuvable." };

  if (abo.statut === "actif") return { ok: true };
  if (abo.statut !== "en_attente_paiement") return { error: "Carte non confirmable." };

  const today = new Date();
  const datePaiement = today.toISOString().split("T")[0];
  const dateExpObj = new Date(today);
  dateExpObj.setFullYear(dateExpObj.getFullYear() + 1);
  const dateExpiration = dateExpObj.toISOString().split("T")[0];

  const { error: upErr } = await supabaseAdmin
    .from("abonnements")
    .update({ statut: "actif", mode_paiement: mode, date_paiement: datePaiement, date_expiration: dateExpiration })
    .eq("id", abonnementId);
  if (upErr) return { error: upErr.message };

  const { error: mvErr } = await supabaseAdmin.from("abonnements_mouvements").insert({
    abonnement_id: abonnementId,
    client_id: abo.client_id,
    delta: abo.jours_total,
    type: "achat",
    motif: "Achat carte " + labelAbonnement(abo.categorie),
  });
  if (mvErr) return { error: mvErr.message };

  /*
   * La carte est une PIÈCE : elle part sur une facture, par le moteur habituel.
   * La ligne va en 2031 — produit perçu d'avance — et non sur un compte de
   * produit : la prestation n'est pas encore rendue.
   *
   * S'il existe déjà une facture en brouillon pour ce client, la ligne l'y
   * rejoint (une seule facture plutôt que deux le même jour) ; sinon une
   * facture libre est créée et émise.
   */
  const facture = await porterAbonnementSurFacture(abonnementId, {
    creerSiAbsente: true,
    userId: verif.userId ?? null,
  });
  if (facture.error) return { error: facture.error };

  // Le versement se pose sur la facture émise, comme n'importe quel autre :
  // D liquidité / C 1100. Un brouillon attend son émission.
  if (facture.emise && facture.factureId) {
    const fd = new FormData();
    fd.set("facture_id", facture.factureId);
    fd.set("mode", mode);
    fd.set("date_paiement", datePaiement);
    fd.set("montant", String(Number(abo.prix_paye ?? 0)));
    fd.set("cle_idempotence", `abonnement-${abonnementId}`);
    const encaisse = await encaisser(fd);
    if (encaisse.error) return { error: encaisse.error };
  }

  revalidatePath(`/clients/${abo.client_id}`);
  revalidatePath("/factures");
  return { ok: true };
}

export async function archiverClient(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;
  const actif = formData.get("actif") === "true";

  const { error } = await supabase
    .from("clients")
    .update({ actif: !actif })
    .eq("id", id);

  if (error) throw new Error(error.message);
  redirect(`/clients/${id}`);
}

export async function supprimerClient(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;

  const { error } = await supabase
    .from("clients")
    .delete()
    .eq("id", id);

  if (error) throw new Error(error.message);
  redirect("/clients");
}

// Ajuste manuellement le solde de jours d'un abonnement confirmé (admin).
// Écrit un mouvement d'ajustement (delta), sans altérer l'historique (append-only).
// Neutre comptablement : la reconnaissance du produit dépend de jours_total et des
// réservations terminées, pas du solde de jours.
export async function ajusterJoursAbonnement(
  abonnementId: string,
  nouveauSolde: number,
): Promise<{ ok?: boolean; error?: string }> {
  const verif = await verifierPermission("perm_encaissements");
  if (verif.error) return verif;

  if (!Number.isInteger(nouveauSolde) || nouveauSolde < 0) {
    return { error: "Le nombre de jours doit être un entier positif ou nul." };
  }

  const { data: abo } = await supabaseAdmin
    .from("abonnements")
    .select("id, client_id, statut, jours_total, abonnements_mouvements(delta)")
    .eq("id", abonnementId)
    .maybeSingle();
  if (!abo) return { error: "Abonnement introuvable." };
  if (!["actif", "epuise", "expire"].includes(abo.statut)) {
    return { error: "Seule une carte confirmée peut être ajustée." };
  }
  if (nouveauSolde > (abo.jours_total ?? 0)) {
    return { error: `Le solde ne peut pas dépasser le total de la carte (${abo.jours_total} jours).` };
  }

  const soldeActuel = ((abo.abonnements_mouvements ?? []) as { delta: number | string }[]).reduce(
    (s, m) => s + Number(m.delta),
    0,
  );
  const delta = Math.round((nouveauSolde - soldeActuel) * 100) / 100;
  if (delta === 0) return { ok: true };

  const { error: mvErr } = await supabaseAdmin.from("abonnements_mouvements").insert({
    abonnement_id: abonnementId,
    client_id: abo.client_id,
    delta,
    type: "ajustement",
    motif: "Ajustement manuel du solde (admin)",
  });
  if (mvErr) return { error: mvErr.message };

  // Cohérence du statut (on ne touche pas à 'expire')
  if (nouveauSolde <= 0 && abo.statut === "actif") {
    await supabaseAdmin.from("abonnements").update({ statut: "epuise" }).eq("id", abonnementId);
  } else if (nouveauSolde >= 1 && abo.statut === "epuise") {
    await supabaseAdmin.from("abonnements").update({ statut: "actif" }).eq("id", abonnementId);
  }

  revalidatePath(`/clients/${abo.client_id}`);
  return { ok: true };
}

// Supprime un abonnement (annulation sûre) : statut -> 'annule' (masqué partout),
// puis contre-passe la comptabilité liée. Bloque si la carte a déjà réglé des
// réservations, pour ne pas fausser des paiements passés.
export async function supprimerAbonnement(
  abonnementId: string,
): Promise<{ ok?: boolean; error?: string }> {
  const verif = await verifierPermission("perm_encaissements");
  if (verif.error) return verif;

  const { data: abo } = await supabaseAdmin
    .from("abonnements")
    .select("id, client_id, statut, facture_id")
    .eq("id", abonnementId)
    .maybeSingle();
  if (!abo) return { error: "Abonnement introuvable." };
  if (abo.statut === "annule") return { ok: true };
  if (abo.facture_id) {
    return {
      error: "Cette carte porte une facture : elle s'annule par un avoir, jamais par une suppression.",
    };
  }

  const { count: nbResa } = await supabaseAdmin
    .from("reservations")
    .select("id", { count: "exact", head: true })
    .eq("abonnement_id", abonnementId);
  if ((nbResa ?? 0) > 0) {
    return {
      error: `Impossible : cette carte a déjà réglé ${nbResa} réservation(s). Annulez d'abord le paiement par carte sur ces réservations, puis réessayez.`,
    };
  }

  const { error: upErr } = await supabaseAdmin
    .from("abonnements")
    .update({ statut: "annule" })
    .eq("id", abonnementId);
  if (upErr) return { error: upErr.message };

  // Contre-passe la compta si la carte avait été payée (idempotent, ne throw pas).
  await synchroniserComptaAbonnement(abonnementId, undefined, verif.userId ?? null);

  revalidatePath(`/clients/${abo.client_id}`);
  return { ok: true };
}

// Clôture un abonnement SANS remboursement : la carte passe en 'expire' (inutilisable),
// les jours restants sont ramenés à 0 (mouvement 'expiration'), et la compta est
// resynchronisée -> le montant prépayé non consommé est reconnu comme produit
// (le client ne récupère pas son argent : c'est un gain pour l'entreprise).
export async function cloturerAbonnement(
  abonnementId: string,
): Promise<{ ok?: boolean; error?: string }> {
  const verif = await verifierPermission("perm_encaissements");
  if (verif.error) return verif;

  const { data: abo } = await supabaseAdmin
    .from("abonnements")
    .select("id, client_id, statut, abonnements_mouvements(delta)")
    .eq("id", abonnementId)
    .maybeSingle();
  if (!abo) return { error: "Abonnement introuvable." };
  if (!["actif", "epuise"].includes(abo.statut)) {
    return { error: "Seule une carte confirmée et non clôturée peut être clôturée." };
  }

  // Ramène le solde de jours à 0 (mouvement d'expiration) pour un affichage cohérent.
  const solde = ((abo.abonnements_mouvements ?? []) as { delta: number | string }[]).reduce(
    (s, m) => s + Number(m.delta),
    0,
  );
  if (solde !== 0) {
    const { error: mvErr } = await supabaseAdmin.from("abonnements_mouvements").insert({
      abonnement_id: abonnementId,
      client_id: abo.client_id,
      delta: -solde,
      type: "expiration",
      motif: "Clôture sans remboursement (jours restants annulés)",
    });
    if (mvErr) return { error: mvErr.message };
  }

  const { error: upErr } = await supabaseAdmin
    .from("abonnements")
    .update({ statut: "expire" })
    .eq("id", abonnementId);
  if (upErr) return { error: upErr.message };

  // Ce qui restait en 2031 devient un produit, à la date de l'expiration : le
  // client a payé, il n'a pas utilisé, la prestation n'est plus due. Aucun
  // remboursement — s'il y en a un, il passe par un avoir décidé à la main.
  await synchroniserProduitAbonnement(abonnementId, verif.userId ?? null);
  // Les cartes d'avant APP 15, sans facture, gardent leur ancienne mécanique.
  await synchroniserComptaAbonnement(abonnementId, undefined, verif.userId ?? null);

  revalidatePath(`/clients/${abo.client_id}`);
  return { ok: true };
}

/**
 * Annuler une carte facturée : par AVOIR, jamais par suppression.
 *
 * L'avoir défait exactement ce que la facture a fait — il redébite 2031 et
 * efface la créance ou crédite le client. Les journées restantes tombent à
 * zéro, et le mouvement le dit.
 */
export async function annulerAbonnementParAvoir(
  abonnementId: string,
  motif: string,
): Promise<{ ok?: boolean; error?: string; numero?: string }> {
  const verif = await verifierPermission("perm_encaissements");
  if (verif.error) return verif;

  const raison = (motif ?? "").trim();
  if (!raison) return { error: "Indiquez le motif de l'annulation." };

  const { data: abo } = await supabaseAdmin
    .from("abonnements")
    .select("id, client_id, statut, facture_id, abonnements_mouvements(delta)")
    .eq("id", abonnementId)
    .maybeSingle();
  if (!abo) return { error: "Abonnement introuvable." };
  if (!abo.facture_id) {
    return { error: "Cette carte n'a pas de facture : utilisez la suppression, réservée aux cartes d'avant." };
  }
  if (abo.statut === "annule") return { ok: true };

  const { data: facture } = await supabaseAdmin
    .from("factures").select("id, numero, statut").eq("id", abo.facture_id).maybeSingle();
  if (!facture?.numero) {
    return { error: "La facture de cette carte n'est pas encore émise : annulez le brouillon." };
  }

  // Les journées consommées sont déjà des produits : elles ne se reprennent
  // pas. On ne crédite que la part encore en 2031.
  const { data: lignes } = await supabaseAdmin
    .from("facture_lignes")
    .select("id, quantite")
    .eq("facture_id", abo.facture_id)
    .eq("abonnement_id", abonnementId);
  if (!lignes || lignes.length === 0) {
    return { error: "La ligne d'abonnement est introuvable sur la facture." };
  }

  const fd = new FormData();
  fd.set("facture_id", abo.facture_id as string);
  fd.set("motif", raison);
  fd.set("destination", "credit");
  fd.set("lignes", JSON.stringify(
    lignes.map((l) => ({ ligne_id: l.id as string, quantite: Number(l.quantite) }))
  ));
  const avoir = await creerAvoir(fd);
  if (avoir.error) return { error: avoir.error };

  // Les journées restantes tombent à zéro, et le mouvement le dit.
  const solde = ((abo.abonnements_mouvements ?? []) as { delta: number | string }[])
    .reduce((s, m) => s + Number(m.delta), 0);
  if (solde !== 0) {
    await supabaseAdmin.from("abonnements_mouvements").insert({
      abonnement_id: abonnementId,
      client_id: abo.client_id,
      delta: -solde,
      type: "annulation",
      motif: `Carte annulée par avoir : ${raison}`,
    });
  }

  await supabaseAdmin
    .from("abonnements")
    .update({ statut: "annule" })
    .eq("id", abonnementId);

  await tracerEvenement({
    entite: "abonnement", entiteId: abonnementId, evenement: "abonnement_avoir",
    apres: { avoir: avoir.numero ?? null, jours_annules: solde }, motif: raison,
    userId: verif.userId ?? null,
  });

  revalidatePath(`/clients/${abo.client_id}`);
  revalidatePath("/factures");
  return { ok: true, numero: avoir.numero };
}
