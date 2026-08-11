import * as Sentry from "@sentry/nextjs";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { calculerLignesCotisation, estModeLiquideDirect, type LigneExistante } from "@/src/lib/comptaCotisationLogique";

/**
 * Synchronise les écritures d'une adhésion payée directement (idempotent, par delta).
 * Ne throw jamais (Sentry). Garde anti-doublon : une adhésion liée à une
 * réservation est comptabilisée via la réservation (Partie A) → on n'y touche pas.
 */
export async function synchroniserComptaCotisation(cotisationId: string, dateOperation?: string): Promise<void> {
  try {
    const { data: cotis } = await supabaseAdmin
      .from("cotisations_membres")
      .select("statut, mode_paiement, montant, reservation_id, date_paiement")
      .eq("id", cotisationId)
      .maybeSingle();
    if (!cotis) return;

    // Déjà comptabilisée via la réservation porteuse (ventilation 3005 côté résa).
    if (cotis.reservation_id) return;
    // Mode non liquide direct (ex. 'prochaine_resa') : rien à comptabiliser ici.
    if (!estModeLiquideDirect(cotis.mode_paiement)) return;

    const { data: lignes } = await supabaseAdmin
      .from("ecritures_lignes")
      .select("compte_numero, debit, credit, ecritures!inner(piece_id, piece_type)")
      .eq("ecritures.piece_id", cotisationId)
      .eq("ecritures.piece_type", "cotisation");

    const lignesEcriture = calculerLignesCotisation(
      { statut: cotis.statut, mode_paiement: cotis.mode_paiement, montant: cotis.montant ?? 0 },
      (lignes ?? []) as LigneExistante[],
    );

    if (lignesEcriture.length === 0) return;

    const dateEcriture = dateOperation ?? cotis.date_paiement ?? new Date().toISOString().split("T")[0];
    const { error } = await supabaseAdmin.rpc("passer_ecriture", {
      p_date: dateEcriture,
      p_libelle: `Adhésion ${cotisationId.slice(0, 8)}`,
      p_piece_type: "cotisation",
      p_piece_id: cotisationId,
      p_lignes: lignesEcriture,
    });
    if (error) throw error;
  } catch (e: any) {
    Sentry.captureException(e);
    console.error("compta cotisation:", e);
  }
}
