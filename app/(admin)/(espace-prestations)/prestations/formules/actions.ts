"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { exigerAdminPage } from "@/src/lib/accesAdmin";
import { tracerEvenement } from "@/src/lib/journalEvenements";
import { aujourdhuiISO } from "@/src/lib/dates";
import { joursValides } from "@/src/lib/prestationsLogique";
import { regenererAbonnement } from "@/src/lib/prestationsDb";

type Resultat = { error?: string; ok?: boolean };

/**
 * Les formules, composées par Sabrina.
 *
 * AUCUNE n'est écrite en dur dans le code. Elle les crée, les renomme, les
 * duplique, les réordonne et les désactive ; elle y ajoute et en retire des
 * prestations avec leur fréquence et leurs jours.
 *
 * Deux règles qui protègent les abonnements en cours :
 *
 *   · une formule utilisée ne se SUPPRIME pas : elle se désactive. Supprimer
 *     laisserait des abonnements sans référence, et un prix sans origine ;
 *   · modifier une formule ne change AUCUN abonnement en cours. Le prix a été
 *     figé à la souscription. Les reprendre est une action explicite, séparée,
 *     avec la liste de ceux qu'elle touche.
 */

function lireMontant(brut: FormDataEntryValue | null): number {
  const n = Number(String(brut ?? "").replace(",", ".").trim());
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export async function creerFormule(formData: FormData): Promise<Resultat> {
  await exigerAdminPage();
  const nom = String(formData.get("nom") ?? "").trim();
  if (!nom) return { error: "Donnez un nom à la formule." };

  const { error } = await supabaseAdmin.from("formules").insert({
    nom,
    description: String(formData.get("description") ?? "").trim() || null,
    prix_mensuel: lireMontant(formData.get("prix_mensuel")),
    ordre: Math.round(lireMontant(formData.get("ordre"))),
  });
  if (error) return { error: error.message };

  revalidatePath("/prestations/formules");
  return { ok: true };
}

export async function modifierFormule(formData: FormData): Promise<Resultat> {
  await exigerAdminPage();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Formule introuvable." };

  const { error } = await supabaseAdmin
    .from("formules")
    .update({
      nom: String(formData.get("nom") ?? "").trim(),
      description: String(formData.get("description") ?? "").trim() || null,
      prix_mensuel: lireMontant(formData.get("prix_mensuel")),
      ordre: Math.round(lireMontant(formData.get("ordre"))),
      actif: formData.get("actif") === "on",
    })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/prestations/formules");
  return { ok: true };
}

/** Dupliquer : le point de départ d'une variante, sans repartir de zéro. */
export async function dupliquerFormule(formuleId: string): Promise<Resultat> {
  await exigerAdminPage();

  const { data: source } = await supabaseAdmin
    .from("formules")
    .select("nom, description, prix_mensuel, ordre")
    .eq("id", formuleId)
    .maybeSingle();
  if (!source) return { error: "Formule introuvable." };

  const { data: copie, error } = await supabaseAdmin
    .from("formules")
    .insert({
      nom: `${source.nom} (copie)`,
      description: source.description,
      prix_mensuel: source.prix_mensuel,
      ordre: Number(source.ordre ?? 0) + 1,
      actif: false,
    })
    .select("id")
    .single();
  if (error || !copie) return { error: error?.message ?? "Duplication impossible." };

  const { data: lignes } = await supabaseAdmin
    .from("formules_lignes")
    .select("prestation_id, quantite_par_semaine, jours, ordre")
    .eq("formule_id", formuleId);

  if ((lignes ?? []).length > 0) {
    await supabaseAdmin.from("formules_lignes").insert(
      (lignes ?? []).map((l) => ({ ...l, formule_id: copie.id }))
    );
  }

  revalidatePath("/prestations/formules");
  return { ok: true };
}

export async function ajouterLigneFormule(formData: FormData): Promise<Resultat> {
  await exigerAdminPage();

  const formuleId = String(formData.get("formule_id") ?? "");
  const prestationId = String(formData.get("prestation_id") ?? "");
  const quantite = lireMontant(formData.get("quantite_par_semaine"));
  const jours = joursValides(formData.getAll("jours") as string[]);

  if (!formuleId || !prestationId) return { error: "Choisissez une prestation." };
  if (quantite <= 0) return { error: "La quantité par semaine doit être supérieure à zéro." };

  const { error } = await supabaseAdmin.from("formules_lignes").insert({
    formule_id: formuleId,
    prestation_id: prestationId,
    quantite_par_semaine: quantite,
    // Aucun jour coché vaut « tous les jours » : c'est le sens du null.
    jours: jours.length > 0 ? jours : null,
    ordre: Math.round(lireMontant(formData.get("ordre"))),
  });
  if (error) return { error: error.message };

  revalidatePath("/prestations/formules");
  return { ok: true };
}

export async function retirerLigneFormule(ligneId: string): Promise<Resultat> {
  await exigerAdminPage();
  const { error } = await supabaseAdmin.from("formules_lignes").delete().eq("id", ligneId);
  if (error) return { error: error.message };
  revalidatePath("/prestations/formules");
  return { ok: true };
}

/**
 * Appliquer une formule modifiée aux abonnements en cours.
 *
 * Action EXPLICITE et séparée : modifier une formule ne fait jamais cela tout
 * seul. Elle déplace le prix figé de chaque abonnement actif vers le prix
 * courant de la formule, puis régénère les tâches — et elle laisse une trace
 * au journal, parce qu'elle change ce que des gens paient.
 */
export async function appliquerAuxAbonnements(formuleId: string): Promise<Resultat & { touches?: number }> {
  const acces = await exigerAdminPage();

  const { data: formule } = await supabaseAdmin
    .from("formules").select("id, nom, prix_mensuel").eq("id", formuleId).maybeSingle();
  if (!formule) return { error: "Formule introuvable." };

  const { data: abos } = await supabaseAdmin
    .from("abonnements_prestations")
    .select("id, client_id, prix_mensuel_fige")
    .eq("formule_id", formuleId)
    .eq("statut", "actif");

  const jour = aujourdhuiISO();
  for (const a of (abos ?? []) as { id: string; prix_mensuel_fige: number | string }[]) {
    await supabaseAdmin
      .from("abonnements_prestations")
      .update({ prix_mensuel_fige: Number(formule.prix_mensuel ?? 0) })
      .eq("id", a.id);
    await tracerEvenement({
      entite: "abonnement",
      entiteId: a.id,
      evenement: "formule_appliquee",
      avant: { prix_mensuel_fige: Number(a.prix_mensuel_fige ?? 0) },
      apres: { prix_mensuel_fige: Number(formule.prix_mensuel ?? 0), formule: formule.nom },
      motif: "Formule modifiée, appliquée aux abonnements en cours.",
      userId: acces.userId ?? null,
    });
    await regenererAbonnement(a.id, jour);
  }

  revalidatePath("/prestations/formules");
  return { ok: true, touches: (abos ?? []).length };
}
