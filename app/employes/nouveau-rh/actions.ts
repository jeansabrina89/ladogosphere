"use server";

import { redirect } from "next/navigation";
import { supabase } from "../../../src/lib/supabase";

export async function creerEmployeRH(formData: FormData) {
  const { error } = await supabase
    .from("employes_rh")
    .insert({
      prenom: formData.get("prenom") as string,
      nom: formData.get("nom") as string,
      email: formData.get("email") as string,
      taux_travail: parseInt(formData.get("taux_travail") as string),
      salaire_base: parseFloat(formData.get("salaire_base") as string),
      date_entree: formData.get("date_entree") as string,
      actif: formData.get("actif") === "on",
    });

  if (error) throw new Error(error.message);
  redirect("/employes");
}