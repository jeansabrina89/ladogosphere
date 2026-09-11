"use server";

import { revalidatePath } from "next/cache";
import { verifierPermission } from "@/src/lib/verifierPermission";
import { emettreFactureMois } from "@/src/lib/factureLocataire";
import { aujourdhuiISO } from "@/src/lib/dates";

/**
 * Émettre la facture mensuelle d'un locataire.
 *
 * Facturer est du travail administratif, pas un geste de comptoir : c'est
 * `perm_factures`, comme partout ailleurs dans l'application.
 */
export async function facturerLocataire(formData: FormData): Promise<{
  error?: string;
  factureId?: string;
}> {
  const verif = await verifierPermission("perm_factures");
  if (verif.error) return { error: verif.error };

  const clientId = String(formData.get("client_id") ?? "");
  const mois = String(formData.get("mois") ?? "");
  if (!/^\d{4}-\d{2}$/.test(mois)) return { error: "Mois invalide." };

  const resultat = await emettreFactureMois({
    clientId,
    mois,
    dateFacture: aujourdhuiISO(),
    userId: verif.userId ?? null,
    avecNotes: formData.get("avec_notes") === "on",
  });

  revalidatePath("/prestations/facturer");
  revalidatePath("/factures");
  return resultat;
}
