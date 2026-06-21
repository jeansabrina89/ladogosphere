"use server";

import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { revalidatePath } from "next/cache";

export async function demanderAdhesion(mode: "virement" | "prochaine_resa") {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté." };

  const { data: client } = await supabaseAdmin
    .from("clients")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!client) return { error: "Fiche client introuvable." };

  const annee = new Date().getFullYear();

  const { data: existante } = await supabaseAdmin
    .from("cotisations_membres")
    .select("id")
    .eq("client_id", client.id)
    .eq("annee", annee)
    .maybeSingle();
  if (existante) return { error: "Une demande existe déjà pour cette année." };

  const { data: param } = await supabaseAdmin
    .from("parametres")
    .select("valeur")
    .eq("cle", "cotisation_montant")
    .maybeSingle();
  const montant = parseFloat(param?.valeur ?? "180") || 180;

  const { error } = await supabaseAdmin.from("cotisations_membres").insert({
    client_id: client.id,
    annee,
    montant,
    mode_paiement: mode,
    statut: "en_attente",
  });
  if (error) return { error: error.message };

  await supabaseAdmin.from("clients").update({ membre: true }).eq("id", client.id);

  revalidatePath("/mon-compte");
  revalidatePath("/mon-compte/tarifs");
  return { ok: true };
}
