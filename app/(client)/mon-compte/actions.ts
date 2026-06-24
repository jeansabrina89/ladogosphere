"use server";

import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { revalidatePath } from "next/cache";
import { JOURS_PAR_CARTE, JOURS_PAYES, TYPES_ABONNEMENT } from "@/src/lib/abonnementsTypes";
import { estMembreActif } from "@/src/lib/membre";

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

export async function commanderAbonnement(categorie: string): Promise<{ ok?: boolean; error?: string }> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecte." };

  const { data: client } = await supabaseAdmin
    .from("clients")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!client) return { error: "Fiche client introuvable." };

  if (!TYPES_ABONNEMENT.some((t) => t.categorie === categorie)) {
    return { error: "Formule invalide." };
  }

  const membre = await estMembreActif(supabaseAdmin, client.id);
  if (!membre) return { error: "Reserve aux membres a jour de cotisation." };

  const { data: existant } = await supabaseAdmin
    .from("abonnements")
    .select("id")
    .eq("client_id", client.id)
    .eq("categorie", categorie)
    .eq("statut", "en_attente_paiement")
    .maybeSingle();
  if (existant) return { error: "Une commande est deja en attente pour cette formule." };

  const annee = new Date().getFullYear();
  const { data: tarifRow } = await supabaseAdmin
    .from("tarifs")
    .select("prix")
    .eq("categorie", categorie)
    .eq("membre", true)
    .eq("actif", true)
    .eq("annee", annee)
    .limit(1)
    .maybeSingle();
  if (!tarifRow) return { error: "Tarif introuvable." };

  const tarif_unitaire = Number(tarifRow.prix);
  const prix_paye = JOURS_PAYES * tarif_unitaire;
  const date_commande = new Date().toISOString().split("T")[0];

  const { error } = await supabaseAdmin.from("abonnements").insert({
    client_id: client.id,
    categorie,
    tarif_unitaire,
    prix_paye,
    jours_total: JOURS_PAR_CARTE,
    jours_offerts: 1,
    statut: "en_attente_paiement",
    date_commande,
  });
  if (error) return { error: error.message };

  revalidatePath("/mon-compte");
  revalidatePath("/mon-compte/abonnements");
  return { ok: true };
}
