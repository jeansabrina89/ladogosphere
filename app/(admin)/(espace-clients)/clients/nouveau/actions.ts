"use server";

import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { verifierPermission } from "@/src/lib/verifierPermission";
import { messageErreurBase } from "@/src/lib/validationChien";
import {
  valeursFormulaire,
  type EtatFormulaire,
} from "@/src/lib/etatFormulaire";

/** Champs d'identité d'une fiche client : le refus nomme le champ fautif. */
function refusIdentiteClient(
  prenom: string,
  nom: string,
  email: string
): { champ: string; message: string } | null {
  if (!prenom.trim()) return { champ: "prenom", message: "Le prénom est obligatoire." };
  if (!nom.trim()) return { champ: "nom", message: "Le nom est obligatoire." };
  if (!email.trim()) return { champ: "email", message: "L'adresse e-mail est obligatoire." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
    return { champ: "email", message: "L'adresse e-mail n'est pas valide." };
  }
  return null;
}

/**
 * Crée la fiche, ou RENVOIE le refus : une exception de Server Action est
 * masquée en production, le message n'arriverait jamais à l'écran.
 */
export async function creerClient(
  _etat: EtatFormulaire,
  formData: FormData
): Promise<EtatFormulaire> {
  const valeurs = valeursFormulaire(formData);
  const refus = (message: string, champ?: string): EtatFormulaire => ({
    erreur: message,
    champ: champ ?? null,
    valeurs,
  });

  const verif = await verifierPermission("perm_clients_creer");
  if (verif.error) return refus(verif.error);

  const prenom = String(formData.get("prenom") ?? "").trim();
  const nomClient = String(formData.get("nom") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();

  const invalide = refusIdentiteClient(prenom, nomClient, email);
  if (invalide) return refus(invalide.message, invalide.champ);

  // Vérifier si un compte Auth existe déjà avec cet email
  let auth_user_id: string | null = null;
  if (email) {
    const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
    const authUser = authUsers?.users?.find(u => u.email === email);
    if (authUser) {
      auth_user_id = authUser.id;
    }
  }

  const { data: client, error } = await supabaseAdmin
    .from("clients")
    .insert({
      prenom,
      nom: nomClient,
      email: email || null,
      telephone: formData.get("telephone") as string || null,
      adresse: formData.get("adresse") as string || null,
      membre: formData.get("membre") === "on",
      actif: true,
      auth_user_id,
      photos_ok: formData.get("photos_ok") === "on",
      photos_ok_modifie_le: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return refus("Un client existe déjà avec cette adresse e-mail.", "email");
    }
    return refus(messageErreurBase(error));
  }

  // Si on a trouvé un compte Auth, s'assurer que son profil est bien "client"
  if (auth_user_id) {
    await supabaseAdmin
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
