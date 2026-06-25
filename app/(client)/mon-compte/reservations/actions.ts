"use server";

import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { revalidatePath } from "next/cache";
import { envoyerEmailConfirmationDemande } from "@/src/lib/email";
import { consommerAbonnementResa } from "@/src/lib/consommationAbonnement";

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
    .select("id, email, prenom")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (ficheErr) return { ok: false, erreur: ficheErr.message };
  if (!fiche) return { ok: false, erreur: "Profil client introuvable." };

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
    .select("id, nom, journee_essai_effectuee, journee_essai_invalide")
    .eq("client_id", fiche.id)
    .in("id", input.chien_ids);
  if (chiensErr) return { ok: false, erreur: chiensErr.message };
  if (!chiensOwned || chiensOwned.length !== input.chien_ids.length) {
    return { ok: false, erreur: "Chien(s) invalide(s)." };
  }

  // 5. Gate essai — réutilise exactement la définition de /api/reservations/client
  //    Règle 1 : chien refusé → blocage systématique (toutes réservations)
  const chiensRefuses = chiensOwned.filter(
    (c: any) => c.journee_essai_effectuee && c.journee_essai_invalide
  );
  if (chiensRefuses.length > 0) {
    const nom = chiensRefuses[0].nom;
    return {
      ok: false,
      erreur:
        `${nom} n'a pas été accepté à l'issue de sa journée d'essai et ne peut donc ` +
        `pas faire l'objet d'une réservation. N'hésitez pas à nous contacter pour ` +
        `plus d'informations ou pour envisager une nouvelle journée d'essai.`,
    };
  }

  if (input.type_reservation === "essai") {
    // Règle 2 : essai inutile si tous les chiens sont déjà validés
    const tousValides = chiensOwned.every(
      (c: any) => c.journee_essai_effectuee && !c.journee_essai_invalide
    );
    if (tousValides) {
      return {
        ok: false,
        erreur:
          "Tous vos chiens ont déjà validé leur journée d'essai. " +
          "Veuillez choisir 'Journée' ou 'Séjour'.",
      };
    }
  } else {
    // Règle 3 : journée/séjour exige que TOUS les chiens sélectionnés aient validé l'essai
    const chiensNonValides = chiensOwned.filter(
      (c: any) => !c.journee_essai_effectuee
    );
    if (chiensNonValides.length > 0) {
      const noms = chiensNonValides.map((c: any) => c.nom).join(", ");
      const pluriel = chiensNonValides.length > 1;
      return {
        ok: false,
        erreur:
          `${noms} ${pluriel ? "doivent" : "doit"} d'abord valider ` +
          `${pluriel ? "leur" : "sa"} journée d'essai avant de pouvoir réserver ` +
          `une journée ou un séjour.`,
      };
    }
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
