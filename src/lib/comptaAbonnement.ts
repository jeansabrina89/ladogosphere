import * as Sentry from "@sentry/nextjs";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { calculerLignesAbonnement } from "@/src/lib/comptaAbonnementLogique";

async function marquer(abonnementId: string, ok: boolean, erreur?: string) {
  await supabaseAdmin.from("abonnements").update({
    compta_synchronisee: ok,
    compta_erreur: ok ? null : (erreur ?? "Erreur inconnue"),
    compta_sync_at: new Date().toISOString(),
  }).eq("id", abonnementId);
}

// Synchronise les ecritures comptables d'un abonnement (idempotent).
// Ne throw jamais : les erreurs sont tracees dans abonnements.compta_erreur.
export async function synchroniserComptaAbonnement(abonnementId: string, dateOperation?: string): Promise<void> {
  const dateEcriture = dateOperation ?? new Date().toISOString().split("T")[0];
  const today = new Date().toISOString().split("T")[0];

  try {
    const { data: abo } = await supabaseAdmin
      .from("abonnements")
      .select("statut, mode_paiement, prix_paye, jours_total, date_paiement, date_expiration")
      .eq("id", abonnementId)
      .maybeSingle();
    if (!abo) {
      await marquer(abonnementId, true);
      return;
    }

    const paye = abo.date_paiement !== null && abo.statut !== "annule";
    const expire =
      abo.statut === "expire" ||
      (abo.date_expiration !== null && today > abo.date_expiration);

    const { count: jours_termines } = await supabaseAdmin
      .from("reservations")
      .select("id", { count: "exact", head: true })
      .eq("abonnement_id", abonnementId)
      .eq("statut", "terminee");

    const { data: lignes } = await supabaseAdmin
      .from("ecritures_lignes")
      .select("compte_numero, debit, credit, ecritures!inner(piece_id, piece_type)")
      .eq("ecritures.piece_id", abonnementId)
      .eq("ecritures.piece_type", "abonnement");

    const lignesEcriture = calculerLignesAbonnement(
      {
        paye,
        mode_paiement: abo.mode_paiement,
        prix_paye: abo.prix_paye ?? 0,
        jours_total: abo.jours_total ?? 0,
        jours_termines: jours_termines ?? 0,
        expire,
      },
      (lignes ?? []) as { compte_numero: string; debit: number; credit: number }[],
    );

    if (lignesEcriture.length === 0) {
      await marquer(abonnementId, true);
      return;
    }

    const { error } = await supabaseAdmin.rpc("passer_ecriture", {
      p_date: dateEcriture,
      p_libelle: `Abonnement ${abonnementId.slice(0, 8)}`,
      p_piece_type: "abonnement",
      p_piece_id: abonnementId,
      p_lignes: lignesEcriture,
    });
    if (error) throw error;

    await marquer(abonnementId, true);
  } catch (e: any) {
    Sentry.captureException(e);
    await marquer(abonnementId, false, String(e?.message ?? e).slice(0, 500));
    console.error("compta abonnement:", e);
  }
}
