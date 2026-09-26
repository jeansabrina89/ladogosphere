"use server";

import { revalidatePath } from "next/cache";
import { verifierPermissionBoutique } from "@/src/lib/permissions";
import { marquerCommandeAuFournisseur } from "@/src/lib/aCommander";

export type EtatACommander = { erreur?: string | null; message?: string | null };

/**
 * « Commandé le … » : les lignes cochées partent chez le fournisseur.
 *
 * Un refus est RETOURNÉ, jamais lancé : l'écran garde ce qui est coché, et
 * Sabrina n'a pas à tout recocher parce qu'une ligne était déjà marquée.
 *
 * La garde est la même que celle de l'écran (`perm_boutique_gestion`), et elle
 * est ici et non seulement là-bas : un écran qui cache un bouton ne protège
 * rien, l'action est appelable directement.
 */
export async function marquerCommande(
  _etat: EtatACommander,
  formData: FormData
): Promise<EtatACommander> {
  const verif = await verifierPermissionBoutique("gestion");
  if (verif.error) return { erreur: verif.error };

  const ids = formData.getAll("ligne").map((v) => String(v).trim()).filter(Boolean);
  if (ids.length === 0) return { erreur: "Cochez au moins une ligne." };

  const res = await marquerCommandeAuFournisseur(ids, verif.userId ?? null);
  if (res.error) return { erreur: res.error };

  revalidatePath("/boutique/a-commander");
  return {
    erreur: null,
    message: res.touchees === 1
      ? "Une ligne marquée comme commandée."
      : `${res.touchees} lignes marquées comme commandées.`,
  };
}
