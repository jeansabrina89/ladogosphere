import * as Sentry from "@sentry/nextjs";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { calculerLignesAvoir } from "@/src/lib/comptaAvoirLogique";

export const PIECE_TYPE_AVOIR = "avoir_mouvement";

/**
 * Synchronise l'écriture comptable d'UN mouvement d'avoir (idempotent).
 *
 * Chaque mouvement est sa propre pièce comptable : rejouer la fonction sans
 * changement ne passe aucune écriture. Ne throw jamais — un avoir accordé ne
 * doit pas échouer parce que la comptabilité tousse ; l'erreur part dans Sentry
 * et la réconciliation la rattrapera.
 */
export async function synchroniserComptaAvoir(
  mouvementId: string,
  createdBy?: string | null,
): Promise<void> {
  try {
    const { data: mvt } = await supabaseAdmin
      .from("avoirs_mouvements")
      .select("id, type, montant, created_at")
      .eq("id", mouvementId)
      .maybeSingle();
    if (!mvt) return;

    const dateEcriture = (mvt.created_at ?? new Date().toISOString()).slice(0, 10);
    await passerDelta(
      mouvementId,
      { type: mvt.type, montant: mvt.montant },
      dateEcriture,
      createdBy,
    );
  } catch (e: unknown) {
    Sentry.captureException(e);
    console.error("compta avoir:", e);
  }
}

/**
 * Ramène à zéro l'écriture d'un mouvement d'avoir : à appeler AVANT de supprimer
 * la ligne, sans quoi l'écriture resterait orpheline au grand livre.
 * Le journal reste append-only : on passe la contre-partie, on n'efface rien.
 */
export async function contrePasserComptaAvoir(
  mouvementId: string,
  createdBy?: string | null,
): Promise<void> {
  try {
    const aujourdhui = new Date().toISOString().split("T")[0];
    // Une cible vide (type non comptabilisé) donne exactement l'inverse du déjà-passé.
    await passerDelta(mouvementId, { type: null, montant: 0 }, aujourdhui, createdBy);
  } catch (e: unknown) {
    Sentry.captureException(e);
    console.error("contre-passation avoir:", e);
  }
}

async function passerDelta(
  mouvementId: string,
  mvt: { type: string | null; montant: number | string | null },
  dateEcriture: string,
  createdBy?: string | null,
): Promise<void> {
  const { data: lignes } = await supabaseAdmin
    .from("ecritures_lignes")
    .select("compte_numero, debit, credit, ecritures!inner(piece_id, piece_type)")
    .eq("ecritures.piece_id", mouvementId)
    .eq("ecritures.piece_type", PIECE_TYPE_AVOIR);

  const lignesEcriture = calculerLignesAvoir(
    mvt,
    (lignes ?? []) as { compte_numero: string; debit: number; credit: number }[],
  );
  if (lignesEcriture.length === 0) return;

  const { error } = await supabaseAdmin.rpc("passer_ecriture", {
    p_date: dateEcriture,
    p_libelle: `Avoir client ${mouvementId.slice(0, 8)}`,
    p_piece_type: PIECE_TYPE_AVOIR,
    p_piece_id: mouvementId,
    p_lignes: lignesEcriture,
    p_created_by: createdBy ?? null,
  });
  if (error) throw error;
}
