import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { convertirEnWebp, FORMAT_ARTICLE, refusFichierImage } from "@/src/lib/imageBoutique";

/**
 * Le passage de sharp en 0.35 : la conversion des photos doit continuer de
 * faire les deux choses qui comptent — redimensionner, et NE PAS recopier les
 * métadonnées (EXIF), qui portent l'appareil et parfois la position GPS de la
 * maison du client.
 *
 * L'image de départ est fabriquée ici, avec un EXIF, pour ne dépendre d'aucun
 * fichier du dépôt.
 */

/** Un JPEG de 1200×800 avec de l'EXIF dedans. */
async function photoAvecExif(): Promise<Buffer> {
  return sharp({
    create: { width: 1200, height: 800, channels: 3, background: { r: 30, g: 60, b: 120 } },
  })
    .withExifMerge({
      IFD0: { Make: "ZZ Appareil de recette", Model: "ZZ 1", Copyright: "ZZ" },
      // GPS ne figure pas dans le type de sharp, qui l'écrit pourtant — et
      // c'est exactement la donnée que la publication doit retirer.
      GPS: { GPSLatitudeRef: "N" },
    } as Parameters<ReturnType<typeof sharp>["withExifMerge"]>[0])
    .jpeg()
    .toBuffer();
}

describe("conversion des photos (sharp)", () => {
  it("l'image de départ porte bien un EXIF : sans quoi le test ne prouverait rien", async () => {
    const { exif } = await sharp(await photoAvecExif()).metadata();
    expect(exif).toBeDefined();
    expect(exif!.toString("latin1")).toContain("ZZ Appareil de recette");
  });

  it("redimensionne à la largeur du format et rend du WebP", async () => {
    const res = await convertirEnWebp(await photoAvecExif(), FORMAT_ARTICLE);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const meta = await sharp(res.octets).metadata();
    expect(meta.format).toBe("webp");
    expect(res.largeur).toBe(FORMAT_ARTICLE.largeur);
    expect(meta.width).toBe(FORMAT_ARTICLE.largeur);
    // Le format « article » est carré : la hauteur suit la largeur.
    expect(res.hauteur).toBe(FORMAT_ARTICLE.carre ? FORMAT_ARTICLE.largeur : meta.height);
  });

  it("ne recopie ni l'EXIF, ni la marque de l'appareil, ni la position", async () => {
    const res = await convertirEnWebp(await photoAvecExif(), FORMAT_ARTICLE);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const meta = await sharp(res.octets).metadata();
    expect(meta.exif).toBeUndefined();
    // Et rien ne traîne dans les octets du fichier produit.
    const contenu = res.octets.toString("latin1");
    expect(contenu).not.toContain("ZZ Appareil de recette");
    expect(contenu).not.toContain("GPS");
  });

  it("une image plus petite que le format n'est pas agrandie", async () => {
    const petite = await sharp({
      create: { width: 120, height: 120, channels: 3, background: { r: 10, g: 10, b: 10 } },
    }).jpeg().toBuffer();
    const res = await convertirEnWebp(petite, FORMAT_ARTICLE);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.largeur).toBeLessThanOrEqual(120);
  });

  it("ce qui n'est pas une image est refusé, sans exception", async () => {
    const res = await convertirEnWebp(Buffer.from("ceci n'est pas une image"), FORMAT_ARTICLE);
    expect(res.ok).toBe(false);
  });

  it("le garde-fou d'entrée n'a pas bougé : type déclaré et taille", () => {
    expect(refusFichierImage({ type: "image/jpeg", size: 1_000 })).toBeNull();
    expect(refusFichierImage({ type: "application/pdf", size: 1_000 })).toBeTruthy();
    expect(refusFichierImage({ type: "image/jpeg", size: 999_000_000 })).toBeTruthy();
  });
});
