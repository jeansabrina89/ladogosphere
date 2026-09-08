"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { inscrireAlerte, annulerAlerte } from "@/src/lib/alertesStock";
import { normaliserEmail } from "@/src/lib/alertesStockLogique";

/**
 * S'inscrire — ou se retirer — d'une alerte de retour en stock.
 *
 * Aucune donnée personnelle n'est demandée en plus : une adresse, un article,
 * rien d'autre. Un client connecté n'a même pas à la saisir.
 *
 * Un refus est RETOURNÉ, jamais lancé : une exception d'action serveur est
 * masquée en production, et la personne ne verrait rien.
 */

export type EtatAlerte = { erreur?: string | null; email?: string | null; message?: string | null };

/** L'adresse du compte connecté, s'il y en a un — jamais celle du formulaire. */
async function contexteClient(): Promise<{ clientId: string | null; email: string | null }> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { clientId: null, email: null };

  const { data } = await supabase
    .from("clients")
    .select("id, email")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  return {
    clientId: (data?.id as string) ?? null,
    email: normaliserEmail((data?.email as string) ?? user.email),
  };
}

export async function sInscrireAlerte(
  articleId: string,
  _etat: EtatAlerte,
  formData: FormData
): Promise<EtatAlerte> {
  const contexte = await contexteClient();

  // Connectée : c'est SON adresse, pas celle qu'un champ caché prétendrait.
  // Anonyme : celle qu'elle vient de saisir, et rien de plus.
  const email = contexte.email ?? normaliserEmail(formData.get("email") as string);

  const res = await inscrireAlerte({
    articleId,
    email,
    clientId: contexte.clientId,
  });
  if (res.error) return { erreur: res.error };

  revalidatePath(`/catalogue/${articleId}`);
  return {
    erreur: null,
    email: res.email ?? email,
    message: res.deja
      ? "Vous étiez déjà inscrit : vous serez prévenu."
      : "C'est noté : vous serez prévenu.",
  };
}

export async function annulerMonAlerte(
  articleId: string,
  _etat: EtatAlerte,
  formData: FormData
): Promise<EtatAlerte> {
  const contexte = await contexteClient();
  // Une personne connectée ne retire que la sienne ; une anonyme retire celle
  // dont elle vient de donner l'adresse, sur cet article-là seulement.
  const cible = contexte.email ?? normaliserEmail(formData.get("email") as string);
  if (!cible) return { erreur: "Aucune alerte à annuler." };

  const res = await annulerAlerte({ articleId, email: cible });
  if (res.error) return { erreur: res.error };

  revalidatePath(`/catalogue/${articleId}`);
  return { erreur: null, email: null, message: "Vous ne serez pas prévenu." };
}
