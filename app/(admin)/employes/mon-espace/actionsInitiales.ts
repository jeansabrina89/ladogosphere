"use server";

import { revalidatePath } from "next/cache";
import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import { enregistrerInitiales } from "@/src/lib/auteursDb";

export type EtatInitiales = { erreur: string | null; enregistrees: string | null };

/**
 * L'administratrice change ses propres initiales. Les employées, elles, les
 * voient changer depuis leur fiche (Employés → modifier), par l'admin.
 */
export async function modifierMesInitiales(
  _etat: EtatInitiales,
  formData: FormData,
): Promise<EtatInitiales> {
  const acces = await exigerAccesAdmin();
  if (!acces.isAdmin) return { erreur: "Réservé à l'administratrice.", enregistrees: null };

  const res = await enregistrerInitiales(acces.userId, String(formData.get("initiales") ?? ""));
  if (res.error) return { erreur: res.error, enregistrees: null };

  revalidatePath("/employes/mon-espace");
  return { erreur: null, enregistrees: res.initiales ?? null };
}
