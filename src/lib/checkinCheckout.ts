import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { figerFactureResa, defigerFactureResa } from "@/src/lib/factureResa";
import { synchroniserComptaResa } from "@/src/lib/comptaResa";
import { synchroniserComptaAbonnement } from "@/src/lib/comptaAbonnement";

type Resultat = { error?: string };

// Forme de la reservation lue en jointure lors du check-in (bonus journee d'essai).
type ReservationEssai = {
  type_reservation: string | null;
  reservation_chiens: { chien_id: string }[] | null;
};

// Met a jour la ligne checkin_checkout. Retourne le message d'erreur Supabase le cas echeant.
async function majCheckinCheckout(
  checkinId: string,
  updates: Record<string, unknown>,
): Promise<Resultat> {
  const { error } = await supabaseAdmin
    .from("checkin_checkout")
    .update(updates)
    .eq("id", checkinId);

  if (error) return { error: error.message };
  return {};
}

// Recupere la reservation liee a une ligne de checkin_checkout.
async function lireReservationId(checkinId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("checkin_checkout")
    .select("reservation_id")
    .eq("id", checkinId)
    .single();

  return data?.reservation_id ?? null;
}

// Check-in : la ligne passe a "arrive" et l'essai eventuel est marque comme consomme.
export async function appliquerCheckin(checkinId: string): Promise<Resultat> {
  const res = await majCheckinCheckout(checkinId, {
    statut: "arrive",
    date_arrivee_reelle: new Date().toISOString(),
  });
  if (res.error) return res;

  // Bonus essai : si check-in effectue sur une journee d'essai -> marquer journee_essai_effectuee
  const { data: cc } = await supabaseAdmin
    .from("checkin_checkout")
    .select(`reservation_id, reservations!inner (type_reservation, reservation_chiens (chien_id))`)
    .eq("id", checkinId)
    .single();

  const reservation = cc?.reservations as unknown as ReservationEssai | null | undefined;
  if (reservation?.type_reservation === "essai") {
    const chienIds = reservation.reservation_chiens?.map((rc) => rc.chien_id) ?? [];
    if (chienIds.length > 0) {
      await supabaseAdmin
        .from("chiens")
        .update({ journee_essai_effectuee: true })
        .in("id", chienIds);
    }
  }

  return {};
}

// Check-out : la ligne passe a "parti", la reservation est cloturee, la facture figee
// et les ecritures comptables synchronisees.
export async function appliquerCheckout(checkinId: string): Promise<Resultat> {
  const res = await majCheckinCheckout(checkinId, {
    statut: "parti",
    date_depart_reel: new Date().toISOString(),
  });
  if (res.error) return res;

  const reservationId = await lireReservationId(checkinId);
  if (reservationId) {
    await supabaseAdmin.from("reservations").update({ statut: "terminee" }).eq("id", reservationId);
    await figerFactureResa(reservationId);
    const { data: resaDate } = await supabaseAdmin
      .from("reservations")
      .select("date_fin, abonnement_id")
      .eq("id", reservationId)
      .maybeSingle();
    await synchroniserComptaResa(reservationId, resaDate?.date_fin ?? undefined);
    if (resaDate?.abonnement_id) {
      await synchroniserComptaAbonnement(resaDate.abonnement_id);
    }
  }

  return {};
}

// Annulation du check-in : retour a l'etat "attendu".
export async function annulerCheckin(checkinId: string): Promise<Resultat> {
  return majCheckinCheckout(checkinId, {
    statut: "attendu",
    date_arrivee_reelle: null,
  });
}

// Annulation du check-out : la reservation est rouverte, la facture defigee
// et la compta de l'abonnement eventuel resynchronisee.
export async function annulerCheckout(checkinId: string): Promise<Resultat> {
  const res = await majCheckinCheckout(checkinId, {
    statut: "arrive",
    date_depart_reel: null,
  });
  if (res.error) return res;

  const reservationId = await lireReservationId(checkinId);
  if (reservationId) {
    await supabaseAdmin.from("reservations").update({ statut: "validee" }).eq("id", reservationId);
    await defigerFactureResa(reservationId);
    const { data: resaAbo } = await supabaseAdmin
      .from("reservations")
      .select("abonnement_id")
      .eq("id", reservationId)
      .maybeSingle();
    if (resaAbo?.abonnement_id) {
      await synchroniserComptaAbonnement(resaAbo.abonnement_id);
    }
  }

  return {};
}
