import { supabaseAdmin } from "@/src/lib/supabase-admin";
import {
  boxPourPersonnel,
  champsReservationPersonnel,
  MESSAGE_AUCUN_BOX,
} from "@/src/lib/personnel";
import { suggererBox, boxesInternesLibres, fichesInternesQuiTravaillent } from "@/src/lib/suggestionBox";

export type OccurrencePersonnel = { date_debut: string; date_fin: string };

export type ResultatReservationPersonnel =
  | { ok: true; ids: string[] }
  | { ok: false; erreur: string };

/**
 * Crée les réservations d'une fiche INTERNE (personnel).
 *
 * Elles sont validées d'office, gratuites, sans facture ni adhésion ni e-mail,
 * et le box est attribué DÈS LA CRÉATION (le personnel ne passe pas par la
 * validation admin). occupation_boxes et checkin_checkout sont posés comme le
 * fait la création côté personnel. Si aucun box n'est libre, on refuse : jamais
 * de surbooking.
 */
export async function creerReservationsPersonnel({
  client_id,
  chien_ids,
  type_reservation,
  occurrences,
  heure_arrivee,
  heure_depart,
  commentaire_client,
}: {
  client_id: string;
  chien_ids: string[];
  type_reservation: string;
  occurrences: OccurrencePersonnel[];
  heure_arrivee: string | null;
  heure_depart: string | null;
  commentaire_client?: string | null;
}): Promise<ResultatReservationPersonnel> {
  const champs = champsReservationPersonnel();
  const idsCrees: string[] = [];

  for (const occ of occurrences) {
    // 1. Où placer les chiens ce jour-là ?
    const [internesLibres, presents, suggestionClient] = await Promise.all([
      boxesInternesLibres({
        date_debut: occ.date_debut, date_fin: occ.date_fin,
        heure_arrivee, heure_depart, type_reservation,
      }),
      fichesInternesQuiTravaillent(occ.date_debut),
      suggererBox({
        chien_ids, date_debut: occ.date_debut, date_fin: occ.date_fin,
        heure_arrivee, heure_depart, type_reservation,
      }),
    ]);

    const decision = boxPourPersonnel({
      ficheClientId: client_id,
      boxesInternes: internesLibres,
      proprietairesPresents: presents,
      boxClientDisponible: suggestionClient.box_id,
    });

    if (!decision.box_id) {
      // Ne rien laisser à moitié créé.
      if (idsCrees.length > 0) await annulerReservations(idsCrees);
      return { ok: false, erreur: `${MESSAGE_AUCUN_BOX} (${occ.date_debut})` };
    }

    // 2. La réservation elle-même.
    const { data: resa, error: errResa } = await supabaseAdmin
      .from("reservations")
      .insert({
        client_id,
        type_reservation,
        date_debut: occ.date_debut,
        date_fin: occ.date_fin,
        heure_arrivee: heure_arrivee || null,
        heure_depart: heure_depart || null,
        box_id: decision.box_id,
        commentaire_client: commentaire_client || null,
        urgence: false,
        ...champs,
      })
      .select("id")
      .single();

    if (errResa || !resa) {
      if (idsCrees.length > 0) await annulerReservations(idsCrees);
      return { ok: false, erreur: errResa?.message ?? "Erreur lors de la création de la réservation." };
    }
    idsCrees.push(resa.id);

    // 3. Chiens, occupations et check-in — comme la création côté personnel.
    const { error: errLiens } = await supabaseAdmin
      .from("reservation_chiens")
      .insert(chien_ids.map((chien_id) => ({ reservation_id: resa.id, chien_id })));
    if (errLiens) {
      await annulerReservations(idsCrees);
      return { ok: false, erreur: errLiens.message };
    }

    await supabaseAdmin.from("occupation_boxes").insert(
      chien_ids.map((chien_id) => ({
        box_id: decision.box_id,
        chien_id,
        reservation_id: resa.id,
        date_debut: occ.date_debut,
        date_fin: occ.date_fin,
      }))
    );

    await supabaseAdmin.from("checkin_checkout").insert(
      chien_ids.map((chien_id) => ({
        reservation_id: resa.id,
        chien_id,
        date_arrivee_prevue: `${occ.date_debut}T${(heure_arrivee || "09:00").slice(0, 5)}:00`,
        date_depart_prevu: `${occ.date_fin}T${(heure_depart || "17:00").slice(0, 5)}:00`,
        statut: "attendu",
      }))
    );
  }

  return { ok: true, ids: idsCrees };
}

/** Supprime des réservations à demi créées (et tout ce qui en dépend). */
async function annulerReservations(ids: string[]): Promise<void> {
  await supabaseAdmin.from("checkin_checkout").delete().in("reservation_id", ids);
  await supabaseAdmin.from("occupation_boxes").delete().in("reservation_id", ids);
  await supabaseAdmin.from("reservation_chiens").delete().in("reservation_id", ids);
  await supabaseAdmin.from("reservations").delete().in("id", ids);
}

/**
 * Annulation par la fiche interne elle-même : libère le box et le check-in.
 * Possible jusqu'à la veille (il n'y a pas de frais à retenir).
 */
export async function annulerReservationPersonnel(
  reservationId: string,
  client_id: string
): Promise<{ ok?: boolean; error?: string }> {
  const { data: resa } = await supabaseAdmin
    .from("reservations")
    .select("id, client_id, date_debut, statut")
    .eq("id", reservationId)
    .maybeSingle();

  if (!resa || resa.client_id !== client_id) return { error: "Réservation introuvable." };
  if (resa.statut === "annulee") return { ok: true };

  const aujourdhui = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Zurich" });
  if (resa.date_debut <= aujourdhui) {
    return { error: "Cette réservation commence aujourd'hui : contactez la pension pour l'annuler." };
  }

  const { error } = await supabaseAdmin
    .from("reservations")
    .update({ statut: "annulee", box_id: null })
    .eq("id", reservationId);
  if (error) return { error: error.message };

  await supabaseAdmin.from("occupation_boxes").delete().eq("reservation_id", reservationId);
  await supabaseAdmin.from("checkin_checkout").delete().eq("reservation_id", reservationId);

  return { ok: true };
}
