import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { BUCKET_FACTURES } from "@/src/lib/factureDocument";
import { BUCKET_JUSTIFICATIFS } from "@/src/lib/pieces";
import { facturesSansDocument, documentsPerdus } from "@/src/lib/reconciliationFactures";
import {
  inventorier,
  type FichierReference,
  type Inventaire,
  type TaillesStockage,
} from "@/src/lib/exportComptableLogique";

/**
 * L'inventaire d'un exercice — une LECTURE, rien d'autre.
 *
 * Ce module ne supprime rien, n'écrit rien, ne fabrique aucune archive. Il dit
 * ce que pèse un exercice et où la base et le stockage divergent.
 *
 * Les tailles viennent des objets RÉELS du stockage, jamais d'une estimation
 * ni d'une colonne : `pieces.taille` existe, mais elle décrit ce qui a été
 * enregistré, pas ce que le bucket porte aujourd'hui — et c'est précisément
 * l'écart entre les deux qu'on cherche.
 *
 * Le schéma `storage` n'est pas exposé à PostgREST (vérifié : « Invalid schema:
 * storage ») : les tailles se lisent par l'API de stockage, un appel par
 * dossier. Le nombre d'appels est compté et rendu avec l'inventaire.
 */

/** Un dossier du stockage et ce qu'il contient. */
async function listerDossier(
  bucket: string,
  dossier: string,
): Promise<{ chemins: Map<string, number>; appels: number }> {
  const chemins = new Map<string, number>();
  let appels = 0;
  let debut = 0;
  // La liste est paginée : on redemande tant qu'une page est pleine.
  for (;;) {
    const { data, error } = await supabaseAdmin.storage
      .from(bucket)
      .list(dossier, { limit: 1000, offset: debut });
    appels += 1;
    if (error || !data || data.length === 0) break;
    for (const objet of data) {
      const taille = (objet.metadata as { size?: number } | null)?.size;
      // Une entrée sans taille est un sous-dossier, pas un fichier.
      if (typeof taille === "number") {
        chemins.set(dossier ? `${dossier}/${objet.name}` : objet.name, taille);
      }
    }
    if (data.length < 1000) break;
    debut += data.length;
  }
  return { chemins, appels };
}

/**
 * La date comptable d'une pièce justificative : celle de son document
 * parent, JAMAIS sa date de dépôt.
 */
async function datesComptablesDesPieces(): Promise<
  { chemin: string; origineChemin: string | null; dateComptable: string; entite: string; entiteId: string }[]
> {
  const { data: pieces } = await supabaseAdmin
    .from("pieces")
    .select("id, entite, entite_id, storage_path, origine_path");

  const lignes = (pieces ?? []) as {
    entite: string; entite_id: string; storage_path: string; origine_path: string | null;
  }[];
  if (lignes.length === 0) return [];

  const parId = new Map<string, string>();
  const idsPar = (entite: string) =>
    lignes.filter((l) => l.entite === entite).map((l) => l.entite_id);

  const [depenses, factures, paiements] = await Promise.all([
    supabaseAdmin.from("depenses").select("id, date_depense").in("id", idsPar("depense")),
    supabaseAdmin.from("factures").select("id, date_facture").in("id", idsPar("facture")),
    supabaseAdmin.from("paiements_resa").select("id, date_paiement").in("id", idsPar("paiement")),
  ]);
  for (const d of (depenses.data ?? []) as { id: string; date_depense: string }[]) {
    parId.set(d.id, d.date_depense);
  }
  for (const f of (factures.data ?? []) as { id: string; date_facture: string }[]) {
    parId.set(f.id, f.date_facture);
  }
  for (const p of (paiements.data ?? []) as { id: string; date_paiement: string }[]) {
    parId.set(p.id, p.date_paiement);
  }

  return lignes.map((l) => ({
    chemin: l.storage_path,
    origineChemin: l.origine_path,
    // Un parent introuvable donne une date vide : la pièce n'appartient alors
    // à aucun exercice, et l'inventaire la nomme dans `sansExercice`.
    dateComptable: parId.get(l.entite_id) ?? "",
    entite: l.entite,
    entiteId: l.entite_id,
  }));
}

export async function inventaireExercice(exercice: number): Promise<Inventaire> {
  // ── Ce que la base désigne ────────────────────────────────────────────────
  const { data: facturesDb } = await supabaseAdmin
    .from("factures")
    .select("pdf_path, date_facture")
    .not("pdf_path", "is", null);

  const references: FichierReference[] = [];
  for (const f of (facturesDb ?? []) as { pdf_path: string; date_facture: string }[]) {
    references.push({ chemin: f.pdf_path, dateComptable: f.date_facture, categorie: "facture" });
  }

  const pieces = await datesComptablesDesPieces();
  for (const p of pieces) {
    references.push({ chemin: p.chemin, dateComptable: p.dateComptable, categorie: "piece" });
    if (p.origineChemin) {
      references.push({
        chemin: p.origineChemin, dateComptable: p.dateComptable, categorie: "piece_origine",
      });
    }
  }

  // ── Ce que le stockage porte ──────────────────────────────────────────────
  // Les PDF sont rangés par exercice : un seul dossier à lire.
  const tailles: TaillesStockage = new Map();
  let appels = 0;
  const prefixes: string[] = [];

  const facturesDuBucket = await listerDossier(BUCKET_FACTURES, String(exercice));
  appels += facturesDuBucket.appels;
  for (const [chemin, octets] of facturesDuBucket.chemins) {
    tailles.set(chemin, octets);
    prefixes.push(`${exercice}/`);
  }

  // Les justificatifs sont rangés par entité : un appel par dossier de pièce.
  const dossiersPieces = new Set(
    pieces.map((p) => p.chemin.split("/").slice(0, 2).join("/")).filter(Boolean),
  );
  for (const dossier of dossiersPieces) {
    const lu = await listerDossier(BUCKET_JUSTIFICATIFS, dossier);
    appels += lu.appels;
    for (const [chemin, octets] of lu.chemins) tailles.set(chemin, octets);
    prefixes.push(`${dossier}/`);
  }

  // Les factures emises dont le document n existe pas : elles ne sont
  // referencees nulle part, donc aucun parcours de stockage ne les verrait.
  const sansDocument = (await facturesSansDocument()).map((f) => ({
    id: f.id, numero: f.numero, statut: f.statut, dateComptable: f.date_facture,
    renonceLe: f.document_renonce_le,
  }));
  // Le chemin est ecrit, l objet a disparu : ce n est pas la meme chose, et ca
  // ne se repare pas de la meme facon.
  const perdus = await documentsPerdus();

  const perimetre = new Set(prefixes);
  return inventorier({
    exercice,
    references,
    tailles,
    facturesSansDocument: sansDocument,
    facturesDocumentPerdu: perdus.map((p) => ({ numero: p.numero, chemin: p.chemin })),
    sansExercice: pieces
      .filter((p) => !p.dateComptable)
      .map((p) => ({ chemin: p.chemin, entite: p.entite, entiteId: p.entiteId })),
    // Un fichier n'est un orphelin que dans un dossier qu'on a effectivement
    // parcouru. Ailleurs, on ne sait pas — et on ne le prétend pas.
    dansLePerimetre: (chemin) =>
      [...perimetre].some((p) => chemin.startsWith(p)),
    appelsStockage: appels,
  });
}

/** Les exercices sur lesquels il y a quelque chose à dire. */
export async function exercicesConnus(): Promise<number[]> {
  const { data } = await supabaseAdmin
    .from("factures")
    .select("exercice")
    .not("pdf_path", "is", null);
  const annees = new Set((data ?? []).map((f) => (f as { exercice: number }).exercice));
  return [...annees].filter(Boolean).sort((a, b) => b - a);
}
