import { createHash } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { refusFichierPiece } from "@/src/lib/depensesLogique";
import { deposerImage, deposerDocument } from "@/src/lib/depotImage";
import { FORMAT_PIECE } from "@/src/lib/imageBoutique";

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
  /**
   * L'original remis, quand il a été conservé — null pour un PDF (qui l'est
   * déjà) et pour les pièces antérieures au 24 septembre 2026.
   *
   * Ce fichier porte l'EXIF et la position : il ne s'affiche jamais. Seule
   * `/api/pieces/[id]/origine` le sert, par URL signée.
   */
  origine_path: string | null;
  origine_mime: string | null;
  origine_sha256: string | null;
};

/** Une seule chaîne, non concaténée : supabase-js en déduit la forme des lignes. */
const CHAMPS_PIECE = "id, entite, entite_id, nom_fichier, mime, taille, storage_path, sha256, created_at, origine_path, origine_mime, origine_sha256";

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

  const estPdf = fichier.type.toLowerCase() === "application/pdf";
  const base = `${input.entite}/${input.entite_id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Une photo de ticket est souvent prise au domicile d'un client : elle passe
  // par le dépôt commun, qui la convertit et jette ses métadonnées. Un PDF ne
  // se convertit pas — déposé tel quel, risque écrit dans docs/SECURITE.md, et
  // le bucket est privé.
  //
  // Ce qu'on enregistre ensuite décrit ce qui est DANS le bucket, pas ce qui a
  // été reçu : une photo y est arrivée en WebP, redimensionnée.
  let chemin: string;
  let octets: Buffer;
  let mime: string;
  /** Renseigné pour une image seulement : un PDF EST déjà l'original. */
  let origine: { chemin: string; mime: string; sha256: string } | null = null;

  if (estPdf) {
    const brut = Buffer.from(await fichier.arrayBuffer());
    const depot = await deposerDocument({
      bucket: BUCKET_JUSTIFICATIFS,
      chemin: `${base}.pdf`,
      octets: brut,
      type: fichier.type,
    });
    if (!depot.ok) {
      Sentry.captureException(new Error(depot.error));
      return { ok: false, error: depot.error };
    }
    chemin = depot.chemin;
    octets = brut;
    mime = "application/pdf";
  } else {
    // L'original est conservé À CÔTÉ du nettoyé : une pièce comptable se garde
    // dix ans, et rien ne dit qu'une conversion soit admise en cas de contrôle.
    const depot = await deposerImage({
      bucket: BUCKET_JUSTIFICATIFS,
      cheminSansExtension: base,
      fichier,
      format: FORMAT_PIECE,
      garderOriginal: true,
    });
    if (!depot.ok) {
      if (depot.statut === 500) Sentry.captureException(new Error(depot.error));
      return { ok: false, error: depot.error };
    }
    chemin = depot.chemin;
    octets = depot.octets;
    mime = "image/webp";
    if (depot.origine) {
      origine = {
        chemin: depot.origine.chemin,
        mime: depot.origine.mime,
        sha256: createHash("sha256").update(depot.origine.octets).digest("hex"),
      };
    }
  }

  const sha256 = createHash("sha256").update(octets).digest("hex");

  const { data, error } = await supabaseAdmin
    .from("pieces")
    .insert({
      entite: input.entite,
      entite_id: input.entite_id,
      nom_fichier: nomSur(fichier.name),
      mime,
      taille: octets.length,
      storage_path: chemin,
      sha256,
      origine_path: origine?.chemin ?? null,
      origine_mime: origine?.mime ?? null,
      origine_sha256: origine?.sha256 ?? null,
      uploaded_by: input.uploaded_by ?? null,
    })
    .select(CHAMPS_PIECE)
    .single();

  if (error || !data) {
    // Pas de fichier orphelin dans le bucket si la ligne n'a pas pu être écrite.
    // Les DEUX s'en vont : l'original sans sa ligne n'est plus retrouvable.
    await supabaseAdmin.storage
      .from(BUCKET_JUSTIFICATIFS)
      .remove(origine ? [chemin, origine.chemin] : [chemin]);
    return { ok: false, error: error?.message ?? "Enregistrement de la pièce impossible." };
  }

  return { ok: true, piece: data as Piece };
}

export async function listerPieces(entite: EntitePiece, entiteId: string): Promise<Piece[]> {
  const { data } = await supabaseAdmin
    .from("pieces")
    .select(CHAMPS_PIECE)
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
 * URL signée de l'ORIGINAL — le fichier remis, avec ses métadonnées.
 *
 * Rien ne l'affiche : il n'existe que pour la consultation comptable et
 * l'export. Null quand la pièce n'en a pas (un PDF, ou une pièce déposée avant
 * le 24 septembre 2026).
 */
export async function urlSigneeOriginePiece(pieceId: string, secondes = 120): Promise<string | null> {
  const { data: piece } = await supabaseAdmin
    .from("pieces")
    .select("origine_path")
    .eq("id", pieceId)
    .maybeSingle();
  if (!piece?.origine_path) return null;

  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET_JUSTIFICATIFS)
    .createSignedUrl(piece.origine_path as string, secondes);
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
    .select("storage_path, origine_path")
    .eq("id", pieceId)
    .maybeSingle();
  if (!piece) return { error: "Pièce introuvable." };

  const { error } = await supabaseAdmin.from("pieces").delete().eq("id", pieceId);
  if (error) return { error: error.message };

  // Les DEUX fichiers s'en vont. Un original resté seul dans le bucket, c'est
  // une pièce qu'on croit effacée et qui ne l'est pas — avec ses métadonnées.
  const aRetirer = [piece.storage_path as string];
  if (piece.origine_path) aRetirer.push(piece.origine_path as string);

  const { error: erreurRetrait } = await supabaseAdmin.storage
    .from(BUCKET_JUSTIFICATIFS)
    .remove(aRetirer);
  if (erreurRetrait) {
    // La ligne est partie, les fichiers non : plus rien dans l'application ne
    // les désigne. Ça se dit.
    Sentry.captureMessage("Fichiers restés au stockage après suppression d'une pièce", {
      level: "error",
      tags: { endroit: "pieces.supprimerPiece" },
      extra: { chemins: aRetirer, erreur: erreurRetrait.message },
    });
  }
  return {};
}
