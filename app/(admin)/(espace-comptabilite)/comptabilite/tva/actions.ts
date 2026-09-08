"use server";

import { revalidatePath } from "next/cache";
import { verifierAdmin } from "@/src/lib/permissions";
import { declarerDecompte, marquerPaye, type RetourDeclaration } from "@/src/lib/decompteTva";

/**
 * Déclarer une période, et enregistrer son paiement.
 *
 * Réservé à l'administratrice : un décompte engage l'entreprise devant l'AFC.
 * Tout renvoie son refus plutôt que de le lancer — une exception d'action
 * serveur est masquée en production, et l'utilisatrice ne verrait rien.
 */

export async function declarerPeriode(formData: FormData): Promise<RetourDeclaration> {
  const acces = await verifierAdmin();
  if (acces.error) return { error: "Réservé à l'administratrice." };

  const code = String(formData.get("code") ?? "").trim();
  if (!/^\d{4}-[ST]\d$/.test(code)) return { error: "Période illisible." };

  const res = await declarerDecompte(code, acces.userId ?? null);
  if (!res.error) {
    revalidatePath("/comptabilite/tva");
    revalidatePath("/comptabilite");
  }
  return res;
}

export async function enregistrerPaiement(formData: FormData): Promise<RetourDeclaration> {
  const acces = await verifierAdmin();
  if (acces.error) return { error: "Réservé à l'administratrice." };

  const code = String(formData.get("code") ?? "").trim();
  const date = String(formData.get("date") ?? "").trim();

  const res = await marquerPaye(code, date, acces.userId ?? null);
  if (!res.error) {
    revalidatePath("/comptabilite/tva");
    revalidatePath("/comptabilite");
  }
  return res;
}
