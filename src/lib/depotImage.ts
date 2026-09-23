import { supabaseAdmin } from "@/src/lib/supabase-admin";
import {
  convertirEnWebp,
  refusFichierImage,
  type FormatImage,
} from "@/src/lib/imageBoutique";

/**
 * Le passage obligé de TOUTE image vers le stockage.
 *
 * Une photo prise au téléphone porte la marque de l'appareil et, souvent, les
 * coordonnées GPS du lieu où elle a été prise — chez le client. Déposée telle
 * quelle dans un bucket public, elle publie cette adresse.
 *
 * Le retrait était jusqu'ici la responsabilité de chaque route : quatre le
 * faisaient, trois déposaient les octets bruts. Une règle que chaque appelant
 * doit se rappeler est une règle que le prochain appelant oubliera. Elle est
 * donc ici, sur le seul chemin qui mène au bucket.
 *
 * Ce que fait `deposerImage`, dans cet ordre :
 *   1. refuse ce qui n'est pas une image acceptée (type déclaré, poids) ;
 *   2. convertit en WebP — ce qui redimensionne ET jette les métadonnées, car
 *      sharp ne recopie rien qu'on ne lui demande de garder ;
 *   3. refuse, avec une phrase utile, ce que la bibliothèque ne sait pas lire
 *      (le HEIC des iPhone : les binaires de sharp n'embarquent aucun codec
 *      HEVC) — jamais de dépôt brut en repli ;
 *   4. dépose le WebP, et lui seul.
 *
 * Un test (`tests/depotImageObligatoire.test.ts`) relit les sources et refuse
 * tout envoi d'image vers le stockage écrit ailleurs qu'ici.
 */

export type ResultatDepotImage =
  | { ok: true; chemin: string; largeur: number; hauteur: number; poids: number }
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
}): Promise<ResultatDepotImage> {
  const { bucket, fichier, format } = input;

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
    poids: conversion.octets.length,
  };
}
