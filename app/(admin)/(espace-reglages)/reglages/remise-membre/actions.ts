"use server";

import { revalidatePath } from "next/cache";
import { verifierAdmin } from "@/src/lib/permissions";
import { enregistrerRemiseCategorie } from "@/src/lib/remiseMembre";
import { refusPourcentageRemise } from "@/src/lib/remiseMembreLogique";
import { libelleCategorieArticle } from "@/src/lib/boutiqueLogique";

/**
 * Réglages → Remise membre : le pourcentage d'une catégorie.
 *
 * Réservé à l'administratrice : c'est une décision commerciale, pas un geste de
 * comptoir. Un refus est retourné, jamais lancé.
 */
export type RetourRemise = { error?: string; message?: string };

export async function enregistrerPourcentage(formData: FormData): Promise<RetourRemise> {
  const acces = await verifierAdmin();
  if (acces.error) return { error: "Réservé à l'administratrice." };

  const categorie = String(formData.get("categorie") ?? "").trim();
  if (!categorie) return { error: "Catégorie inconnue." };

  const brut = formData.get("pourcentage");
  const refus = refusPourcentageRemise(brut);
  if (refus) return { error: refus };

  const pourcentage = Number(String(brut).replace(",", "."));
  // 0 % et « inactive » disent la même chose : la catégorie est exclue. On
  // n'entretient pas deux façons d'exprimer une seule décision.
  const res = await enregistrerRemiseCategorie({
    categorie,
    pourcentage,
    actif: pourcentage > 0,
    userId: acces.userId ?? null,
  });
  if (res.error) return { error: res.error };

  revalidatePath("/reglages/remise-membre");
  revalidatePath("/catalogue");

  const nom = libelleCategorieArticle(categorie);
  return {
    message:
      pourcentage > 0
        ? `${nom} : remise membre à ${String(pourcentage).replace(".", ",")} %.`
        : `${nom} : catégorie exclue de la remise membre. Plus aucune mention de remise n'y paraîtra.`,
  };
}
