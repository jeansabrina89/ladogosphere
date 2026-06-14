"use server";

import { redirect } from "next/navigation";
import { supabaseAdmin } from "../../../src/lib/supabase-admin";
import { verifierPermission } from "../../../src/lib/verifierPermission";

function calculerCategorie(poids: number): string {
  if (poids < 15) return "moins_15kg";
  if (poids <= 30) return "15_30kg";
  return "30_40kg";
}

export async function creerChien(formData: FormData) {
  const verif = await verifierPermission("perm_chiens_creer");
  if (verif.error) throw new Error(verif.error);

  const client_id = formData.get("client_id") as string;
  const nom = formData.get("nom") as string;
  const race = formData.get("race") as string;
  const couleur = formData.get("couleur") as string;
  const poids = Number(formData.get("poids"));
  const dateNaissanceValue = formData.get("date_naissance") as string;
  const date_naissance = dateNaissanceValue || null;
  const sexe = formData.get("sexe") as string;
  const sterilisationRaw = formData.get("sterilisation") as string;
  const sterilisation = ["oui", "non", "chimique"].includes(sterilisationRaw) ? sterilisationRaw : "non";
  const sterilise = sterilisation === "oui";
  const numero_puce = formData.get("numero_puce") as string;
  const niveau_energie = formData.get("niveau_energie") as string;
  const allergies = formData.get("allergies") as string;
  const traitements = formData.get("traitements") as string;
  const comportement = formData.get("comportement") as string;
  const comportement_autre = formData.get("comportement_autre") as string || null;
  const protection_ressources = formData.get("protection_ressources") === "on";
  const destructeur = formData.get("destructeur") === "on";
  const craintif = formData.get("craintif") === "on";
  const remarques = formData.get("remarques") as string;
  const categorie_poids = calculerCategorie(poids);

  const { error } = await supabaseAdmin
    .from("chiens")
    .insert({
      client_id,
      nom,
      race,
      couleur,
      poids,
      categorie_poids,
      date_naissance,
      sexe,
      sterilisation,
      sterilise,
      numero_puce,
      niveau_energie,
      allergies,
      traitements,
      comportement,
      comportement_autre,
      protection_ressources,
      destructeur,
      craintif,
      remarques,
      compatible_males_castres: formData.get("compatible_males_castres") === "on",
      compatible_males_entiers: formData.get("compatible_males_entiers") === "on",
      compatible_femelles_sterilisees: formData.get("compatible_femelles_sterilisees") === "on",
      compatible_femelles_entieres: formData.get("compatible_femelles_entieres") === "on",
      compatible_moins_15kg: formData.get("compatible_moins_15kg") === "on",
      compatible_15_30kg: formData.get("compatible_15_30kg") === "on",
      compatible_30_40kg: formData.get("compatible_30_40kg") === "on",
      doit_etre_isole: formData.get("doit_etre_isole") === "on",
    });

  if (error) throw new Error(error.message);
  redirect("/chiens");
}
