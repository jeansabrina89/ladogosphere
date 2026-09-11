"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { exigerAdminPage } from "@/src/lib/accesAdmin";
import { unitePrestation } from "@/src/lib/prestationsLogique";

type Resultat = { error?: string; ok?: boolean };

/**
 * Le catalogue des prestations : créer, modifier, désactiver.
 *
 * Aucun prix par défaut. Une prestation naît à zéro et attend que Sabrina la
 * chiffre — un prix inventé finit toujours par se retrouver sur une vraie
 * facture, et personne ne saura d'où il vient.
 */

function lireMontant(brut: FormDataEntryValue | null): number {
  const n = Number(String(brut ?? "").replace(",", ".").trim());
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export async function creerPrestation(formData: FormData): Promise<Resultat> {
  await exigerAdminPage();

  const nom = String(formData.get("nom") ?? "").trim();
  if (!nom) return { error: "Donnez un nom à la prestation." };

  const taux = lireMontant(formData.get("taux_tva"));
  const motif = String(formData.get("motif_tva") ?? "").trim() || null;
  if (taux === 0 && !motif) {
    return { error: "Un taux à 0 % demande son motif d'exonération." };
  }

  const { error } = await supabaseAdmin.from("prestations").insert({
    nom,
    description: String(formData.get("description") ?? "").trim() || null,
    unite: unitePrestation(String(formData.get("unite") ?? "")),
    // Volontairement laissé à ce qui est saisi, zéro compris.
    prix: lireMontant(formData.get("prix")),
    duree_minutes: String(formData.get("duree_minutes") ?? "").trim()
      ? Math.max(0, Math.round(lireMontant(formData.get("duree_minutes"))))
      : null,
    taux_tva: taux,
    motif_tva: motif,
    ordre: Math.round(lireMontant(formData.get("ordre"))),
  });
  if (error) return { error: error.message };

  revalidatePath("/prestations/catalogue");
  return { ok: true };
}

export async function modifierPrestation(formData: FormData): Promise<Resultat> {
  await exigerAdminPage();

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Prestation introuvable." };

  const taux = lireMontant(formData.get("taux_tva"));
  const motif = String(formData.get("motif_tva") ?? "").trim() || null;
  if (taux === 0 && !motif) {
    return { error: "Un taux à 0 % demande son motif d'exonération." };
  }

  const { error } = await supabaseAdmin
    .from("prestations")
    .update({
      nom: String(formData.get("nom") ?? "").trim(),
      description: String(formData.get("description") ?? "").trim() || null,
      unite: unitePrestation(String(formData.get("unite") ?? "")),
      prix: lireMontant(formData.get("prix")),
      duree_minutes: String(formData.get("duree_minutes") ?? "").trim()
        ? Math.max(0, Math.round(lireMontant(formData.get("duree_minutes"))))
        : null,
      taux_tva: taux,
      motif_tva: motif,
      ordre: Math.round(lireMontant(formData.get("ordre"))),
      actif: formData.get("actif") === "on",
    })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/prestations/catalogue");
  return { ok: true };
}
