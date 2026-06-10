"use server";

import { redirect } from "next/navigation";
import { createClient } from "../../../../src/utils/supabase/server";
import { supabaseAdmin } from "../../../../src/lib/supabase-admin";

function calculerCategorie(poids: number): string {
  if (poids < 15) return "moins_15kg";
  if (poids <= 30) return "15_30kg";
  return "30_40kg";
}

export async function creerChienClient(client_id: string, formData: FormData) {
  // 1. Identifier l'utilisateur connecté (session via cookies)
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");

  // 2. Vérifier que ce client appartient bien à l'utilisateur connecté
  const { data: monClient } = await supabaseAdmin
    .from("clients")
    .select("id")
    .eq("id", client_id)
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!monClient) throw new Error("Accès refusé : ce client ne vous appartient pas.");

  // 3. Insérer via supabaseAdmin, uniquement les champs de base
  const poids = formData.get("poids") ? Number(formData.get("poids")) : null;

  const { error } = await supabaseAdmin
    .from("chiens")
    .insert({
      client_id: monClient.id,
      nom: formData.get("nom") as string,
      race: formData.get("race") as string || null,
      couleur: formData.get("couleur") as string || null,
      poids,
      categorie_poids: poids ? calculerCategorie(poids) : null,
      date_naissance: formData.get("date_naissance") as string || null,
      sexe: formData.get("sexe") as string || null,
      sterilise: formData.get("sterilise") === "true",
      numero_puce: formData.get("numero_puce") as string || null,
      allergies: formData.get("allergies") as string || null,
      traitements: formData.get("traitements") as string || null,
      remarques: formData.get("remarques") as string || null,
    });

  if (error) throw new Error(error.message);
  redirect("/mon-compte");
}