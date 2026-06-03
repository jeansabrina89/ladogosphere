"use server";

import { redirect } from "next/navigation";
import { supabase } from "../../../src/lib/supabase";
import { supabaseAdmin } from "../../../src/lib/supabase-admin";

export async function creerClient(formData: FormData) {
  const email = formData.get("email") as string;

  // Vérifier si un compte Auth existe déjà avec cet email
  let auth_user_id: string | null = null;
  if (email) {
    const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
    const authUser = authUsers?.users?.find(u => u.email === email);
    if (authUser) {
      auth_user_id = authUser.id;
    }
  }

  const { data: client, error } = await supabase
    .from("clients")
    .insert({
      prenom: formData.get("prenom") as string,
      nom: formData.get("nom") as string,
      email: email || null,
      telephone: formData.get("telephone") as string || null,
      adresse: formData.get("adresse") as string || null,
      membre: formData.get("membre") === "on",
      actif: true,
      auth_user_id,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new Error("Un client avec cette adresse email existe déjà.");
    }
    throw new Error(error.message);
  }

  // Si on a trouvé un compte Auth, s'assurer que son profil est bien "client"
  if (auth_user_id) {
    await supabase
      .from("profiles")
      .upsert({
        id: auth_user_id,
        email,
        role: "client",
        actif: true,
      });
  }

  redirect("/clients");
}