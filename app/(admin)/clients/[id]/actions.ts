"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/src/utils/supabase/server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { getSoldeAvoir } from "@/src/lib/avoirs";
import { verifierPermission } from "@/src/lib/verifierPermission";
import { labelAbonnement } from "@/src/lib/abonnementsTypes";
import { synchroniserComptaAbonnement } from "@/src/lib/comptaAbonnement";

// Types crédit (montant positif) vs débit (montant négatif)
const TYPES_CREDIT = ["ajout_manuel", "annulation_paiement", "trop_percu"];

export async function ajouterAvoir(formData: FormData): Promise<{ error?: string }> {
  const verif = await verifierPermission("perm_encaissements");
  if (verif.error) return verif;

  const client_id = formData.get("client_id") as string;
  const montant = parseFloat(formData.get("montant") as string);
  const motif = (formData.get("motif") as string)?.trim();

  if (!client_id) return { error: "Client introuvable." };
  if (!montant || montant <= 0) return { error: "Le montant doit être supérieur à 0." };
  if (!motif) return { error: "Le motif est requis." };

  const { error } = await supabaseAdmin.from("avoirs_mouvements").insert({
    client_id,
    montant,
    type: "ajout_manuel",
    motif,
    created_by: verif.userId ?? null,
  });

  if (error) return { error: error.message };

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

  const { error } = await supabaseAdmin.from("avoirs_mouvements").insert({
    client_id,
    montant: -montant,
    type: "retrait_manuel",
    motif,
    created_by: verif.userId ?? null,
  });

  if (error) return { error: error.message };

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
    .select("montant, client_id")
    .eq("id", mouvement_id)
    .single();

  if (fetchErr || !ligne || ligne.client_id !== client_id) {
    return { error: "Mouvement introuvable." };
  }

  // Invariant : la suppression ne doit pas rendre le solde négatif
  const solde = await getSoldeAvoir(supabaseAdmin, client_id);
  const soldeApres = solde - Number(ligne.montant);
  if (soldeApres < 0) {
    return {
      error: `Suppression impossible : le solde deviendrait négatif (CHF ${soldeApres.toFixed(2)}).`,
    };
  }

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
    .select("id, client_id, statut, jours_total, categorie")
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

  await synchroniserComptaAbonnement(abonnementId);

  revalidatePath(`/clients/${abo.client_id}`);
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
    .select("id, client_id, statut")
    .eq("id", abonnementId)
    .maybeSingle();
  if (!abo) return { error: "Abonnement introuvable." };
  if (abo.statut === "annule") return { ok: true };

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
  await synchroniserComptaAbonnement(abonnementId);

  revalidatePath(`/clients/${abo.client_id}`);
  return { ok: true };
}
