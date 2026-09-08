"use server";

import { revalidatePath } from "next/cache";
import { verifierPermissionBoutique } from "@/src/lib/permissions";
import { renvoyerAlerte } from "@/src/lib/alertesStock";

export type EtatAttentes = { erreur?: string | null; message?: string | null };

/**
 * Renvoyer une alerte déjà notifiée — pour le cas où l'e-mail n'est pas parti.
 *
 * Un refus est RETOURNÉ, jamais lancé. Le geste est journalisé par
 * `renvoyerAlerte` : on saura qui a relancé quoi, et quand.
 */
export async function renvoyer(
  _etat: EtatAttentes,
  formData: FormData
): Promise<EtatAttentes> {
  const verif = await verifierPermissionBoutique("gestion");
  if (verif.error) return { erreur: verif.error };

  const alerteId = String(formData.get("alerte_id") ?? "").trim();
  if (!alerteId) return { erreur: "Alerte introuvable." };

  const res = await renvoyerAlerte(alerteId, verif.userId ?? null);
  if (res.error) return { erreur: res.error };

  revalidatePath("/boutique/attentes");
  return { erreur: null, message: "L'e-mail est reparti." };
}
