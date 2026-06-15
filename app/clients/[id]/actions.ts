"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "../../../src/utils/supabase/server";
import { supabaseAdmin } from "../../../src/lib/supabase-admin";
import { getSoldeAvoir } from "../../../src/lib/avoirs";
import { verifierPermission } from "../../../src/lib/verifierPermission";

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
