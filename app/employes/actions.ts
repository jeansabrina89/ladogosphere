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

export type AccesEmployeState = {
  password?: string;
  error?: string;
  lien?: boolean;
  besoinConfirmation?: boolean;
  email?: string;
  role?: string;
  converti?: boolean;
};

// Permissions par défaut accordées à un nouveau compte employé.
const PERMISSIONS_EMPLOYE_DEFAUT = {
  perm_chiens_creer: true,
  perm_chiens_modifier: true,
  perm_clients_creer: true,
  perm_clients_modifier: true,
  perm_reservations_creer: true,
  perm_reservations_modifier: true,
  perm_reservations_annuler: true,
  perm_journee_essai: true,
  perm_encaissements: true,
  perm_tarifs_urgence: false,
  perm_checkin: true,
  perm_box: true,
  perm_planning: true,
  perm_timbrage_equipe: false,
  perm_vacances_equipe: false,
};

// Crée un compte connectable (role 'employe') pour une fiche RH existante,
// et lie la fiche au compte via employes_rh.profile_id.
// confirmer=true autorise la conversion d'un compte non-employé existant (ex. client).
export async function creerAccesEmploye(
  ficheId: string,
  confirmer: boolean = false
): Promise<AccesEmployeState> {
  const supabase = await createSupabaseServerClient();

  // Sécurité : admin uniquement
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté" };
  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return { error: "Accès réservé à l'admin" };

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
    .select("id, email, role")
    .eq("email", fiche.email)
    .maybeSingle();

  if (profilExistant) {
    // Compte employé/admin existant -> simple liaison
    if (profilExistant.role === "employe" || profilExistant.role === "admin") {
      const { error: updateError } = await supabaseAdmin
        .from("employes_rh")
        .update({ profile_id: profilExistant.id })
        .eq("id", ficheId);
      if (updateError) return { error: updateError.message };

      revalidatePath("/employes");
      return { lien: true };
    }

    // Compte non-employé (ex. client) -> nécessite confirmation
    if (!confirmer) {
      return {
        besoinConfirmation: true,
        email: profilExistant.email ?? fiche.email,
        role: profilExistant.role,
      };
    }

    // Conversion confirmée : on transforme le compte existant en employé
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({ role: "employe", ...PERMISSIONS_EMPLOYE_DEFAUT })
      .eq("id", profilExistant.id);
    if (profileError) return { error: profileError.message };

    const { error: updateError } = await supabaseAdmin
      .from("employes_rh")
      .update({ profile_id: profilExistant.id })
      .eq("id", ficheId);
    if (updateError) return { error: updateError.message };

    revalidatePath("/employes");
    return { converti: true };
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
      ...PERMISSIONS_EMPLOYE_DEFAUT,
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
  profilId: string
): Promise<AccesEmployeState> {
  const supabase = await createSupabaseServerClient();

  // Sécurité : admin uniquement
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté" };
  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return { error: "Accès réservé à l'admin" };

  const nouveauMdp = randomBytes(9).toString("base64url");

  const { error } = await supabaseAdmin.auth.admin.updateUserById(profilId, {
    password: nouveauMdp,
  });
  if (error) return { error: error.message };

  return { password: nouveauMdp };
}