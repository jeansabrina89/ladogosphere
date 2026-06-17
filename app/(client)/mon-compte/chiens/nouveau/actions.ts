"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";

function calculerCategorie(poids: number): string {
  if (poids < 15) return "moins_15kg";
  if (poids <= 30) return "15_30kg";
  return "30_40kg";
}

export async function creerChienClient(client_id: string, formData: FormData) {
  const supabaseServer = await createSupabaseServerClient();

  // La session courante a-t-elle le droit de lire cette fiche ? (RLS)
  // client = uniquement la sienne ; admin = toutes. Sinon -> refus.
  const { data: fiche, error: verifErr } = await supabaseServer
    .from("clients")
    .select("id")
    .eq("id", client_id)
    .maybeSingle();

  if (verifErr) throw new Error("Vérification: " + verifErr.message);
  if (!fiche) throw new Error("Accès refusé à cette fiche client.");

  const nom = (formData.get("nom") as string || "").trim();
  const race = (formData.get("race") as string || "").trim();
  const couleur = (formData.get("couleur") as string || "").trim();
  const poids = formData.get("poids") ? Number(formData.get("poids")) : null;
  const sexe = (formData.get("sexe") as string || "").trim();
  const sterilisation = (formData.get("sterilisation") as string || "").trim();
  const numero_puce = (formData.get("numero_puce") as string || "").trim();

  if (!nom || !race || !couleur || !poids || !sexe || !["oui", "non", "chimique"].includes(sterilisation)) {
    throw new Error("Merci de remplir tous les champs obligatoires.");
  }

  const { error } = await supabaseAdmin
    .from("chiens")
    .insert({
      client_id: fiche.id,
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
    });

  if (error) throw new Error(error.message);
  redirect("/mon-compte");
}