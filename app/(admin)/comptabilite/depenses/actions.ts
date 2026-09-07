"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { verifierPermission } from "@/src/lib/verifierPermission";
import {
  validerDepense as validerEnBase,
  payerDepense as payerEnBase,
  annulerDepense as annulerEnBase,
  lireDepense,
} from "@/src/lib/depenses";
import {
  COMPTES_DEPENSE,
  MODES_PAIEMENT,
  type ModePaiementDepense,
  type ModeReglement,
} from "@/src/lib/depensesLogique";
import { supprimerPiece } from "@/src/lib/pieces";

/**
 * Saisie des dépenses. Toutes ces actions exigent perm_depenses (l'admin l'a
 * d'office). Aucune ne permet de composer une écriture libre à deux comptes :
 * le journal manuel reste l'exception, il vit ailleurs.
 */

export type EtatDepense = { erreur: string | null; id?: string; numero?: string };

const MODES = MODES_PAIEMENT.map((m) => m.valeur);
const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;

function lireMontant(brut: FormDataEntryValue | null): number | null {
  const texte = String(brut ?? "").replace(",", ".").trim();
  if (!texte) return null;
  const n = Number(texte);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

async function garde(): Promise<{ userId?: string; erreur?: string }> {
  const verif = await verifierPermission("perm_depenses");
  if (verif.error) return { erreur: verif.error };
  return { userId: verif.userId };
}

/** Crée le brouillon, ou met à jour un brouillon existant. */
export async function enregistrerBrouillon(
  _etat: EtatDepense,
  formData: FormData
): Promise<EtatDepense> {
  const g = await garde();
  if (g.erreur) return { erreur: g.erreur };

  const id = (formData.get("id") as string) || null;
  const date_depense = String(formData.get("date_depense") ?? "").trim();
  const libelle = String(formData.get("libelle") ?? "").trim();
  const compte_charge = String(formData.get("compte_charge") ?? "").trim();
  const mode_paiement = String(formData.get("mode_paiement") ?? "").trim() as ModePaiementDepense;
  const montant = lireMontant(formData.get("montant"));
  const fournisseur_id = (formData.get("fournisseur_id") as string) || null;

  if (!DATE_ISO.test(date_depense)) return { erreur: "Indiquez la date de la dépense.", id: id ?? undefined };
  if (!libelle) return { erreur: "Indiquez ce que vous avez payé.", id: id ?? undefined };
  if (montant === null || montant <= 0) return { erreur: "Indiquez un montant supérieur à zéro.", id: id ?? undefined };
  if (!COMPTES_DEPENSE.includes(compte_charge)) return { erreur: "Choisissez une catégorie.", id: id ?? undefined };
  if (!MODES.includes(mode_paiement)) return { erreur: "Choisissez un mode de paiement.", id: id ?? undefined };

  const valeurs = {
    date_depense,
    libelle,
    montant,
    compte_charge,
    mode_paiement,
    fournisseur_id,
  };

  if (id) {
    const existante = await lireDepense(id);
    if (!existante) return { erreur: "Dépense introuvable." };
    if (existante.statut !== "brouillon") {
      return { erreur: "Cette dépense est validée : elle ne se modifie plus." };
    }
    const { error } = await supabaseAdmin.from("depenses").update(valeurs).eq("id", id);
    if (error) return { erreur: error.message, id };
    revalidatePath("/comptabilite/depenses");
    revalidatePath(`/comptabilite/depenses/${id}`);
    return { erreur: null, id };
  }

  const { data, error } = await supabaseAdmin
    .from("depenses")
    .insert({ ...valeurs, statut: "brouillon", created_by: g.userId ?? null })
    .select("id")
    .single();
  if (error) return { erreur: error.message };

  revalidatePath("/comptabilite/depenses");
  return { erreur: null, id: data.id as string };
}

/** Validation : numéro, écriture, journal. Refusée sans justificatif. */
export async function validerDepense(
  _etat: EtatDepense,
  formData: FormData
): Promise<EtatDepense> {
  const g = await garde();
  if (g.erreur) return { erreur: g.erreur };

  const id = String(formData.get("id") ?? "");
  if (!id) return { erreur: "Dépense introuvable." };

  const res = await validerEnBase(id, g.userId ?? null);
  if (res.error) return { erreur: res.error, id };

  revalidatePath("/comptabilite/depenses");
  revalidatePath(`/comptabilite/depenses/${id}`);
  revalidatePath("/comptabilite/rapports");
  return { erreur: null, id, numero: res.numero };
}

/** Règlement d'une dépense « à payer ». */
export async function payerDepense(
  _etat: EtatDepense,
  formData: FormData
): Promise<EtatDepense> {
  const g = await garde();
  if (g.erreur) return { erreur: g.erreur };

  const id = String(formData.get("id") ?? "");
  const mode = String(formData.get("mode") ?? "") as ModeReglement;
  const date = String(formData.get("date_paiement") ?? "").trim();

  if (!id) return { erreur: "Dépense introuvable." };
  if (!["banque", "caisse", "carte", "twint"].includes(mode)) {
    return { erreur: "Choisissez le moyen de règlement.", id };
  }
  if (!DATE_ISO.test(date)) return { erreur: "Indiquez la date du règlement.", id };

  const res = await payerEnBase(id, mode, date, g.userId ?? null);
  if (res.error) return { erreur: res.error, id };

  revalidatePath("/comptabilite/depenses");
  revalidatePath(`/comptabilite/depenses/${id}`);
  return { erreur: null, id };
}

/** Annulation par contre-écriture. Le motif est obligatoire. */
export async function annulerDepense(
  _etat: EtatDepense,
  formData: FormData
): Promise<EtatDepense> {
  const g = await garde();
  if (g.erreur) return { erreur: g.erreur };

  const id = String(formData.get("id") ?? "");
  const motif = String(formData.get("motif") ?? "").trim();
  if (!id) return { erreur: "Dépense introuvable." };
  if (!motif) return { erreur: "Indiquez le motif de l'annulation.", id };

  const res = await annulerEnBase(id, motif, g.userId ?? null);
  if (res.error) return { erreur: res.error, id };

  revalidatePath("/comptabilite/depenses");
  revalidatePath(`/comptabilite/depenses/${id}`);
  revalidatePath("/comptabilite/rapports");
  return { erreur: null, id };
}

/** Suppression d'un brouillon (jamais d'une dépense validée). */
export async function supprimerBrouillon(
  _etat: EtatDepense,
  formData: FormData
): Promise<EtatDepense> {
  const g = await garde();
  if (g.erreur) return { erreur: g.erreur };

  const id = String(formData.get("id") ?? "");
  const depense = await lireDepense(id);
  if (!depense) return { erreur: "Dépense introuvable." };
  if (depense.numero) return { erreur: "Dépense validée : elle s'annule, elle ne se supprime pas.", id };

  const { data: pieces } = await supabaseAdmin
    .from("pieces").select("id").eq("entite", "depense").eq("entite_id", id);
  for (const p of pieces ?? []) await supprimerPiece(p.id as string);

  const { error } = await supabaseAdmin.from("depenses").delete().eq("id", id);
  if (error) return { erreur: error.message, id };

  revalidatePath("/comptabilite/depenses");
  redirect("/comptabilite/depenses");
}

/** Retrait d'un justificatif — brouillon seulement. */
export async function retirerPiece(
  _etat: EtatDepense,
  formData: FormData
): Promise<EtatDepense> {
  const g = await garde();
  if (g.erreur) return { erreur: g.erreur };

  const pieceId = String(formData.get("piece_id") ?? "");
  const depenseId = String(formData.get("id") ?? "");

  const depense = await lireDepense(depenseId);
  if (!depense) return { erreur: "Dépense introuvable." };
  if (depense.numero) {
    return { erreur: "Le justificatif d'une dépense validée fait partie de la pièce comptable.", id: depenseId };
  }

  const res = await supprimerPiece(pieceId);
  if (res.error) return { erreur: res.error, id: depenseId };

  revalidatePath(`/comptabilite/depenses/${depenseId}`);
  return { erreur: null, id: depenseId };
}
