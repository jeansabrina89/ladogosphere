import { createHash } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { extensionPiece, refusFichierPiece } from "@/src/lib/depensesLogique";

/**
 * Pièces justificatives : dépôt dans un bucket PRIVÉ, lecture par URL signée
 * de courte durée seulement. Aucune URL publique n'est jamais fabriquée.
 */

export const BUCKET_JUSTIFICATIFS = "justificatifs";

export type EntitePiece = "depense" | "facture" | "paiement";

export type Piece = {
  id: string;
  entite: EntitePiece;
  entite_id: string;
  nom_fichier: string;
  mime: string;
  taille: number;
  storage_path: string;
  sha256: string | null;
  created_at: string;
};

export type ResultatDepot = { ok: true; piece: Piece } | { ok: false; error: string };

/** Nom de fichier sûr : on ne fait jamais confiance à celui du navigateur. */
function nomSur(nom: string): string {
  return (nom || "justificatif")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]/g, "-")
    .slice(0, 120);
}

export async function deposerPiece(input: {
  entite: EntitePiece;
  entite_id: string;
  fichier: File;
  uploaded_by?: string | null;
}): Promise<ResultatDepot> {
  const { fichier } = input;

  const refus = refusFichierPiece({ type: fichier.type, size: fichier.size });
  if (refus) return { ok: false, error: refus };

  const octets = Buffer.from(await fichier.arrayBuffer());
  const sha256 = createHash("sha256").update(octets).digest("hex");
  const ext = extensionPiece(fichier.type);
  const chemin = `${input.entite}/${input.entite_id}/${Date.now()}-${sha256.slice(0, 12)}.${ext}`;

  const { error: erreurDepot } = await supabaseAdmin.storage
    .from(BUCKET_JUSTIFICATIFS)
    .upload(chemin, octets, { contentType: fichier.type, upsert: false });
  if (erreurDepot) {
    Sentry.captureException(erreurDepot);
    return { ok: false, error: "Le dépôt du fichier a échoué. Réessayez." };
  }

  const { data, error } = await supabaseAdmin
    .from("pieces")
    .insert({
      entite: input.entite,
      entite_id: input.entite_id,
      nom_fichier: nomSur(fichier.name),
      mime: fichier.type,
      taille: octets.length,
      storage_path: chemin,
      sha256,
      uploaded_by: input.uploaded_by ?? null,
    })
    .select("id, entite, entite_id, nom_fichier, mime, taille, storage_path, sha256, created_at")
    .single();

  if (error || !data) {
    // Pas de fichier orphelin dans le bucket si la ligne n'a pas pu être écrite.
    await supabaseAdmin.storage.from(BUCKET_JUSTIFICATIFS).remove([chemin]);
    return { ok: false, error: error?.message ?? "Enregistrement de la pièce impossible." };
  }

  return { ok: true, piece: data as Piece };
}

export async function listerPieces(entite: EntitePiece, entiteId: string): Promise<Piece[]> {
  const { data } = await supabaseAdmin
    .from("pieces")
    .select("id, entite, entite_id, nom_fichier, mime, taille, storage_path, sha256, created_at")
    .eq("entite", entite)
    .eq("entite_id", entiteId)
    .order("created_at", { ascending: true });
  return (data ?? []) as Piece[];
}

export async function compterPieces(entite: EntitePiece, entiteId: string): Promise<number> {
  const { count } = await supabaseAdmin
    .from("pieces")
    .select("*", { count: "exact", head: true })
    .eq("entite", entite)
    .eq("entite_id", entiteId);
  return count ?? 0;
}

/** URL signée de courte durée — le seul moyen de lire un justificatif. */
export async function urlSigneePiece(pieceId: string, secondes = 120): Promise<string | null> {
  const { data: piece } = await supabaseAdmin
    .from("pieces")
    .select("storage_path")
    .eq("id", pieceId)
    .maybeSingle();
  if (!piece?.storage_path) return null;

  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET_JUSTIFICATIFS)
    .createSignedUrl(piece.storage_path as string, secondes);
  if (error) {
    Sentry.captureException(error);
    return null;
  }
  return data?.signedUrl ?? null;
}

/**
 * Retrait d'une pièce. Réservé aux brouillons côté appelant : le justificatif
 * d'une dépense validée fait partie de la pièce comptable.
 */
export async function supprimerPiece(pieceId: string): Promise<{ error?: string }> {
  const { data: piece } = await supabaseAdmin
    .from("pieces")
    .select("storage_path")
    .eq("id", pieceId)
    .maybeSingle();
  if (!piece) return { error: "Pièce introuvable." };

  const { error } = await supabaseAdmin.from("pieces").delete().eq("id", pieceId);
  if (error) return { error: error.message };

  await supabaseAdmin.storage
    .from(BUCKET_JUSTIFICATIFS)
    .remove([piece.storage_path as string]);
  return {};
}
