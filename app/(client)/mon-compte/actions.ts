"use server";

import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { revalidatePath } from "next/cache";
import { JOURS_PAR_CARTE, estEnVente, prixCarte, refusCarte, type ChienSociabilite } from "@/src/lib/abonnementsTypes";
import { estMembreActif } from "@/src/lib/membre";
import { cotisationActive, cotisationEnAttente } from "@/src/lib/cotisation";
import { calculerPeriodeCotisation, joursEntre, JOURS_FENETRE_RENOUVELLEMENT } from "@/src/lib/cotisationPeriode";
import { aujourdhuiISO, formatDateLong } from "@/src/lib/dates";
import { tracerEvenement } from "@/src/lib/journalEvenements";

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
      error: `Votre adhésion est valable jusqu'au ${formatDateLong(active.date_fin)}. Le renouvellement sera possible dans les ${JOURS_FENETRE_RENOUVELLEMENT} derniers jours.`,
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

  const { data: cotisCreee, error } = await supabaseAdmin.from("cotisations_membres").insert({
    client_id: client.id,
    montant,
    mode_paiement: mode,
    statut: "en_attente",
    date_debut: periode.date_debut,
    date_fin: periode.date_fin,
  }).select("id").maybeSingle();
  if (error) return { error: error.message };

  // Flag « membre » activé seulement si l'adhésion donne déjà accès à la
  // réservation (mode 'prochaine_resa' = groupée/activée). Une demande par
  // virement non encaissée ne bascule pas le flag (cohérent avec le droit à
  // réserver, cf. etatAdhesionReservation).
  if (mode === "prochaine_resa") {
    await supabaseAdmin.from("clients").update({ membre: true }).eq("id", client.id);
  }

  await tracerEvenement({
    entite: "client", entiteId: client.id, evenement: "adhesion_demandee",
    apres: { cotisation_id: cotisCreee?.id ?? null, montant, mode_paiement: mode, membre: mode === "prochaine_resa" },
    userId: user.id,
  });

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

  // APP 72 — seules les cartes EN VENTE s'achètent : « 3 chiens ensemble »
  // ne se vend plus, même si l'app sait encore la nommer.
  if (!estEnVente(categorie)) {
    return { error: refusCarte(categorie, []) ?? "Formule invalide." };
  }

  const membre = await estMembreActif(supabaseAdmin, client.id);
  if (!membre) return { error: "Réservé aux membres à jour d'adhésion." };

  const { data: chiens } = await supabaseAdmin
    .from("chiens")
    .select("doit_etre_isole, actif")
    .eq("client_id", client.id);
  // La même règle que l'écran et que la confirmation par l'équipe.
  const refus = refusCarte(categorie, (chiens ?? []) as ChienSociabilite[]);
  if (refus) return { error: refus };

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
  const prix_paye = prixCarte(tarif_unitaire);
  const date_commande = new Date().toISOString().split("T")[0];

  const { data: aboCree, error } = await supabaseAdmin.from("abonnements").insert({
    client_id: client.id,
    categorie,
    tarif_unitaire,
    prix_paye,
    jours_total: JOURS_PAR_CARTE,
    jours_offerts: 1,
    statut: "en_attente_paiement",
    date_commande,
  }).select("id").single();
  if (error) return { error: error.message };

  await tracerEvenement({
    entite: "abonnement", entiteId: aboCree.id, evenement: "abonnement_commande",
    apres: { client_id: client.id, categorie, prix_paye },
    userId: user.id,
  });

  revalidatePath("/mon-compte");
  revalidatePath("/mon-compte/abonnements");
  return { ok: true };
}
