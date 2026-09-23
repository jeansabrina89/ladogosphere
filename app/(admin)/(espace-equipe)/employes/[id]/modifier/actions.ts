"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/src/utils/supabase/server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { permissionsDepuisFormulaire } from "@/src/lib/permissionsCatalogue";
import { enregistrerInitiales } from "@/src/lib/auteursDb";
import { verifierAdmin } from "@/src/lib/permissions";


export async function modifierEmploye(
  profil_id: string,
  rh_id: string | null,
  formData: FormData
) {
  const verif = await verifierAdmin();
  if (verif.error) throw new Error(verif.error);

  // Les initiales d'abord : refusées, rien d'autre n'est enregistré, et le
  // formulaire revient avec la raison.
  const initialesProfilId = String(formData.get("initiales_profil_id") ?? "");
  const initiales = formData.get("initiales");
  if (initialesProfilId && typeof initiales === "string") {
    const res = await enregistrerInitiales(initialesProfilId, initiales);
    if (res.error) {
      redirect(`/employes/${profil_id}/modifier?erreur=${encodeURIComponent(res.error)}`);
    }
  }

  const supabase = await createClient();
  const prenom = formData.get("prenom") as string;
  const nom = formData.get("nom") as string;
  const email = formData.get("email") as string;

  // Mettre à jour fiche RH
  if (rh_id) {
    const poste = (formData.get("poste") as string) || "Auxiliaire";
    const estApprenti = poste === "Apprenti-e Gardien-ne d'animaux";
    const toNum = (v: FormDataEntryValue | null): number | null => {
      const str = ((v as string) ?? "").trim();
      return str === "" ? null : parseFloat(str);
    };

    const rhUpdate: Record<string, unknown> = {
      prenom,
      nom,
      email,
      taux_travail: parseInt(formData.get("taux_travail") as string),
      date_entree: (formData.get("date_entree") as string) || null,
      actif: formData.get("actif") === "on",
      poste,
      poste_autre: (formData.get("poste_autre") as string) || null,
      adresse: (formData.get("adresse") as string) || null,
      telephone: (formData.get("telephone") as string) || null,
      numero_avs: (formData.get("numero_avs") as string) || null,
      date_naissance: (formData.get("date_naissance") as string) || null,
    };

    if (estApprenti) {
      const sal1 = toNum(formData.get("salaire_annee_1"));
      const sal2 = toNum(formData.get("salaire_annee_2"));
      const sal3 = toNum(formData.get("salaire_annee_3"));
      const aRaw = parseInt((formData.get("annee_apprentissage") as string) || "1");
      const annee = aRaw === 2 || aRaw === 3 ? aRaw : 1;
      const jcRaw = parseInt((formData.get("jour_cours") as string) || "");
      const jourCours = jcRaw >= 1 && jcRaw <= 5 ? jcRaw : null;
      const salaireBase = (annee === 3 ? sal3 : annee === 2 ? sal2 : sal1) ?? 0;

      rhUpdate.salaire_annee_1 = sal1;
      rhUpdate.salaire_annee_2 = sal2;
      rhUpdate.salaire_annee_3 = sal3;
      rhUpdate.annee_apprentissage = annee;
      rhUpdate.jour_cours = jourCours;
      rhUpdate.salaire_base = salaireBase;
    } else {
      rhUpdate.salaire_base = toNum(formData.get("salaire_base")) ?? 0;
      rhUpdate.jour_cours = null;
      rhUpdate.annee_apprentissage = null;
    }

    await supabase.from("employes_rh").update(rhUpdate).eq("id", rh_id);
  }

  // Lier la fiche RH au compte via profile_id
  if (rh_id && profil_id) {
    await supabase
      .from("employes_rh")
      .update({ profile_id: profil_id })
      .eq("id", rh_id);
  }

  // Le profil s'écrit avec la clé de service, derrière la garde admin
  // ci-dessus : son trigger d'initiales appelle une fonction SQL, et ces
  // fonctions ne sont plus exécutables par le rôle d'un navigateur.
  if (profil_id) {
    const { data: avant } = await supabaseAdmin
      .from("profiles").select("actif").eq("id", profil_id).maybeSingle();
    const desactive = avant?.actif !== false && formData.get("actif") !== "on";

    await supabaseAdmin
      .from("profiles")
      .update({
        prenom,
        nom,
        email,
        telephone: formData.get("telephone") as string || null,
        actif: formData.get("actif") === "on",
        // Toutes les clés du catalogue, et elles seules : le formulaire les
        // affiche toutes, l'action les écrit toutes.
        ...permissionsDepuisFormulaire(formData),
      })
      .eq("id", profil_id);

    // Désactivé : ses sessions ouvertes se ferment. Les gardes (garde.ts) lui
    // refusent déjà tout au geste suivant ; sans ceci, son jeton de
    // rafraîchissement continuait de renouveler sa session.
    if (desactive) {
      await supabaseAdmin.rpc("revoquer_sessions", { p_user_id: profil_id });
    }
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
  const verif = await verifierAdmin();
  if (verif.error) throw new Error(verif.error);

  const id = formData.get("id") as string;
  await supabaseAdmin.from("profiles").delete().eq("id", id);
  await supabaseAdmin.auth.admin.deleteUser(id);
  redirect("/employes");
}
