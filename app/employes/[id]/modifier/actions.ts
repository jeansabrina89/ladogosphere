"use server";

import { redirect } from "next/navigation";
import { supabase } from "../../../../src/lib/supabase";
import { supabaseAdmin } from "../../../../src/lib/supabase-admin";

export async function modifierEmploye(id: string, formData: FormData) {
  const { error } = await supabase
    .from("profiles")
    .update({
      prenom: formData.get("prenom") as string,
      nom: formData.get("nom") as string,
      actif: formData.get("actif") === "on",
      perm_checkin: formData.get("perm_checkin") === "on",
      perm_reservations_creer: formData.get("perm_reservations_creer") === "on",
      perm_reservations_modifier: formData.get("perm_reservations_modifier") === "on",
      perm_reservations_annuler: formData.get("perm_reservations_annuler") === "on",
      perm_clients_creer: formData.get("perm_clients_creer") === "on",
      perm_clients_modifier: formData.get("perm_clients_modifier") === "on",
      perm_chiens_modifier: formData.get("perm_chiens_modifier") === "on",
      perm_planning: formData.get("perm_planning") === "on",
      perm_tarifs_urgence: formData.get("perm_tarifs_urgence") === "on",
    })
    .eq("id", id);

  if (error) throw new Error(error.message);

  // Changer le mot de passe si rempli
  const nouveau_mdp = formData.get("nouveau_mdp") as string;
  if (nouveau_mdp && nouveau_mdp.length >= 6) {
    const { error: mdpError } = await supabaseAdmin.auth.admin.updateUserById(id, {
      password: nouveau_mdp,
    });
    if (mdpError) throw new Error(mdpError.message);
  }

  redirect("/employes");
}

export async function supprimerEmploye(formData: FormData) {
  const id = formData.get("id") as string;

  // Supprimer le profil
  await supabase.from("profiles").delete().eq("id", id);

  // Supprimer le compte Auth
  await supabaseAdmin.auth.admin.deleteUser(id);

  redirect("/employes");
}