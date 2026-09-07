import { supabaseAdmin } from "@/src/lib/supabase-admin";
import {
  bornesCheckin,
  chiensSansLigne,
  STATUTS_SANS_CHECKIN,
} from "@/src/lib/lignesCheckinLogique";

/**
 * Lignes de check-in d’une réservation : une par chien.
 *
 * Sans ces lignes, la réservation n’apparaît ni en Check-in ni dans Chiens du
 * jour : pas d’arrivée, pas de départ, donc pas de facture. Elles étaient
 * créées dans les routes, et seulement dans deux d’entre elles — une demande
 * venue de l’espace client n’en recevait aucune.
 *
 * Tous les chemins de création et de validation passent désormais par
 * `assurerLignesCheckin`, qui est idempotente : rappelée, elle ne double rien.
 */
export type ResultatLignesCheckin = {
  creees: number;
  existantes: number;
  ignoree?: "statut" | "introuvable" | "sans_chien";
  erreur?: string;
};

export async function assurerLignesCheckin(
  reservationId: string
): Promise<ResultatLignesCheckin> {
  const { data: resa } = await supabaseAdmin
    .from("reservations")
    .select("id, statut, date_debut, date_fin, heure_arrivee, heure_depart, essai_force_heure")
    .eq("id", reservationId)
    .maybeSingle();

  if (!resa) return { creees: 0, existantes: 0, ignoree: "introuvable" };
  if (STATUTS_SANS_CHECKIN.includes(resa.statut ?? "")) {
    return { creees: 0, existantes: 0, ignoree: "statut" };
  }

  const [{ data: liens }, { data: existantes }] = await Promise.all([
    supabaseAdmin.from("reservation_chiens").select("chien_id").eq("reservation_id", reservationId),
    supabaseAdmin.from("checkin_checkout").select("chien_id").eq("reservation_id", reservationId),
  ]);

  const chiens = (liens ?? []).map((l) => l.chien_id as string);
  const dejaPointes = (existantes ?? []).map((l) => l.chien_id as string);
  if (chiens.length === 0) {
    return { creees: 0, existantes: dejaPointes.length, ignoree: "sans_chien" };
  }

  const manquants = chiensSansLigne(chiens, dejaPointes);
  if (manquants.length === 0) return { creees: 0, existantes: dejaPointes.length };

  const bornes = bornesCheckin(resa);
  const { error } = await supabaseAdmin.from("checkin_checkout").insert(
    manquants.map((chien_id) => ({
      reservation_id: reservationId,
      chien_id,
      date_arrivee_prevue: bornes.date_arrivee_prevue,
      date_depart_prevu: bornes.date_depart_prevu,
      statut: "attendu",
    }))
  );

  if (error) return { creees: 0, existantes: dejaPointes.length, erreur: error.message };
  return { creees: manquants.length, existantes: dejaPointes.length };
}

export { bornesCheckin, chiensSansLigne, STATUTS_SANS_CHECKIN };
