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

/**
 * Le tag EXIF 0x8825 : celui qui annonce le bloc des coordonnées. Selon le
 * boutisme du fichier il s'écrit dans un sens ou dans l'autre.
 *
 * On le cherche par ses OCTETS, jamais par la chaîne « GPS » : ces trois
 * lettres ne figurent nulle part dans un EXIF, où les champs sont numérotés.
 * Les chercher revient à ne rien vérifier.
 */
const TAG_GPS = [Buffer.from([0x88, 0x25]), Buffer.from([0x25, 0x88])];
const porteDesCoordonnees = (o: Buffer | undefined) =>
  !!o && TAG_GPS.some((tag) => o.includes(tag));

/**
 * Un JPEG de 1200×800 avec de l'EXIF ET des coordonnées.
 *
 * Les coordonnées vont dans IFD3 : c'est là que libvips range le bloc GPS.
 * Écrites sous une clé « GPS », elles étaient silencieusement ignorées — la
 * photo de départ n'en portait aucune, et le test qui vérifiait leur retrait
 * ne pouvait rien constater.
 */
async function photoAvecExif(): Promise<Buffer> {
  return sharp({
    create: { width: 1200, height: 800, channels: 3, background: { r: 30, g: 60, b: 120 } },
  })
    .withExifMerge({
      IFD0: { Make: "ZZ Appareil de recette", Model: "ZZ 1", Copyright: "ZZ" },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "47/1 21/1 0/1", GPSLongitudeRef: "E" },
    })
    .jpeg()
    .toBuffer();
}

describe("conversion des photos (sharp)", () => {
  it("l'image de départ porte bien un EXIF ET des coordonnées : sans quoi le test ne prouverait rien", async () => {
    const { exif } = await sharp(await photoAvecExif()).metadata();
    expect(exif).toBeDefined();
    expect(exif!.toString("latin1")).toContain("ZZ Appareil de recette");
    expect(porteDesCoordonnees(exif)).toBe(true);
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

  it("ne recopie ni l'EXIF, ni la marque de l'appareil", async () => {
    const res = await convertirEnWebp(await photoAvecExif(), FORMAT_ARTICLE);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const meta = await sharp(res.octets).metadata();
    expect(meta.exif).toBeUndefined();
    // Et rien ne traîne dans les octets du fichier produit.
    expect(res.octets.toString("latin1")).not.toContain("ZZ Appareil de recette");
  });

  // Une photo de chien prise chez un client porte l'adresse de ce client.
  // Ce constat est seul dans son test : derrière une assertion qui tombe, il
  // ne s'exécuterait pas, et personne ne saurait que la position est passée.
  it("ne recopie pas la position : la photo publiée ne dit pas où elle a été prise", async () => {
    const depart = await photoAvecExif();
    expect(porteDesCoordonnees((await sharp(depart).metadata()).exif)).toBe(true);

    const res = await convertirEnWebp(depart, FORMAT_ARTICLE);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(porteDesCoordonnees((await sharp(res.octets).metadata()).exif)).toBe(false);
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
