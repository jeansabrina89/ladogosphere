"use server";

import { redirect } from "next/navigation";
import { createClient } from "../../../../src/utils/supabase/server";
import { supabaseAdmin } from "../../../../src/lib/supabase-admin";

export async function modifierEmploye(
  profil_id: string,
  rh_id: string | null,
  formData: FormData
) {
  const supabase = await createClient();
  const prenom = formData.get("prenom") as string;
  const nom = formData.get("nom") as string;
  const email = formData.get("email") as string;

  // Mettre à jour fiche RH
  if (rh_id) {
    await supabase
      .from("employes_rh")
      .update({
        prenom,
        nom,
        email,
        taux_travail: parseInt(formData.get("taux_travail") as string),
        salaire_base: parseFloat(formData.get("salaire_base") as string),
        date_entree: formData.get("date_entree") as string || null,
        actif: formData.get("actif") === "on",
        poste: formData.get("poste") as string || "Auxiliaire",
        poste_autre: formData.get("poste_autre") as string || null,
        adresse: formData.get("adresse") as string || null,
        telephone: formData.get("telephone") as string || null,
        numero_avs: formData.get("numero_avs") as string || null,
        date_naissance: formData.get("date_naissance") as string || null,
      })
      .eq("id", rh_id);
  }

  // Mettre à jour profil auth
  if (profil_id) {
    await supabase
      .from("profiles")
      .update({
        prenom,
        nom,
        email,
        telephone: formData.get("telephone") as string || null,
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
      .eq("id", profil_id);
  }

  // Changer le mot de passe si rempli
  const nouveau_mdp = formData.get("nouveau_mdp") as string;
  if (nouveau_mdp && nouveau_mdp.length >= 6 && profil_id) {
    await supabaseAdmin.auth.admin.updateUserById(profil_id, {
      password: nouveau_mdp,
    });
  }

  redirect("/employes");
}

export async function supprimerEmploye(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;
  await supabase.from("profiles").delete().eq("id", id);
  await supabaseAdmin.auth.admin.deleteUser(id);
  redirect("/employes");
}
