import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { compterPieces } from "@/src/lib/pieces";
import {
  lignesEcritureDepense,
  lignesEcritureReglement,
  peutValiderDepense,
  type ModePaiementDepense,
  type ModeReglement,
  type StatutDepense,
} from "@/src/lib/depensesLogique";

/**
 * Dépenses — couche base. Elle ne décide rien de comptable : les lignes
 * viennent de depensesLogique, et c'est passer_ecriture (via les fonctions SQL
 * valider_depense / payer_depense / annuler_depense) qui les enregistre.
 */

export type Depense = {
  id: string;
  numero: string | null;
  date_depense: string;
  fournisseur_id: string | null;
  libelle: string;
  montant: number | string;
  compte_charge: string;
  mode_paiement: ModePaiementDepense;
  date_paiement: string | null;
  statut: StatutDepense;
  exercice: number | null;
  ecriture_id: string | null;
  ecriture_paiement_id: string | null;
  motif_annulation: string | null;
  created_at: string;
};

export async function lireDepense(id: string): Promise<Depense | null> {
  const { data } = await supabaseAdmin
    .from("depenses")
    .select(`
      id, numero, date_depense, fournisseur_id, libelle, montant, compte_charge,
      mode_paiement, date_paiement, statut, exercice, ecriture_id, ecriture_paiement_id,
      motif_annulation, created_at
    `)
    .eq("id", id)
    .maybeSingle();
  return (data as Depense | null) ?? null;
}

/**
 * Validation : numéro de l'exercice, écriture au grand-livre, journal.
 * Refusée sans justificatif — la règle est vérifiée ici ET dans la fonction SQL.
 */
export async function validerDepense(
  id: string,
  userId?: string | null
): Promise<{ numero?: string; error?: string }> {
  const depense = await lireDepense(id);
  if (!depense) return { error: "Dépense introuvable." };

  const nbPieces = await compterPieces("depense", id);
  const decision = peutValiderDepense({
    statut: depense.statut,
    nbPieces,
    montant: Number(depense.montant),
    compte_charge: depense.compte_charge,
  });
  if (!decision.autorise) return { error: decision.message };

  const lignes = lignesEcritureDepense({
    compte_charge: depense.compte_charge,
    montant: Number(depense.montant),
    mode_paiement: depense.mode_paiement,
  });

  const { data, error } = await supabaseAdmin.rpc("valider_depense", {
    p_depense_id: id,
    p_lignes: lignes,
    p_user_id: userId ?? null,
  });
  if (error) return { error: error.message };

  return { numero: (data as string) ?? undefined };
}

/** Règlement d'une dépense restée « à payer » : 2000 soldé par la liquidité. */
export async function payerDepense(
  id: string,
  mode: ModeReglement,
  dateISO: string,
  userId?: string | null
): Promise<{ error?: string }> {
  const depense = await lireDepense(id);
  if (!depense) return { error: "Dépense introuvable." };
  if (depense.statut !== "validee" || depense.mode_paiement !== "a_payer") {
    return { error: "Cette dépense n'est pas en attente de règlement." };
  }

  const lignes = lignesEcritureReglement({ montant: Number(depense.montant), mode });

  const { error } = await supabaseAdmin.rpc("payer_depense", {
    p_depense_id: id,
    p_lignes: lignes,
    p_mode: mode,
    p_date: dateISO,
    p_user_id: userId ?? null,
  });
  if (error) return { error: error.message };
  return {};
}

/** Annulation par contre-écriture, motif obligatoire. Jamais de suppression. */
export async function annulerDepense(
  id: string,
  motif: string,
  userId?: string | null
): Promise<{ error?: string }> {
  const { error } = await supabaseAdmin.rpc("annuler_depense", {
    p_depense_id: id,
    p_motif: motif,
    p_user_id: userId ?? null,
  });
  if (error) return { error: error.message };
  return {};
}

/** Dépenses validées ou payées sans aucune pièce — la ligne de contrôle. */
export async function compterDepensesSansJustificatif(annee?: number): Promise<number> {
  let requete = supabaseAdmin
    .from("depenses")
    .select("id")
    .in("statut", ["validee", "payee"]);
  if (annee) requete = requete.eq("exercice", annee);

  const { data: depenses } = await requete;
  const ids = (depenses ?? []).map((d) => d.id as string);
  if (ids.length === 0) return 0;

  const { data: pieces } = await supabaseAdmin
    .from("pieces")
    .select("entite_id")
    .eq("entite", "depense")
    .in("entite_id", ids);

  const avecPiece = new Set((pieces ?? []).map((p) => p.entite_id as string));
  return ids.filter((id) => !avecPiece.has(id)).length;
}
