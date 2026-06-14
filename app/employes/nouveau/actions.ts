"use server";

import { redirect } from "next/navigation";
import { supabaseAdmin } from "../../../src/lib/supabase-admin";
import { createSupabaseServerClient } from "../../../src/lib/supabase-server";

export async function creerEmploye(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/");

  const prenom = formData.get("prenom") as string;
  const nom = formData.get("nom") as string;
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError) throw new Error(authError.message);

  const userId = authData.user.id;

  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .upsert({
      id: userId,
      email,
      prenom,
      nom,
      role: "employe",
      actif: true,
      perm_chiens_creer: formData.get("perm_chiens_creer") === "on",
      perm_chiens_modifier: formData.get("perm_chiens_modifier") === "on",
      perm_clients_creer: formData.get("perm_clients_creer") === "on",
      perm_clients_modifier: formData.get("perm_clients_modifier") === "on",
      perm_reservations_creer: formData.get("perm_reservations_creer") === "on",
      perm_reservations_modifier: formData.get("perm_reservations_modifier") === "on",
      perm_reservations_annuler: formData.get("perm_reservations_annuler") === "on",
      perm_journee_essai: formData.get("perm_journee_essai") === "on",
      perm_encaissements: formData.get("perm_encaissements") === "on",
      perm_tarifs_urgence: formData.get("perm_tarifs_urgence") === "on",
      perm_checkin: formData.get("perm_checkin") === "on",
      perm_box: formData.get("perm_box") === "on",
      perm_planning: formData.get("perm_planning") === "on",
      perm_timbrage_equipe: formData.get("perm_timbrage_equipe") === "on",
      perm_vacances_equipe: formData.get("perm_vacances_equipe") === "on",
    });

  if (profileError) throw new Error(profileError.message);

  // Relier une éventuelle fiche RH existante du même email (sans écraser un lien existant)
  await supabaseAdmin
    .from("employes_rh")
    .update({ profile_id: userId })
    .eq("email", email)
    .is("profile_id", null);

  redirect("/employes");
}