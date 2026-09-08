"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { verifierPermission } from "@/src/lib/verifierPermission";
import { COMPTES_DEPENSE } from "@/src/lib/depensesLogique";

/** Carnet de fournisseurs. Un fournisseur ne se supprime pas : il se désactive. */

export type EtatFournisseur = { erreur: string | null; id?: string };

async function garde(): Promise<{ userId?: string; erreur?: string }> {
  const verif = await verifierPermission("perm_depenses");
  if (verif.error) return { erreur: verif.error };
  return { userId: verif.userId };
}

function champs(formData: FormData) {
  const texte = (cle: string) => {
    const v = String(formData.get(cle) ?? "").trim();
    return v === "" ? null : v;
  };
  const compte = texte("compte_charge_defaut");
  return {
    nom: String(formData.get("nom") ?? "").trim(),
    adresse: texte("adresse"),
    npa: texte("npa"),
    localite: texte("localite"),
    email: texte("email"),
    telephone: texte("telephone"),
    iban: texte("iban")?.replace(/\s+/g, "") ?? null,
    compte_charge_defaut: compte && COMPTES_DEPENSE.includes(compte) ? compte : null,
    notes: texte("notes"),
  };
}

export async function enregistrerFournisseur(
  _etat: EtatFournisseur,
  formData: FormData
): Promise<EtatFournisseur> {
  const g = await garde();
  if (g.erreur) return { erreur: g.erreur };

  const id = (formData.get("id") as string) || null;
  const valeurs = champs(formData);
  if (!valeurs.nom) return { erreur: "Le nom du fournisseur est obligatoire.", id: id ?? undefined };

  if (id) {
    const { error } = await supabaseAdmin.from("fournisseurs").update(valeurs).eq("id", id);
    if (error) return { erreur: error.message, id };
    revalidatePath("/comptabilite/fournisseurs");
    revalidatePath(`/comptabilite/fournisseurs/${id}`);
    return { erreur: null, id };
  }

  const { data, error } = await supabaseAdmin
    .from("fournisseurs")
    .insert(valeurs)
    .select("id")
    .single();
  if (error) return { erreur: error.message };

  revalidatePath("/comptabilite/fournisseurs");
  redirect(`/comptabilite/fournisseurs/${data.id as string}`);
}

/**
 * Activation ou désactivation. Un fournisseur qui porte des dépenses n'est
 * jamais supprimé — la piste comptable doit rester lisible.
 */
export async function basculerActifFournisseur(
  _etat: EtatFournisseur,
  formData: FormData
): Promise<EtatFournisseur> {
  const g = await garde();
  if (g.erreur) return { erreur: g.erreur };

  const id = String(formData.get("id") ?? "");
  const actif = String(formData.get("actif") ?? "") === "true";

  const { error } = await supabaseAdmin.from("fournisseurs").update({ actif }).eq("id", id);
  if (error) return { erreur: error.message, id };

  revalidatePath("/comptabilite/fournisseurs");
  revalidatePath(`/comptabilite/fournisseurs/${id}`);
  return { erreur: null, id };
}

/** Suppression réservée à un fournisseur qui n'a jamais servi. */
export async function supprimerFournisseur(
  _etat: EtatFournisseur,
  formData: FormData
): Promise<EtatFournisseur> {
  const g = await garde();
  if (g.erreur) return { erreur: g.erreur };

  const id = String(formData.get("id") ?? "");
  const { count } = await supabaseAdmin
    .from("depenses")
    .select("*", { count: "exact", head: true })
    .eq("fournisseur_id", id);

  if ((count ?? 0) > 0) {
    return {
      erreur: "Ce fournisseur porte des dépenses : désactivez-le plutôt que de le supprimer.",
      id,
    };
  }

  const { error } = await supabaseAdmin.from("fournisseurs").delete().eq("id", id);
  if (error) return { erreur: error.message, id };

  revalidatePath("/comptabilite/fournisseurs");
  redirect("/comptabilite/fournisseurs");
}
