import { describe, it, expect, vi, beforeEach } from "vitest";
import sharp from "sharp";

/**
 * Les justificatifs : une photo de ticket est souvent prise chez un client, ou
 * chez un fournisseur dont l'adresse n'a pas à voyager. Elle passe par le même
 * nettoyage que la photo d'un chien.
 *
 * Le PDF, lui, ne se convertit pas — et il doit continuer de passer, sans quoi
 * c'est la saisie des dépenses qu'on casse.
 */

const H = vi.hoisted(() => ({
  deposes: [] as { bucket: string; chemin: string; octets: Buffer; type?: string }[],
  lignes: [] as Record<string, unknown>[],
}));

vi.mock("@sentry/nextjs", () => ({ captureException: () => {}, captureMessage: () => {} }));

vi.mock("@/src/lib/supabase-admin", () => ({
  supabaseAdmin: {
    storage: {
      from: (bucket: string) => ({
        upload: async (chemin: string, octets: Buffer, opts?: { contentType?: string }) => {
          H.deposes.push({ bucket, chemin, octets, type: opts?.contentType });
          return { error: null };
        },
        remove: async () => ({ error: null }),
      }),
    },
    from: () => ({
      insert: (ligne: Record<string, unknown>) => {
        H.lignes.push(ligne);
        return {
          select: () => ({
            single: async () => ({ data: { id: "p1", ...ligne }, error: null }),
          }),
        };
      },
    }),
  },
}));

import { deposerPiece } from "@/src/lib/pieces";

const TAG_GPS = [Buffer.from([0x88, 0x25]), Buffer.from([0x25, 0x88])];
const porteDesCoordonnees = (o: Buffer | undefined) =>
  !!o && TAG_GPS.some((tag) => o.includes(tag));

/** Un ticket photographié : EXIF complet, coordonnées dans IFD3. */
async function ticketPhotographie(largeur = 3000, hauteur = 4000): Promise<Buffer> {
  return sharp({ create: { width: largeur, height: hauteur, channels: 3, background: { r: 240, g: 240, b: 235 } } })
    .withExifMerge({
      IFD0: { Make: "ZZ Appareil de recette", Model: "ZZ 1" },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "46/1 31/1 0/1", GPSLongitudeRef: "E" },
    })
    .jpeg()
    .toBuffer();
}

const fichier = (octets: Buffer, type: string, nom: string) =>
  new File([new Uint8Array(octets)], nom, { type });

beforeEach(() => {
  H.deposes.length = 0;
  H.lignes.length = 0;
});

describe("justificatif : une photo", () => {
  it("ressort nettoyée, bornée, et c'est le fichier NETTOYÉ qui est enregistré", async () => {
    const depart = await ticketPhotographie();
    // Le départ porte bien des coordonnées : sans quoi la suite ne prouve rien.
    expect(porteDesCoordonnees((await sharp(depart).metadata()).exif)).toBe(true);

    const r = await deposerPiece({
      entite: "depense", entite_id: "d1", fichier: fichier(depart, "image/jpeg", "ticket.jpg"),
    });

    expect(r.ok).toBe(true);
    expect(H.deposes).toHaveLength(1);
    const arrivee = H.deposes[0];
    expect(arrivee.bucket).toBe("justificatifs");

    // Le constat qui compte d'abord : ce qui est dans le bucket ne dit plus où
    // la photo a été prise.
    const meta = await sharp(arrivee.octets).metadata();
    expect(porteDesCoordonnees(meta.exif)).toBe(false);
    expect(meta.exif).toBeUndefined();

    expect(arrivee.type).toBe("image/webp");
    expect(arrivee.chemin.endsWith(".webp")).toBe(true);
    expect(Math.max(meta.width!, meta.height!)).toBe(2000);

    // La ligne en base décrit ce qui est DANS le bucket, pas ce qui a été reçu.
    expect(H.lignes[0].mime).toBe("image/webp");
    expect(H.lignes[0].taille).toBe(arrivee.octets.length);
  });

  it("un HEIC est refusé, avec la manœuvre, et rien n'est déposé", async () => {
    const r = await deposerPiece({
      entite: "depense", entite_id: "d1",
      fichier: fichier(Buffer.from("HEIC que sharp ne lit pas"), "image/heic", "IMG_0001.HEIC"),
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe("Ce format de photo n'est pas accepté. Envoyez un JPEG ou un PNG.");
    expect(H.deposes).toHaveLength(0);
    expect(H.lignes).toHaveLength(0);
  });
});

describe("justificatif : un PDF", () => {
  it("passe toujours, tel quel, sans être pris pour une image", async () => {
    const pdf = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n%%EOF");
    const r = await deposerPiece({
      entite: "depense", entite_id: "d1", fichier: fichier(pdf, "application/pdf", "facture.pdf"),
    });

    expect(r.ok).toBe(true);
    expect(H.deposes).toHaveLength(1);
    expect(H.deposes[0].type).toBe("application/pdf");
    expect(H.deposes[0].chemin.endsWith(".pdf")).toBe(true);
    // Déposé tel quel : octet pour octet, rien n'a été retiré ni recodé.
    expect(H.deposes[0].octets.equals(pdf)).toBe(true);
    expect(H.lignes[0].mime).toBe("application/pdf");
  });

  it("un tableur n'est ni une image ni un PDF : refusé avant tout dépôt", async () => {
    const r = await deposerPiece({
      entite: "depense", entite_id: "d1",
      fichier: fichier(Buffer.from("col1;col2"), "text/csv", "tableau.csv"),
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("Format accepté");
    expect(H.deposes).toHaveLength(0);
  });
});

describe("la porte des documents ne sert pas à faire entrer une image", () => {
  it("une image présentée à deposerDocument est refusée", async () => {
    const { deposerDocument } = await import("@/src/lib/depotImage");
    const r = await deposerDocument({
      bucket: "justificatifs", chemin: "x/y.jpg",
      octets: await ticketPhotographie(100, 100), type: "image/jpeg",
    });
    expect(r.ok).toBe(false);
    expect(H.deposes).toHaveLength(0);
  });
});
