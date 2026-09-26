import { describe, it, expect, vi, beforeEach } from "vitest";
import sharp from "sharp";

/**
 * Le dépôt d'image : ce qui arrive dans le bucket, et ce qui n'y arrive pas.
 *
 * Une photo de chien est souvent prise au domicile du client. Si ses
 * coordonnées survivent au dépôt, l'adresse de ce client part avec l'image.
 *
 * Le bucket a été fermé au lot 24 (S-05) : il ne se lit plus que par une URL
 * signée d'une heure. Le nettoyage garde tout son sens pour autant — une photo
 * qu'on télécharge légitimement, puis qui circule, emporterait encore ses
 * coordonnées. Fermer la porte ne nettoie pas ce qui sort par la porte.
 */

const H = vi.hoisted(() => ({
  deposes: [] as { bucket: string; chemin: string; octets: Buffer; type?: string }[],
  echecDepot: false,
}));

vi.mock("@/src/lib/supabase-admin", () => ({
  supabaseAdmin: {
    storage: {
      from: (bucket: string) => ({
        upload: async (chemin: string, octets: Buffer, opts?: { contentType?: string }) => {
          if (H.echecDepot) return { error: { message: "bucket injoignable" } };
          H.deposes.push({ bucket, chemin, octets, type: opts?.contentType });
          return { error: null };
        },
      }),
    },
  },
}));

import { deposerImage } from "@/src/lib/depotImage";
import { FORMAT_CHIEN } from "@/src/lib/imageBoutique";

/**
 * Le tag EXIF 0x8825 annonce le bloc des coordonnées. On le cherche par ses
 * OCTETS, dans les deux boutismes : les trois lettres « GPS » ne figurent
 * nulle part dans un EXIF, où les champs sont numérotés.
 */
const TAG_GPS = [Buffer.from([0x88, 0x25]), Buffer.from([0x25, 0x88])];
const porteDesCoordonnees = (o: Buffer | undefined) =>
  !!o && TAG_GPS.some((tag) => o.includes(tag));

/** Une photo d'appareil : EXIF complet, coordonnées dans IFD3 — là où libvips range le GPS. */
async function photoDuSalonDuClient(largeur = 3000, hauteur = 2000): Promise<Buffer> {
  return sharp({ create: { width: largeur, height: hauteur, channels: 3, background: { r: 120, g: 90, b: 60 } } })
    .withExifMerge({
      IFD0: { Make: "ZZ Appareil de recette", Model: "ZZ 1" },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "46/1 31/1 0/1", GPSLongitudeRef: "E", GPSLongitude: "6/1 38/1 0/1" },
    })
    .jpeg()
    .toBuffer();
}

const fichier = (octets: Buffer, type = "image/jpeg", nom = "photo.jpg") =>
  new File([new Uint8Array(octets)], nom, { type });

beforeEach(() => {
  H.deposes.length = 0;
  H.echecDepot = false;
});

describe("dépôt d'une photo de chien", () => {
  it("la photo de départ porte bien des coordonnées : sans quoi le test ne prouverait rien", async () => {
    const { exif } = await sharp(await photoDuSalonDuClient()).metadata();
    expect(porteDesCoordonnees(exif)).toBe(true);
  });

  it("ce qui est déposé ne porte plus la position du domicile", async () => {
    const depart = await photoDuSalonDuClient();
    // Le départ est vérifié porteur AVANT qu'on conclue quoi que ce soit sur
    // l'arrivée : c'est ce qui manquait au test de l'EXIF jusqu'au 3ed0ace.
    expect(porteDesCoordonnees((await sharp(depart).metadata()).exif)).toBe(true);

    const r = await deposerImage({
      bucket: "chiens-photos", cheminSansExtension: "ch1/1", fichier: fichier(depart), format: FORMAT_CHIEN,
    });

    expect(r.ok).toBe(true);
    expect(H.deposes).toHaveLength(1);
    const arrivee = H.deposes[0].octets;
    expect(porteDesCoordonnees((await sharp(arrivee).metadata()).exif)).toBe(false);
    // Ni EXIF du tout, ni marque d'appareil dans les octets du fichier.
    expect((await sharp(arrivee).metadata()).exif).toBeUndefined();
    expect(arrivee.toString("latin1")).not.toContain("ZZ Appareil de recette");
  });

  it("ce qui est déposé est du WebP, borné à 1600 px sur le plus grand côté", async () => {
    const r = await deposerImage({
      bucket: "chiens-photos", cheminSansExtension: "ch1/1",
      fichier: fichier(await photoDuSalonDuClient(3000, 2000)), format: FORMAT_CHIEN,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.chemin.endsWith(".webp")).toBe(true);
    expect(H.deposes[0].type).toBe("image/webp");
    const meta = await sharp(H.deposes[0].octets).metadata();
    expect(Math.max(meta.width!, meta.height!)).toBe(1600);
  });

  it("une photo debout est bornée pareil : c'est le plus grand côté qui compte", async () => {
    await deposerImage({
      bucket: "chiens-photos", cheminSansExtension: "ch1/1",
      fichier: fichier(await photoDuSalonDuClient(2000, 3000)), format: FORMAT_CHIEN,
    });
    const meta = await sharp(H.deposes[0].octets).metadata();
    expect(Math.max(meta.width!, meta.height!)).toBe(1600);
    expect(meta.height).toBe(1600);
  });

  it("une photo plus petite que le format n'est pas agrandie", async () => {
    await deposerImage({
      bucket: "chiens-photos", cheminSansExtension: "ch1/1",
      fichier: fichier(await photoDuSalonDuClient(800, 600)), format: FORMAT_CHIEN,
    });
    const meta = await sharp(H.deposes[0].octets).metadata();
    expect(meta.width).toBe(800);
  });
});

describe("ce qui est refusé ne part jamais au stockage", () => {
  it("un type non accepté est refusé, et rien n'est déposé", async () => {
    const r = await deposerImage({
      bucket: "chiens-photos", cheminSansExtension: "ch1/1",
      fichier: fichier(Buffer.from("%PDF-1.4 ceci est un PDF"), "application/pdf", "ticket.pdf"),
      format: FORMAT_CHIEN,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.statut).toBe(400);
    expect(r.error).toContain("Format accepté");
    expect(H.deposes).toHaveLength(0);
  });

  it("un fichier que la bibliothèque ne sait pas lire est refusé, jamais déposé brut", async () => {
    // Un HEIC d'iPhone tombe ici : les binaires de sharp n'embarquent aucun
    // codec HEVC. Le type est accepté, la lecture échoue — et rien ne part.
    const r = await deposerImage({
      bucket: "chiens-photos", cheminSansExtension: "ch1/1",
      fichier: fichier(Buffer.from("ceci n'est pas une image"), "image/heic", "IMG_0001.HEIC"),
      format: FORMAT_CHIEN,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.statut).toBe(400);
    expect(r.error.length).toBeGreaterThan(20); // une phrase, pas un code
    expect(H.deposes).toHaveLength(0);
  });

  it("un dépôt qui échoue le dit, sans prétendre avoir réussi", async () => {
    H.echecDepot = true;
    const r = await deposerImage({
      bucket: "chiens-photos", cheminSansExtension: "ch1/1",
      fichier: fichier(await photoDuSalonDuClient(600, 400)), format: FORMAT_CHIEN,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.statut).toBe(500);
  });
});
