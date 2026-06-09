"use server";

import { redirect } from "next/navigation";
import { supabase } from "../../../../src/lib/supabase";

function calculerCategorie(poids: number): string {
  if (poids < 15) return "moins_15kg";
  if (poids <= 30) return "15_30kg";
  return "30_40kg";
}

export async function modifierChien(id: string, formData: FormData) {
  const poids = Number(formData.get("poids"));

  const { error } = await supabase
    .from("chiens")
    .update({
      nom: formData.get("nom"),
      race: formData.get("race"),
      couleur: formData.get("couleur"),
      poids,
      categorie_poids: calculerCategorie(poids),
      date_naissance: formData.get("date_naissance") || null,
      sexe: formData.get("sexe"),
      sterilise: formData.get("sterilise") === "true",
      numero_puce: formData.get("numero_puce"),
      niveau_energie: formData.get("niveau_energie"),
      allergies: formData.get("allergies"),
      traitements: formData.get("traitements"),
      veterinaire_nom: formData.get("veterinaire_nom"),
      veterinaire_telephone: formData.get("veterinaire_telephone"),
      comportement: formData.get("comportement"),
      comportement_autre: formData.get("comportement_autre") || null,
      protection_ressources: formData.get("protection_ressources") === "on",
      destructeur: formData.get("destructeur") === "on",
      craintif: formData.get("craintif") === "on",
      remarques: formData.get("remarques"),
      compatible_males_castres: formData.get("compatible_males_castres") === "on",
      compatible_males_entiers: formData.get("compatible_males_entiers") === "on",
      compatible_femelles_sterilisees: formData.get("compatible_femelles_sterilisees") === "on",
      compatible_femelles_entieres: formData.get("compatible_femelles_entieres") === "on",
      compatible_moins_15kg: formData.get("compatible_moins_15kg") === "on",
      compatible_15_30kg: formData.get("compatible_15_30kg") === "on",
      compatible_30_40kg: formData.get("compatible_30_40kg") === "on",
    })
    .eq("id", id);

  if (error) throw new Error(error.message);
  redirect(`/chiens/${id}`);
}