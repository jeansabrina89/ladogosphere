"use server";

import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { revalidatePath } from "next/cache";
import { envoyerEmailConfirmationDemande } from "@/src/lib/email";
import { consommerAbonnementResa } from "@/src/lib/consommationAbonnement";
import { etatAdhesionReservation } from "@/src/lib/membre";
import { cotisationEnAttente } from "@/src/lib/cotisation";
import { verifierSelectionChiens } from "@/src/lib/journeeEssai";
import { typeAutorisePourPersonnel } from "@/src/lib/personnel";
import { verifierDateEssaiLibre } from "@/src/lib/essaiReservation";
import { creerReservationsPersonnel, annulerReservationPersonnel } from "@/src/lib/reservationPersonnel";
import { calculerPeriodeCotisation, formatPeriodeCotisation } from "@/src/lib/cotisationPeriode";
import { aujourdhuiISO } from "@/src/lib/dates";
import { peutReserverPension, MESSAGE_ESSAI_REQUIS, MESSAGE_ADHESION_A_REGLER } from "@/src/lib/adhesionReservation";

/**
 * Libellé de l'extra « adhésion » sur une réservation. La période posée à la
 * création est provisoire (recalculée à l'encaissement), on l'affiche quand
 * elle est connue pour que le client sache ce qu'il paie.
 */
function libelleExtraAdhesion(date_debut?: string | null, date_fin?: string | null): string {
  if (date_debut && date_fin) {
    return `Adhésion membre ${formatPeriodeCotisation(date_debut, date_fin)}`;
  }
  return "Adhésion membre";
}

// ---------------------------------------------------------------------------
// Types publics (consommés par le futur tunnel)
// ---------------------------------------------------------------------------

export type Occurrence = {
  date_debut: string; // YYYY-MM-DD
  date_fin: string;   // YYYY-MM-DD (identique à date_debut pour journée/essai)
};

export type InputDemandeReservation = {
  chien_ids: string[];
  type_reservation: "sejour" | "journee" | "essai";
  /** Liste pré-calculée par l'UI : 1 occurrence pour ponctuel, N pour récurrent. */
  occurrences: Occurrence[];
  heure_arrivee: string | null;
  heure_depart: string | null;
  commentaire_client: string | null;
};

export type ResultatDemande =
  | { ok: true; ids: string[] }
  | { ok: false; erreur: string };

// ---------------------------------------------------------------------------
// Server Action principale
// ---------------------------------------------------------------------------

export async function creerDemandeReservation(
  input: InputDemandeReservation
): Promise<ResultatDemande> {

  // 1. Authentification
  const supabaseServer = await createSupabaseServerClient();
  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) return { ok: false, erreur: "Non authentifié." };

  // 2. Fiche client liée à la session — client_id JAMAIS fourni par le formulaire
  const { data: fiche, error: ficheErr } = await supabaseServer
    .from("clients")
    .select("id, email, prenom, cotisation_exemptee, interne")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (ficheErr) return { ok: false, erreur: ficheErr.message };
  if (!fiche) return { ok: false, erreur: "Profil client introuvable." };
  const estInterne = !!(fiche as { interne?: boolean }).interne;

  // 3. Validation des inputs de base
  const TYPES_VALIDES = ["sejour", "journee", "essai"] as const;
  if (!TYPES_VALIDES.includes(input.type_reservation)) {
    return { ok: false, erreur: "Type de réservation invalide." };
  }
  if (input.chien_ids.length === 0) {
    return { ok: false, erreur: "Veuillez sélectionner au moins un chien." };
  }
  if (input.occurrences.length === 0) {
    return { ok: false, erreur: "Aucune date fournie." };
  }
  const aujourdhuiCH = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Zurich" });
  for (const occ of input.occurrences) {
    if (!occ.date_debut || !occ.date_fin) {
      return { ok: false, erreur: "Dates incomplètes dans la liste des occurrences." };
    }
    if (occ.date_debut < aujourdhuiCH) {
      return { ok: false, erreur: "La date de début ne peut pas être dans le passé." };
    }
  }

  // 4. Vérification d'ownership des chiens via RLS (lecture avec le client session)
  //    Le résultat ne contient QUE les chiens appartenant au client connecté.
  const { data: chiensOwned, error: chiensErr } = await supabaseServer
    .from("chiens")
    .select("id, nom, statut_essai")
    .eq("client_id", fiche.id)
    .in("id", input.chien_ids);
  if (chiensErr) return { ok: false, erreur: chiensErr.message };
  if (!chiensOwned || chiensOwned.length !== input.chien_ids.length) {
    return { ok: false, erreur: "Chien(s) invalide(s)." };
  }

  // 4bis. FICHE INTERNE (personnel) : chemin court et distinct — réservation
  //       gratuite, validée d'office, box attribué tout de suite, sans facture,
  //       sans adhésion, sans e-mail. Aucune journée d'essai n'est exigée : les
  //       chiens du personnel sont validés à leur création.
  if (estInterne) {
    if (!typeAutorisePourPersonnel(input.type_reservation)) {
      return { ok: false, erreur: "Le personnel réserve une journée ou un séjour, pas une journée d'essai." };
    }
    const res = await creerReservationsPersonnel({
      client_id: fiche.id,
      chien_ids: input.chien_ids,
      type_reservation: input.type_reservation,
      occurrences: input.occurrences,
      heure_arrivee: input.heure_arrivee,
      heure_depart: input.heure_depart,
      commentaire_client: input.commentaire_client,
    });
    if (!res.ok) return res;
    revalidatePath("/mon-compte");
    revalidatePath("/mon-compte/reservations");
    return { ok: true, ids: res.ids };
  }

  // 5. Gate essai, CHIEN PAR CHIEN (cf. src/lib/journeeEssai.ts) :
  //    - journée / séjour : chaque chien doit être 'valide' ;
  //    - essai : seulement les chiens 'non_programme' ou 'seconde_journee'.
  //    Le message nomme le chien qui bloque.
  const verdict = verifierSelectionChiens(
    chiensOwned as { nom: string; statut_essai: string | null }[],
    input.type_reservation
  );
  if (!verdict.ok) return { ok: false, erreur: verdict.message };

  // 5ter. Une seule journée d'essai par jour. Contrôle SERVEUR : le calendrier
  //       grise déjà les dates prises, mais la demande peut arriver autrement.
  if (input.type_reservation === "essai") {
    const datePrise = await verifierDateEssaiLibre(input.occurrences);
    if (datePrise) return { ok: false, erreur: datePrise };
  }

  // 5bis. Porte d'accès pension + décision de bundling de l'adhésion.
  //       Contrôle SERVEUR autoritatif (le gate de sécurité par-chien ci-dessus
  //       reste actif ; celui-ci s'AJOUTE au niveau client). Admin exclu : ce
  //       chemin est exclusivement client (session authentifiée).
  const dateRef = [...input.occurrences.map((o) => o.date_debut)].sort()[0];
  let bundlerAdhesion = false;
  if (input.type_reservation !== "essai") {
    // L'adhésion s'embarque dès qu'au moins UN chien du client est validé —
    // c'est ce qui ouvre l'accès à la pension, plus une réservation d'essai
    // terminée quelque part dans l'historique.
    const [etatAdh, essaiTermine] = await Promise.all([
      etatAdhesionReservation(supabaseAdmin, fiche.id, dateRef),
      supabaseAdmin
        .from("chiens")
        .select("id")
        .eq("client_id", fiche.id)
        .eq("statut_essai", "valide")
        .limit(1)
        .then(({ data }) => !!(data && data.length > 0)),
    ]);
    const decision = peutReserverPension({
      estMembreAJour: etatAdh.aJour,
      estExempte: !!(fiche as { cotisation_exemptee?: boolean }).cotisation_exemptee,
      essaiTermine,
      typeReservation: input.type_reservation,
      estAdmin: false,
      adhesionEnAttenteARegler: etatAdh.enAttenteARegler,
    });
    if (!decision.autorise) {
      return {
        ok: false,
        erreur: decision.raison === "adhesion_a_regler" ? MESSAGE_ADHESION_A_REGLER : MESSAGE_ESSAI_REQUIS,
      };
    }
    bundlerAdhesion = decision.bundlerAdhesion;
  }

  // 6. INSERT groupé : toutes les réservations en une seule requête
  const lignesReservations = input.occurrences.map((occ) => ({
    client_id: fiche.id,
    type_reservation: input.type_reservation,
    date_debut: occ.date_debut,
    date_fin: occ.date_fin,
    heure_arrivee: input.heure_arrivee || null,
    heure_depart: input.heure_depart || null,
    statut: "en_attente",
    commentaire_client: input.commentaire_client || null,
    urgence: false,
  }));

  const { data: reservationsCreees, error: errInsert } = await supabaseAdmin
    .from("reservations")
    .insert(lignesReservations)
    .select("id, date_debut, date_fin");

  if (errInsert || !reservationsCreees || reservationsCreees.length === 0) {
    return {
      ok: false,
      erreur: errInsert?.message ?? "Erreur lors de la création des réservations.",
    };
  }

  const reservationIds = (reservationsCreees as { id: string }[]).map((r) => r.id);

  // 7. INSERT groupé : toutes les liaisons chiens × réservations en une seule requête
  const lignesChiens = reservationIds.flatMap((reservation_id) =>
    input.chien_ids.map((chien_id) => ({ reservation_id, chien_id }))
  );

  const { error: errChiens } = await supabaseAdmin
    .from("reservation_chiens")
    .insert(lignesChiens);

  if (errChiens) {
    // Nettoyage : supprimer les réservations orphelines créées juste avant
    await supabaseAdmin
      .from("reservations")
      .delete()
      .in("id", reservationIds);
    return {
      ok: false,
      erreur:
        "Erreur lors de la liaison des chiens. " +
        "Les réservations créées ont été annulées automatiquement.",
    };
  }

  // 7bis. Bundling adhésion : 1ère pension d'un client non-membre non-exempté
  //       (essai terminé). Une seule demande en attente par client (garantie
  //       par l'index unique partiel), attachée à UNE seule réservation.
  //       La période posée ici est PROVISOIRE : elle est recalculée (12 mois
  //       glissants) par le trigger SQL au paiement de la réservation.
  if (bundlerAdhesion) {
    const resaPorteuse = reservationIds[0];
    const aujourdhui = aujourdhuiISO();

    const dejaEnAttente = await cotisationEnAttente(supabaseAdmin, fiche.id);

    if (!dejaEnAttente) {
      const { data: paramCotis } = await supabaseAdmin
        .from("parametres")
        .select("valeur")
        .eq("cle", "cotisation_montant")
        .maybeSingle();
      const montantAdhesion = parseFloat(paramCotis?.valeur ?? "200") || 200;
      const periode = calculerPeriodeCotisation(aujourdhui);

      const { data: cotisCreee } = await supabaseAdmin
        .from("cotisations_membres")
        .insert({
          client_id: fiche.id,
          montant: montantAdhesion,
          mode_paiement: "prochaine_resa", // affiché « Payé sur réservation »
          statut: "en_attente",
          reservation_id: resaPorteuse,
          date_debut: periode.date_debut,
          date_fin: periode.date_fin,
        })
        .select("id, date_debut, date_fin")
        .maybeSingle();

      // La ligne « Adhésion » n'est ajoutée au total QUE si la cotisation vient
      // d'être posée par CETTE requête (aucune adhésion préexistante).
      if (cotisCreee?.id) {
        await supabaseAdmin.from("reservation_extras").insert({
          reservation_id: resaPorteuse,
          libelle: libelleExtraAdhesion(cotisCreee.date_debut, cotisCreee.date_fin),
          montant: montantAdhesion,
        });
        // Membre à jour immédiatement.
        await supabaseAdmin.from("clients").update({ membre: true }).eq("id", fiche.id);
      }
    }
  }

  // 8. Email de confirmation — une seule fois pour tout le batch
  try {
    if (fiche.email) {
      const premiere = (reservationsCreees as { id: string; date_debut: string; date_fin: string }[])[0];
      const derniere = (reservationsCreees as { id: string; date_debut: string; date_fin: string }[])[reservationsCreees.length - 1];
      await envoyerEmailConfirmationDemande({
        email: fiche.email,
        prenom: fiche.prenom || "Client",
        date_debut: premiere.date_debut,
        date_fin: derniere.date_fin,
        type: input.type_reservation,
      });
    }
  } catch (e) {
    console.error("Erreur envoi email confirmation:", e);
  }

  return { ok: true, ids: reservationIds };
}

/**
 * Annulation par une fiche interne (personnel) de sa propre réservation,
 * jusqu'à la veille. Libère le box et le check-in ; il n'y a aucun frais.
 */
export async function annulerMaReservationInterne(
  reservationId: string
): Promise<{ ok?: boolean; error?: string }> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté." };

  const { data: fiche } = await supabaseAdmin
    .from("clients")
    .select("id, interne")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!fiche?.interne) return { error: "Réservé aux fiches du personnel." };

  const res = await annulerReservationPersonnel(reservationId, fiche.id);
  if (res.error) return res;

  revalidatePath("/mon-compte");
  revalidatePath("/mon-compte/reservations");
  return { ok: true };
}

export async function reglerReservationAvecAbonnement(
  reservationId: string
): Promise<{ ok?: boolean; error?: string }> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecte." };

  const { data: client } = await supabaseAdmin
    .from("clients")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!client) return { error: "Client introuvable." };

  const res = await consommerAbonnementResa(reservationId, client.id);
  if (res?.error) return res;

  revalidatePath(`/mon-compte/reservations/${reservationId}`);
  return {};
}
