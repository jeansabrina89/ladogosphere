"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../../../../../src/lib/supabase-server";
import { supabaseAdmin } from "../../../../../src/lib/supabase-admin";

function calculerCategorie(poids: number): string {
  if (poids < 15) return "moins_15kg";
  if (poids <= 30) return "15_30kg";
  return "30_40kg";
}

export async function modifierChienClient(chien_id: string, formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");

  // Vérifie via la session (RLS) que ce chien t'appartient
  const { data: chien } = await supabase
    .from("chiens")
    .select("id")
    .eq("id", chien_id)
    .maybeSingle();

  if (!chien) throw new Error("Accès refusé à ce chien.");

  const nom = (formData.get("nom") as string || "").trim();
  const race = (formData.get("race") as string || "").trim();
  const couleur = (formData.get("couleur") as string || "").trim();
  const poids = formData.get("poids") ? Number(formData.get("poids")) : null;
  const sexe = (formData.get("sexe") as string || "").trim();
  const sterilisation = (formData.get("sterilisation") as string || "").trim();
  const numero_puce = (formData.get("numero_puce") as string || "").trim();

  if (!nom || !race || !couleur || !poids || !sexe || !["oui", "non", "chimique"].includes(sterilisation) || !numero_puce) {
    throw new Error("Merci de remplir tous les champs obligatoires.");
  }

  // Mise à jour via supabaseAdmin — UNIQUEMENT les champs de base/santé (liste blanche)
  const { error } = await supabaseAdmin
    .from("chiens")
    .update({
      nom,
      race,
      couleur,
      poids,
      categorie_poids: calculerCategorie(poids),
      sexe,
      sterilisation,
      sterilise: sterilisation === "oui",
      date_naissance: formData.get("date_naissance") as string || null,
      numero_puce: numero_puce || null,
      allergies: formData.get("allergies") as string || null,
      traitements: formData.get("traitements") as string || null,
      remarques: formData.get("remarques") as string || null,
    })
    .eq("id", chien.id);

  if (error) throw new Error(error.message);
  redirect(`/mon-compte/chiens/${chien.id}`);
}