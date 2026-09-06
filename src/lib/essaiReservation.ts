import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { chienReservablePour, messageRefusChien, statutEssaiDe } from "@/src/lib/journeeEssai";

/**
 * Une journée d'essai vient d'être validée : les chiens concernés passent de
 * 'non_programme' ou 'seconde_journee' à 'programme'.
 * Les chiens déjà 'programme', 'valide' ou 'refuse' ne sont pas touchés.
 */
export async function marquerChiensEssaiProgramme(reservationId: string): Promise<void> {
  const { data: resa } = await supabaseAdmin
    .from("reservations")
    .select("type_reservation, reservation_chiens (chien_id)")
    .eq("id", reservationId)
    .maybeSingle();

  if (resa?.type_reservation !== "essai") return;

  const chienIds = ((resa.reservation_chiens ?? []) as { chien_id: string }[])
    .map((rc) => rc.chien_id)
    .filter(Boolean);
  if (chienIds.length === 0) return;

  await supabaseAdmin
    .from("chiens")
    .update({ statut_essai: "programme" })
    .in("id", chienIds)
    .in("statut_essai", ["non_programme", "seconde_journee"]);
}

/**
 * Date de la prochaine journée d'essai VALIDÉE de chaque chien, pour l'affichage
 * « Journée d'essai le JJ.MM ». Clé = chien_id.
 */
export async function datesEssaiParChien(chienIds: string[]): Promise<Map<string, string>> {
  const resultat = new Map<string, string>();
  if (chienIds.length === 0) return resultat;

  const { data } = await supabaseAdmin
    .from("reservation_chiens")
    .select("chien_id, reservations!inner (date_debut, type_reservation, statut)")
    .in("chien_id", chienIds)
    .eq("reservations.type_reservation", "essai")
    .in("reservations.statut", ["validee", "en_attente"])
    .order("date_debut", { referencedTable: "reservations", ascending: true });

  for (const ligne of (data ?? []) as unknown as {
    chien_id: string;
    reservations: { date_debut: string } | null;
  }[]) {
    const d = ligne.reservations?.date_debut;
    if (!d) continue;
    const actuel = resultat.get(ligne.chien_id);
    if (!actuel || d < actuel) resultat.set(ligne.chien_id, d);
  }
  return resultat;
}

/**
 * Vérifie, en base, que chaque chien peut faire l'objet de ce type de réservation.
 * Renvoie le message à afficher (nommant le chien) au premier refus, sinon null.
 */
export async function verifierChiensPourReservation(
  chienIds: string[],
  type_reservation: string
): Promise<string | null> {
  if (chienIds.length === 0) return null;

  const { data: chiens } = await supabaseAdmin
    .from("chiens")
    .select("id, nom, statut_essai")
    .in("id", chienIds);

  for (const chien of (chiens ?? []) as { nom: string; statut_essai: string | null }[]) {
    const decision = chienReservablePour(statutEssaiDe(chien), type_reservation);
    if (!decision.autorise) {
      return messageRefusChien(chien.nom, decision.raison);
    }
  }
  return null;
}
