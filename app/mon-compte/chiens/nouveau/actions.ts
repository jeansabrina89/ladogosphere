"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../../../../src/lib/supabase-server";
import { supabaseAdmin } from "../../../../src/lib/supabase-admin";

function calculerCategorie(poids: number): string {
  if (poids < 15) return "moins_15kg";
  if (poids <= 30) return "15_30kg";
  return "30_40kg";
}

export async function creerChienClient(_client_id: string, formData: FormData) {
  const supabaseServer = await createSupabaseServerClient();
  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) throw new Error("Non authentifié");

  // Source de vérité = la session, pas l'argument transmis
  const { data: monClient } = await supabaseAdmin
    .from("clients")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!monClient) throw new Error(`Profil client introuvable (user ${user.id})`);

  const nom = (formData.get("nom") as string || "").trim();
  const race = (formData.get("race") as string || "").trim();
  const couleur = (formData.get("couleur") as string || "").trim();
  const poids = formData.get("poids") ? Number(formData.get("poids")) : null;
  const sexe = (formData.get("sexe") as string || "").trim();
  const steriliseRaw = formData.get("sterilise") as string;

  if (!nom || !race || !couleur || !poids || !sexe || (steriliseRaw !== "true" && steriliseRaw !== "false")) {
    throw new Error("Merci de remplir tous les champs obligatoires.");
  }

  const { error } = await supabaseAdmin
    .from("chiens")
    .insert({
      client_id: monClient.id,
      nom,
      race,
      couleur,
      poids,
      categorie_poids: calculerCategorie(poids),
      sexe,
      sterilise: steriliseRaw === "true",
      date_naissance: formData.get("date_naissance") as string || null,
      numero_puce: formData.get("numero_puce") as string || null,
      allergies: formData.get("allergies") as string || null,
      traitements: formData.get("traitements") as string || null,
      remarques: formData.get("remarques") as string || null,
    });

  if (error) throw new Error(error.message);
  redirect("/mon-compte");
}