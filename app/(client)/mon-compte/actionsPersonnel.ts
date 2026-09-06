"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { getEmployeRhActuel } from "@/src/lib/employeActuel";

export type ResultatFicheInterne = { ok: true; client_id: string } | { ok: false; error: string };

/**
 * Crée la fiche `clients` INTERNE d'un membre du personnel (employé ou admin).
 *
 * Le rattachement passe par `auth_user_id`, exactement comme pour un client.
 * Les coordonnées viennent de la fiche RH quand elle existe, sinon du profil.
 * La fiche est exemptée de cotisation, membre, et l'accord photos est posé —
 * il s'agit des chiens de la maison.
 */
export async function creerFicheInterne(): Promise<ResultatFicheInterne> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Non connecté." };

  // Le rôle fait autorité : cette action ne s'ouvre qu'au personnel.
  const { data: profil } = await supabaseAdmin
    .from("profiles")
    .select("id, role, email, prenom, nom")
    .eq("id", user.id)
    .maybeSingle();
  if (!profil || !["employe", "admin"].includes(profil.role ?? "")) {
    return { ok: false, error: "Réservé au personnel de la pension." };
  }

  // Idempotent : une fiche déjà liée à ce compte est renvoyée telle quelle.
  const { data: existante } = await supabaseAdmin
    .from("clients")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (existante) return { ok: true, client_id: existante.id };

  const employe = await getEmployeRhActuel(supabaseAdmin, user.id, profil.email);

  const prenom = (employe?.prenom || profil.prenom || "").trim() || "Personnel";
  const nom = (employe?.nom || profil.nom || "").trim() || "La Dogosphère";
  const email = (employe?.email || profil.email || user.email || "").trim().toLowerCase();
  const telephone = (employe?.telephone || "").trim() || null;

  if (!email) return { ok: false, error: "Aucune adresse e-mail sur votre compte." };

  const { data: creee, error } = await supabaseAdmin
    .from("clients")
    .insert({
      prenom,
      nom,
      email,
      telephone,
      auth_user_id: user.id,
      actif: true,
      interne: true,
      cotisation_exemptee: true,
      cotisation_exemptee_raison: "Personnel de la pension",
      membre: true,
      photos_ok: true,
      photos_ok_modifie_le: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "Une fiche client existe déjà avec cette adresse e-mail. Contactez l'administratrice." };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/mon-compte");
  return { ok: true, client_id: creee.id };
}
