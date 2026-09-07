import sharp from "sharp";

/**
 * Images de la boutique : ce que dépose Sabrina, tel que le sort son téléphone,
 * et ce qui finit dans le bucket — du WebP redimensionné, jamais autre chose.
 *
 * Le bucket public n'accepte que jpeg, png et webp : un SVG y serait du script
 * exécuté chez le visiteur. Comme tout ressort en WebP, la règle est tenue par
 * construction.
 */

export const BUCKET_PHOTOS = "boutique-photos";

/** Ce qu'on accepte de recevoir. Le HEIC des iPhone en fait partie. */
export const MIMES_ACCEPTES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/avif",
] as const;

/**
 * 15 Mo à l'arrivée : une photo d'appareil peut peser lourd. Ce qui est stocké,
 * lui, tient largement sous les 5 Mo du bucket après conversion.
 */
export const TAILLE_MAX_DEPOT = 15 * 1024 * 1024;

/** Vignette carrée d'un coloris : la texture se juge, elle ne se lit pas. */
export const LARGEUR_COLORIS = 400;
/** Photo d'article : large, mais pas au-delà de ce qu'un écran affiche. */
export const LARGEUR_ARTICLE = 1200;

export type FormatImage = { largeur: number; carre: boolean };

export const FORMAT_COLORIS: FormatImage = { largeur: LARGEUR_COLORIS, carre: true };
export const FORMAT_ARTICLE: FormatImage = { largeur: LARGEUR_ARTICLE, carre: false };

/** Refus du fichier reçu, ou null s'il peut être converti. */
export function refusFichierImage(f: { type?: string | null; size?: number | null }): string | null {
  const mime = (f.type ?? "").toLowerCase();
  if (!MIMES_ACCEPTES.includes(mime as (typeof MIMES_ACCEPTES)[number])) {
    return "Format accepté : photo JPEG, PNG, WebP ou HEIC. Un fichier SVG ou PDF n'est pas une photo.";
  }
  const taille = Number(f.size ?? 0);
  if (!taille) return "Fichier vide.";
  if (taille > TAILLE_MAX_DEPOT) {
    return `Fichier trop lourd : ${(taille / 1024 / 1024).toFixed(1)} Mo pour 15 Mo au maximum.`;
  }
  return null;
}

export type ResultatConversion =
  | { ok: true; octets: Buffer; largeur: number; hauteur: number }
  | { ok: false; error: string };

/**
 * Conversion en WebP, redimensionnée. Un coloris devient une vignette carrée
 * (recadrée au centre) ; une photo d'article garde ses proportions.
 *
 * Une image plus petite que la cible n'est jamais agrandie : mieux vaut une
 * petite photo nette qu'une grande floue.
 */
export async function convertirEnWebp(
  octets: Buffer,
  format: FormatImage
): Promise<ResultatConversion> {
  try {
    const image = sharp(octets, { failOn: "error" }).rotate(); // rotate() : l'EXIF du téléphone

    const redimensionnee = format.carre
      ? image.resize(format.largeur, format.largeur, { fit: "cover", position: "centre", withoutEnlargement: true })
      : image.resize({ width: format.largeur, withoutEnlargement: true });

    const { data, info } = await redimensionnee
      .webp({ quality: 82, effort: 4 })
      .toBuffer({ resolveWithObject: true });

    return { ok: true, octets: data, largeur: info.width, hauteur: info.height };
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    // Le HEIC des iPhone n'est pas toujours décodable côté serveur : on le dit,
    // avec la manœuvre qui débloque, plutôt qu'un « échec » sans suite.
    if (/heif|heic|unsupported image format|bad seek/i.test(message)) {
      return {
        ok: false,
        error:
          "Cette photo est au format HEIC, que le serveur ne sait pas ouvrir. " +
          "Sur iPhone : Réglages ▸ Appareil photo ▸ Formats ▸ « Le plus compatible », " +
          "ou envoyez-la depuis Photos, qui la convertit en JPEG.",
      };
    }
    return { ok: false, error: "Cette image n'a pas pu être lue. Essayez une autre photo." };
  }
}

/** Chemin de stockage : jamais le nom d'origine, qui vient du navigateur. */
export function cheminImage(prefixe: string, id: string): string {
  return `${prefixe}/${id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`;
}
