"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/src/lib/supabase-admin";

// Page publique : aucune session. Tout passe par supabaseAdmin, et la seule
// clé d'entrée est le jeton reçu dans l'e-mail — jamais une adresse saisie.

const TOKEN_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type EtatDesinscription = "inconnu" | "abonne" | "desabonne";

/**
 * État du lien, sans rien révéler : un jeton inconnu et un jeton valide se
 * distinguent, mais aucune donnée personnelle ne sort d'ici.
 */
export async function lireEtat(token: string | undefined): Promise<EtatDesinscription> {
  if (!token || !TOKEN_UUID.test(token)) return "inconnu";

  const { data } = await supabaseAdmin
    .from("clients")
    .select("emails_info_ok")
    .eq("desinscription_token", token)
    .maybeSingle();

  if (!data) return "inconnu";
  return data.emails_info_ok === false ? "desabonne" : "abonne";
}

async function definirConsentement(token: string, valeur: boolean): Promise<void> {
  if (!TOKEN_UUID.test(token)) return;

  await supabaseAdmin
    .from("clients")
    .update({ emails_info_ok: valeur, emails_info_modifie_le: new Date().toISOString() })
    .eq("desinscription_token", token);

  revalidatePath("/desinscription");
}

/** Confirmée d'un clic depuis la page — jamais depuis le lien lui-même. */
export async function seDesinscrire(formData: FormData): Promise<void> {
  await definirConsentement(String(formData.get("t") ?? ""), false);
}

export async function seReabonner(formData: FormData): Promise<void> {
  await definirConsentement(String(formData.get("t") ?? ""), true);
}
