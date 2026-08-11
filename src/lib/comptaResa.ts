import * as Sentry from "@sentry/nextjs";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { calculerLignesEcriture } from "@/src/lib/comptaResaLogique";

async function marquerStatutCompta(reservationId: string, ok: boolean, erreur?: string) {
  await supabaseAdmin.from("reservations").update({
    compta_synchronisee: ok,
    compta_erreur: ok ? null : (erreur ?? "Erreur inconnue"),
    compta_sync_at: new Date().toISOString(),
  }).eq("id", reservationId);
}

// Synchronise les ecritures comptables d'une reservation (idempotent).
// Ne throw jamais : les erreurs sont tracees dans reservations.compta_erreur.
export async function synchroniserComptaResa(reservationId: string, dateOperation?: string): Promise<void> {
  const dateEcriture = dateOperation ?? new Date().toISOString().split("T")[0];

  try {
    const { data: resa } = await supabaseAdmin
      .from("reservations")
      .select("statut, type_reservation, montant_final, montant_calcule, abonnement_id")
      .eq("id", reservationId)
      .maybeSingle();
    if (!resa) {
      await marquerStatutCompta(reservationId, true);
      return;
    }

    // Reservation payee par abonnement : la compta est portee par l'abonnement, pas par la reservation.
    if (resa.abonnement_id) {
      await marquerStatutCompta(reservationId, true);
      return;
    }

    const { data: mouvements } = await supabaseAdmin
      .from("paiements_resa")
      .select("mode, montant")
      .eq("reservation_id", reservationId);

    const { data: lignes } = await supabaseAdmin
      .from("ecritures_lignes")
      .select("compte_numero, debit, credit, ecritures!inner(piece_id, piece_type)")
      .eq("ecritures.piece_id", reservationId)
      .eq("ecritures.piece_type", "reservation");

    // Adhesion embarquee sur cette reservation : ventilee en 3005 (cf. logique).
    const { data: cotis } = await supabaseAdmin
      .from("cotisations_membres")
      .select("montant")
      .eq("reservation_id", reservationId)
      .maybeSingle();
    const montantAdhesion = cotis ? Number(cotis.montant) || 0 : 0;

    const lignesEcriture = calculerLignesEcriture(
      resa,
      (mouvements ?? []) as { mode: string; montant: number }[],
      (lignes ?? []) as { compte_numero: string; debit: number; credit: number }[],
      montantAdhesion,
    );

    if (lignesEcriture.length === 0) {
      await marquerStatutCompta(reservationId, true);
      return;
    }

    const { error } = await supabaseAdmin.rpc("passer_ecriture", {
      p_date: dateEcriture,
      p_libelle: `Reservation ${reservationId.slice(0, 8)}`,
      p_piece_type: "reservation",
      p_piece_id: reservationId,
      p_lignes: lignesEcriture,
    });
    if (error) throw error;

    await marquerStatutCompta(reservationId, true);
  } catch (e: any) {
    Sentry.captureException(e);
    await marquerStatutCompta(reservationId, false, String(e?.message ?? e).slice(0, 500));
    console.error("compta resa:", e);
  }
}
