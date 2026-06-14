"use server";

import { createSupabaseServerClient } from "../../src/lib/supabase-server";
import { supabaseAdmin } from "../../src/lib/supabase-admin";
import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";

export async function supprimerEmploye(id: string): Promise<{ error?: string }> {
  const supabase = await createSupabaseServerClient();

  // Sécurité : admin uniquement
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté" };
  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return { error: "Accès réservé à l'admin" };

  // Historique RH lié, puis l'employé
  const { data: fiches } = await supabase
    .from("fiches_salaire").select("id").eq("employe_id", id);
  const ficheIds = (fiches ?? []).map((f: any) => f.id);
  if (ficheIds.length) {
    await supabase.from("fiche_salaire_deductions").delete().in("fiche_id", ficheIds);
  }
  await supabase.from("fiches_salaire").delete().eq("employe_id", id);
  await supabase.from("planning_employes").delete().eq("employe_id", id);
  await supabase.from("demandes_vacances").delete().eq("employe_id", id);
  await supabase.from("timbrage").delete().eq("employe_id", id);
  await supabase.from("indisponibilites").delete().eq("employe_id", id);

  const { error } = await supabase.from("employes_rh").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/employes");
  return {};
}

export type AccesEmployeState = { password?: string; error?: string; lien?: boolean };

// Crée un compte connectable (role 'employe') pour une fiche RH existante,
// et lie la fiche au compte via employes_rh.profile_id.
export async function creerAccesEmploye(
  _prevState: AccesEmployeState,
  formData: FormData
): Promise<AccesEmployeState> {
  const supabase = await createSupabaseServerClient();

  // Sécurité : admin uniquement
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté" };
  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return { error: "Accès réservé à l'admin" };

  const ficheId = formData.get("fiche_id") as string;

  const { data: fiche, error: ficheError } = await supabaseAdmin
    .from("employes_rh")
    .select("id, email, prenom, nom, profile_id")
    .eq("id", ficheId)
    .single();
  if (ficheError || !fiche) return { error: "Fiche introuvable" };
  if (fiche.profile_id) return { error: "Cette fiche est déjà liée à un compte" };
  if (!fiche.email) return { error: "La fiche n'a pas d'email" };

  // Un compte existe déjà pour cet email ?
  const { data: profilExistant } = await supabaseAdmin
    .from("profiles")
    .select("id, role")
    .eq("email", fiche.email)
    .maybeSingle();

  if (profilExistant) {
    if (profilExistant.role !== "employe" && profilExistant.role !== "admin") {
      return {
        error: `Un compte existe déjà pour cet email (rôle : ${profilExistant.role}). Liaison annulée — utilise un autre email ou gère manuellement.`,
      };
    }

    const { error: updateError } = await supabaseAdmin
      .from("employes_rh")
      .update({ profile_id: profilExistant.id })
      .eq("id", ficheId);
    if (updateError) return { error: updateError.message };

    revalidatePath("/employes");
    return { lien: true };
  }

  const motDePasseProvisoire = randomBytes(9).toString("base64url");

  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: fiche.email,
    password: motDePasseProvisoire,
    email_confirm: true,
  });
  if (authError) return { error: authError.message };

  const userId = authData.user.id;

  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .upsert({
      id: userId,
      email: fiche.email,
      prenom: fiche.prenom,
      nom: fiche.nom,
      role: "employe",
      actif: true,
      perm_checkin: true,
      perm_reservations_creer: true,
      perm_reservations_modifier: true,
      perm_reservations_annuler: true,
      perm_clients_creer: true,
      perm_clients_modifier: true,
      perm_chiens_modifier: true,
      perm_planning: true,
      perm_tarifs_urgence: false,
    });
  if (profileError) return { error: profileError.message };

  const { error: updateError } = await supabaseAdmin
    .from("employes_rh")
    .update({ profile_id: userId })
    .eq("id", ficheId);
  if (updateError) return { error: updateError.message };

  revalidatePath("/employes");
  return { password: motDePasseProvisoire };
}

// Réinitialise le mot de passe d'un compte employé (génère un mot de passe temporaire).
export async function reinitialiserMotDePasseEmploye(
  _prevState: AccesEmployeState,
  formData: FormData
): Promise<AccesEmployeState> {
  const supabase = await createSupabaseServerClient();

  // Sécurité : admin uniquement
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté" };
  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return { error: "Accès réservé à l'admin" };

  const profilId = formData.get("profil_id") as string;

  const nouveauMdp = randomBytes(9).toString("base64url");

  const { error } = await supabaseAdmin.auth.admin.updateUserById(profilId, {
    password: nouveauMdp,
  });
  if (error) return { error: error.message };

  return { password: nouveauMdp };
}