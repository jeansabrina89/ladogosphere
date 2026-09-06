"use server";

import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { revalidatePath } from "next/cache";
import { JOURS_PAR_CARTE, JOURS_PAYES, TYPES_ABONNEMENT, cartesEligibles, type ChienSociabilite } from "@/src/lib/abonnementsTypes";
import { estMembreActif } from "@/src/lib/membre";
import { cotisationActive, cotisationEnAttente } from "@/src/lib/cotisation";
import { calculerPeriodeCotisation, joursEntre, JOURS_FENETRE_RENOUVELLEMENT } from "@/src/lib/cotisationPeriode";
import { aujourdhuiISO, formatDateLong } from "@/src/lib/dates";

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

  const aujourdhui = aujourdhuiISO();

  // Une seule demande en attente à la fois (garanti aussi par la base).
  const enAttente = await cotisationEnAttente(supabaseAdmin, client.id);
  if (enAttente) return { error: "Une demande d'adhésion est déjà en cours de traitement." };

  // Renouvellement autorisé dans les 60 derniers jours de validité, ou après
  // expiration. Au-delà, la cotisation en cours couvre encore largement.
  const active = await cotisationActive(supabaseAdmin, client.id, aujourdhui);
  if (active && joursEntre(aujourdhui, active.date_fin) > JOURS_FENETRE_RENOUVELLEMENT) {
    return {
      error: `Votre cotisation est valable jusqu'au ${formatDateLong(active.date_fin)}. Le renouvellement sera possible dans les ${JOURS_FENETRE_RENOUVELLEMENT} derniers jours.`,
    };
  }

  const { data: param } = await supabaseAdmin
    .from("parametres")
    .select("valeur")
    .eq("cle", "cotisation_montant")
    .maybeSingle();
  const montant = parseFloat(param?.valeur ?? "200") || 200;

  // Période PROVISOIRE (démarrant aujourd'hui) : recalculée à l'encaissement,
  // où la règle du renouvellement anticipé s'appliquera.
  const periode = calculerPeriodeCotisation(aujourdhui);

  const { error } = await supabaseAdmin.from("cotisations_membres").insert({
    client_id: client.id,
    montant,
    mode_paiement: mode,
    statut: "en_attente",
    date_debut: periode.date_debut,
    date_fin: periode.date_fin,
  });
  if (error) return { error: error.message };

  // Flag « membre » activé seulement si l'adhésion donne déjà accès à la
  // réservation (mode 'prochaine_resa' = groupée/activée). Une demande par
  // virement non encaissée ne bascule pas le flag (cohérent avec le droit à
  // réserver, cf. etatAdhesionReservation).
  if (mode === "prochaine_resa") {
    await supabaseAdmin.from("clients").update({ membre: true }).eq("id", client.id);
  }

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

  const { data: chiens } = await supabaseAdmin
    .from("chiens")
    .select("doit_etre_isole, actif")
    .eq("client_id", client.id);
  const eligibles = cartesEligibles((chiens ?? []) as ChienSociabilite[]);
  if (!eligibles.includes(categorie)) {
    return { error: "Cette formule ne correspond pas au profil de vos chiens." };
  }

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
