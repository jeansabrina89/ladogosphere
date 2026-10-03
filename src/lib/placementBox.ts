import { supabaseAdmin } from "@/src/lib/supabase-admin";

/**
 * APP 73 (point 19, signalé par APP 74) — déplacer les chiens d'une
 * réservation dans un box, TOUT OU RIEN.
 *
 * Avant : la modification d'une réservation enregistrait ses champs, retirait
 * l'ancienne place, puis tentait la nouvelle. Quand le filet en base
 * (`bloquer_surbooking_box`) refusait, la réservation restait SANS box et ses
 * autres changements étaient déjà écrits.
 *
 * Maintenant, deux temps :
 *  1. `conflitPlacement` regarde, SANS RIEN ÉCRIRE, si le box est libre selon
 *     la même règle que le filet (autre client, ou une des deux réservations
 *     occupe le box entier : box_seul ou chien « doit être isolé » ; un
 *     passage de relais le même jour reste permis). Refus → rien n'est écrit.
 *  2. `deplacerOccupations` fait l'échange ; si la base refuse quand même (une
 *     autre écriture passée entre les deux), l'ancienne place est REMISE telle
 *     qu'elle était, ligne pour ligne, et l'erreur de la base remonte.
 */

/** Le texte du filet en base, mot pour mot (migration app74_reservation_box_seul). */
export const MESSAGE_BOX_OCCUPE =
  "Ce box est déjà occupé sur des dates qui se chevauchent (autre client, ou chien seul dans son box). Choisissez un autre box ou d'autres dates.";

type Chiens = { chiens?: { doit_etre_isole?: boolean | null } | { doit_etre_isole?: boolean | null }[] | null }[] | null;

function unChienIsole(liens: Chiens | undefined): boolean {
  return (liens ?? []).some((l) => {
    const c = Array.isArray(l.chiens) ? l.chiens : [l.chiens];
    return c.some((x) => x?.doit_etre_isole === true);
  });
}

/**
 * Le box est-il libre pour cette réservation, sur ces dates, avec cette case
 * « box seul » ? Rend le message du refus, ou null. Ne lit que ; n'écrit rien.
 */
export async function conflitPlacement(p: {
  reservationId: string;
  boxId: string;
  dateDebut: string;
  dateFin: string;
  boxSeul: boolean;
}): Promise<string | null> {
  const [{ data: resa }, { data: occupations }] = await Promise.all([
    supabaseAdmin
      .from("reservations")
      .select("client_id, reservation_chiens (chiens (doit_etre_isole))")
      .eq("id", p.reservationId)
      .maybeSingle(),
    // Chevauchement STRICT, comme le filet : un départ et une arrivée le même
    // jour ne se gênent pas.
    supabaseAdmin
      .from("occupation_boxes")
      .select("reservation_id, reservations (client_id, box_seul, reservation_chiens (chiens (doit_etre_isole)))")
      .eq("box_id", p.boxId)
      .neq("reservation_id", p.reservationId)
      .lt("date_debut", p.dateFin)
      .gt("date_fin", p.dateDebut),
  ]);

  const seuleNouvelle = p.boxSeul || unChienIsole((resa as { reservation_chiens?: Chiens } | null)?.reservation_chiens);
  const client = (resa as { client_id?: string | null } | null)?.client_id ?? null;

  const conflit = ((occupations ?? []) as { reservations?: unknown }[]).some((o) => {
    const r2 = (Array.isArray(o.reservations) ? o.reservations[0] : o.reservations) as
      { client_id?: string | null; box_seul?: boolean | null; reservation_chiens?: Chiens } | null;
    return (r2?.client_id ?? null) !== client
      || seuleNouvelle
      || r2?.box_seul === true
      || unChienIsole(r2?.reservation_chiens);
  });
  return conflit ? MESSAGE_BOX_OCCUPE : null;
}

type Occupation = {
  id: string; box_id: string | null; chien_id: string | null; reservation_id: string;
  date_debut: string; date_fin: string; created_at: string | null;
};

/**
 * Remplace les occupations de la réservation par celles du nouveau box. Si la
 * base refuse, les anciennes sont remises à l'identique (mêmes identifiants),
 * et l'erreur est rendue.
 */
export async function deplacerOccupations(p: {
  reservationId: string;
  boxId: string;
  dateDebut: string;
  dateFin: string;
}): Promise<{ erreur: string | null }> {
  const [{ data: anciennes }, { data: liens }] = await Promise.all([
    supabaseAdmin
      .from("occupation_boxes")
      .select("id, box_id, chien_id, reservation_id, date_debut, date_fin, created_at")
      .eq("reservation_id", p.reservationId),
    supabaseAdmin.from("reservation_chiens").select("chien_id").eq("reservation_id", p.reservationId),
  ]);

  const { error: errSuppr } = await supabaseAdmin.from("occupation_boxes").delete().eq("reservation_id", p.reservationId);
  if (errSuppr) return { erreur: errSuppr.message };

  const chiens = (liens ?? []) as { chien_id: string }[];
  if (chiens.length === 0) return { erreur: null };

  const { error } = await supabaseAdmin.from("occupation_boxes").insert(
    chiens.map((rc) => ({
      box_id: p.boxId,
      chien_id: rc.chien_id,
      reservation_id: p.reservationId,
      date_debut: p.dateDebut,
      date_fin: p.dateFin,
    })),
  );
  if (!error) return { erreur: null };

  // Refusé : l'ancienne place revient, ligne pour ligne.
  const remises = (anciennes ?? []) as Occupation[];
  if (remises.length > 0) {
    const { error: errRemise } = await supabaseAdmin.from("occupation_boxes").insert(remises);
    if (errRemise) {
      return { erreur: `${error.message} — et l'ancienne place n'a pas pu être remise : ${errRemise.message}` };
    }
  }
  return { erreur: error.message };
}
