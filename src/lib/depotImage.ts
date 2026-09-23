import { supabaseAdmin } from "@/src/lib/supabase-admin";
import {
  convertirEnWebp,
  refusFichierImage,
  type FormatImage,
} from "@/src/lib/imageBoutique";

/**
 * Le passage obligé de TOUT fichier vers le stockage.
 *
 * Une photo prise au téléphone porte la marque de l'appareil et, souvent, les
 * coordonnées GPS du lieu où elle a été prise — chez le client. Déposée telle
 * quelle dans un bucket public, elle publie cette adresse.
 *
 * Le retrait était la responsabilité de chaque route : quatre le faisaient,
 * trois déposaient les octets bruts. Une règle que chaque appelant doit se
 * rappeler est une règle que le prochain appelant oubliera. Elle est donc ici,
 * sur le seul chemin qui mène au bucket.
 *
 * Deux portes, et deux seulement :
 *   • `deposerImage` — convertit en WebP, ce qui redimensionne ET jette les
 *     métadonnées, puis dépose. Ce que la bibliothèque ne sait pas lire est
 *     refusé : jamais de dépôt brut en repli.
 *   • `deposerDocument` — pour un PDF, qui ne se convertit pas. Elle REFUSE
 *     une image, afin qu'on ne puisse pas s'en servir pour contourner la
 *     première. Les métadonnées d'un PDF ne sont pas retirées : risque
 *     accepté, écrit et daté dans `docs/SECURITE.md`.
 *
 * `tests/depotImageObligatoire.test.ts` relit les sources et refuse tout envoi
 * au stockage écrit ailleurs qu'ici. Il n'a aucune exception à tolérer.
 */

export type ResultatDepotImage =
  | { ok: true; chemin: string; largeur: number; hauteur: number; octets: Buffer }
  | { ok: false; error: string; statut: 400 | 500 };

export async function deposerImage(input: {
  /** Le bucket d'arrivée. */
  bucket: string;
  /** Le chemin SANS extension : elle est toujours `.webp` à l'arrivée. */
  cheminSansExtension: string;
  /** Le fichier reçu, tel que le formulaire l'a donné. */
  fichier: File;
  /** La taille de sortie. */
  format: FormatImage;
  /** Écraser un objet de même nom. Par défaut non. */
  ecraser?: boolean;
  /** Le refus à dire quand le type n'est pas accepté, si le lieu a le sien. */
  refusDeType?: (mime: string) => string | null;
}): Promise<ResultatDepotImage> {
  const { bucket, fichier, format } = input;

  const refusDuLieu = input.refusDeType?.((fichier.type ?? "").toLowerCase());
  if (refusDuLieu) return { ok: false, error: refusDuLieu, statut: 400 };

  const refus = refusFichierImage({ type: fichier.type, size: fichier.size });
  if (refus) return { ok: false, error: refus, statut: 400 };

  const conversion = await convertirEnWebp(Buffer.from(await fichier.arrayBuffer()), format);
  // Un format illisible s'arrête ici, avec la phrase de la conversion : le
  // fichier d'origine ne part pas au stockage en consolation.
  if (!conversion.ok) return { ok: false, error: conversion.error, statut: 400 };

  const chemin = `${input.cheminSansExtension}.webp`;
  const { error } = await supabaseAdmin.storage
    .from(bucket)
    .upload(chemin, conversion.octets, { contentType: "image/webp", upsert: !!input.ecraser });
  if (error) return { ok: false, error: "Le dépôt de l'image a échoué.", statut: 500 };

  return {
    ok: true,
    chemin,
    largeur: conversion.largeur,
    hauteur: conversion.hauteur,
    octets: conversion.octets,
  };
}

export type ResultatDepotDocument =
  | { ok: true; chemin: string; dejaPresent: boolean }
  | { ok: false; error: string; statut: 400 | 500 };

/**
 * Dépôt d'un PDF — le nôtre (une facture) ou celui d'un justificatif.
 *
 * Un PDF ne se convertit pas : le faire passer par une conversion d'image le
 * détruirait. Il est déposé tel quel, avec ses métadonnées éventuelles. Cela
 * n'est acceptable que vers un bucket PRIVÉ, lu par URL signée — voir
 * `docs/SECURITE.md`, « Risque accepté : les PDF déposés ne sont pas
 * nettoyés ».
 *
 * Cette porte refuse tout ce qui n'est pas un PDF : elle ne doit pas pouvoir
 * servir à faire entrer une image sans la nettoyer.
 */
export async function deposerDocument(input: {
  bucket: string;
  /** Le chemin complet, extension comprise. */
  chemin: string;
  octets: Buffer;
  type: string;
  /** Un objet déjà là : erreur, ou bien on garde celui qui existe. */
  siDejaPresent?: "erreur" | "garder";
}): Promise<ResultatDepotDocument> {
  if ((input.type ?? "").toLowerCase() !== "application/pdf") {
    return {
      ok: false,
      // Une image qui arriverait ici contournerait le nettoyage.
      error: "Seul un PDF se dépose sans conversion. Une image passe par deposerImage().",
      statut: 400,
    };
  }

  const { error } = await supabaseAdmin.storage
    .from(input.bucket)
    .upload(input.chemin, input.octets, { contentType: "application/pdf", upsert: false });

  if (error) {
    const dejaLa = /exists/i.test(error.message ?? "");
    // Un PDF de facture est immuable : le retrouver en place n'est pas un échec.
    if (dejaLa && input.siDejaPresent === "garder") {
      return { ok: true, chemin: input.chemin, dejaPresent: true };
    }
    return { ok: false, error: "Le dépôt du fichier a échoué. Réessayez.", statut: 500 };
  }

  return { ok: true, chemin: input.chemin, dejaPresent: false };
}
