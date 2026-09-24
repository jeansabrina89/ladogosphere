"use server";

import { revalidatePath } from "next/cache";
import { verifierPermission } from "@/src/lib/verifierPermission";
import { reprendreDocumentFacture } from "@/src/lib/reconciliationFactures";

/**
 * Reprendre à la main une facture que la réconciliation a laissée tomber.
 *
 * C'est le SEUL geste possible depuis cet écran, et il n'existe que pour les
 * factures renoncées : sans lui, une facture sortie de la ronde quotidienne
 * n'aurait plus aucun chemin de retour hors de la base.
 */
export async function reprendreDocument(factureId: string): Promise<{ error?: string; ok?: boolean }> {
  const verif = await verifierPermission("perm_encaissements");
  if (verif.error) return { error: verif.error };

  const res = await reprendreDocumentFacture(factureId, verif.userId ?? null);
  revalidatePath("/export-comptable");
  return res.error ? { error: res.error } : { ok: true };
}
