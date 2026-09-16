"use server";

import { revalidatePath } from "next/cache";
import { verifierPermission } from "@/src/lib/verifierPermission";
import { emettreFactureMois } from "@/src/lib/factureLocataire";
import { envoyerFactureParEmail, genererPdfFacture } from "@/src/lib/factureDocument";
import { validerLignesLibresLocataire } from "@/src/lib/ligneLibreLogique";
import { aujourdhuiISO } from "@/src/lib/dates";

/**
 * Émettre la facture mensuelle d'un locataire.
 *
 * Facturer est du travail administratif, pas un geste de comptoir : c'est
 * `perm_factures`, comme partout ailleurs dans l'application.
 *
 * L'émission n'envoie rien. La facture attend que Sabrina l'envoie.
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

  // Relues ici, jamais crues sur parole : le compte doit être l'un des trois
  // proposés, le montant un nombre positif.
  const libres = validerLignesLibresLocataire(formData.get("lignes_libres"));
  if (libres.error) return { error: libres.error };

  const resultat = await emettreFactureMois({
    clientId,
    mois,
    dateFacture: aujourdhuiISO(),
    userId: verif.userId ?? null,
    avecNotes: formData.get("avec_notes") === "on",
    lignesLibres: libres.lignes,
  });

  revalidatePath("/prestations/facturer");
  revalidatePath("/factures");
  return resultat;
}

/**
 * Envoyer (ou renvoyer) par e-mail la facture d'un locataire.
 *
 * C'est le même envoi que le bouton de la fiche facture : il pose
 * `email_envoye_le` s'il réussit, et rien s'il échoue.
 */
export async function envoyerFactureLocataire(factureId: string): Promise<{
  error?: string;
  ok?: boolean;
}> {
  const verif = await verifierPermission("perm_factures");
  if (verif.error) return { error: verif.error };
  if (!factureId) return { error: "Facture introuvable." };

  // Sans PDF, la facture partirait sans sa pièce. La génération ne refait
  // jamais un PDF déjà déposé : l'appel ne coûte rien s'il existe.
  await genererPdfFacture(factureId, verif.userId ?? null);
  const res = await envoyerFactureParEmail(factureId, verif.userId ?? null, { via: "prestations_facturer" });
  if (res.error) return { error: res.error };

  revalidatePath("/prestations/facturer");
  revalidatePath(`/factures/${factureId}`);
  return { ok: true };
}
