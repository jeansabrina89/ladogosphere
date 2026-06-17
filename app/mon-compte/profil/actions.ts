"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";

export async function modifierProfil(_id: string, formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");

  // Source de vérité = ta session : on récupère TA fiche client (RLS)
  const { data: monClient } = await supabase
    .from("clients")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!monClient) throw new Error("Profil client introuvable.");

  // Mise à jour via supabaseAdmin — UNIQUEMENT les champs de contact (liste blanche)
  const { error } = await supabaseAdmin
    .from("clients")
    .update({
      prenom: formData.get("prenom") as string,
      nom: formData.get("nom") as string,
      telephone: formData.get("telephone") as string || null,
      adresse: formData.get("adresse") as string || null,
      contact_urgence_prenom: formData.get("contact_urgence_prenom") as string || null,
      contact_urgence_nom: formData.get("contact_urgence_nom") as string || null,
      contact_urgence_telephone: formData.get("contact_urgence_telephone") as string || null,
    })
    .eq("id", monClient.id);

  if (error) throw new Error(error.message);
  redirect("/mon-compte");
}