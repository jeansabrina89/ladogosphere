import { describe, it, expect, vi, beforeEach } from "vitest";
import sharp from "sharp";

/**
 * L'original conservé à côté du nettoyé.
 *
 * Deux fichiers, deux rôles qui ne se mélangent jamais : le nettoyé s'affiche,
 * l'original se conserve. L'original porte l'EXIF et la position — c'est
 * précisément ce qu'on veut garder pour un contrôle, et précisément ce qu'on ne
 * veut jamais publier.
 */

const H = vi.hoisted(() => ({
  deposes: [] as { chemin: string; octets: Buffer; type?: string }[],
  retires: [] as string[][],
  signes: [] as string[],
  lignes: [] as Record<string, unknown>[],
  echecOrigine: false,
  echecRetrait: false,
  /** La ligne que la base renverra à qui la demande. */
  ligneEnBase: null as Record<string, unknown> | null,
  traces: [] as { message: string; contexte: unknown }[],
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: () => {},
  captureMessage: (message: string, contexte: unknown) => H.traces.push({ message, contexte }),
}));

vi.mock("@/src/lib/supabase-admin", () => {
  const storage = {
    from: () => ({
      upload: async (chemin: string, octets: Buffer, opts?: { contentType?: string }) => {
        if (H.echecOrigine && chemin.includes(".origine.")) {
          return { error: { message: "bucket plein" } };
        }
        H.deposes.push({ chemin, octets, type: opts?.contentType });
        return { error: null };
      },
      remove: async (chemins: string[]) => {
        H.retires.push(chemins);
        return H.echecRetrait ? { error: { message: "retrait refusé" } } : { error: null };
      },
      createSignedUrl: async (chemin: string) => {
        H.signes.push(chemin);
        return { data: { signedUrl: `https://exemple.invalid/${chemin}` }, error: null };
      },
    }),
  };
  const table = () => {
    const chain: Record<string, unknown> = {
      insert: (ligne: Record<string, unknown>) => {
        H.lignes.push(ligne);
        return { select: () => ({ single: async () => ({ data: { id: "p1", ...ligne }, error: null }) }) };
      },
      select: () => chain,
      delete: () => chain,
      eq: () => chain,
      maybeSingle: async () => ({ data: H.ligneEnBase, error: null }),
      order: async () => ({ data: [], error: null }),
      then: undefined,
    };
    return chain;
  };
  return { supabaseAdmin: { storage, from: table } };
});

import {
  deposerPiece,
  supprimerPiece,
  urlSigneePiece,
  urlSigneeOriginePiece,
} from "@/src/lib/pieces";

const TAG_GPS = [Buffer.from([0x88, 0x25]), Buffer.from([0x25, 0x88])];
const porteDesCoordonnees = (o: Buffer | undefined) =>
  !!o && TAG_GPS.some((tag) => o.includes(tag));

async function ticketPhotographie(): Promise<Buffer> {
  return sharp({ create: { width: 3000, height: 4000, channels: 3, background: { r: 240, g: 238, b: 232 } } })
    .withExifMerge({
      IFD0: { Make: "ZZ Appareil de recette", Model: "ZZ 1" },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "46/1 14/1 0/1", GPSLongitudeRef: "E" },
    })
    .jpeg()
    .toBuffer();
}

const fichier = (octets: Buffer, type: string, nom: string) =>
  new File([new Uint8Array(octets)], nom, { type });

beforeEach(() => {
  H.deposes.length = 0;
  H.retires.length = 0;
  H.signes.length = 0;
  H.lignes.length = 0;
  H.traces.length = 0;
  H.echecOrigine = false;
  H.echecRetrait = false;
  H.ligneEnBase = null;
});

describe("une photo de justificatif laisse DEUX fichiers", () => {
  it("le nettoyé et l'original, désignés séparément en base", async () => {
    const depart = await ticketPhotographie();
    const r = await deposerPiece({
      entite: "depense", entite_id: "d1", fichier: fichier(depart, "image/jpeg", "ticket.jpg"),
    });

    expect(r.ok).toBe(true);
    expect(H.deposes).toHaveLength(2);

    const nettoye = H.deposes.find((d) => d.chemin.endsWith(".webp"))!;
    const original = H.deposes.find((d) => d.chemin.includes(".origine."))!;
    expect(nettoye).toBeDefined();
    expect(original).toBeDefined();
    // Même préfixe : l'un se déduit de l'autre, ils ne se perdent pas de vue.
    expect(original.chemin.replace(".origine.jpg", "")).toBe(nettoye.chemin.replace(".webp", ""));

    const ligne = H.lignes[0];
    expect(ligne.storage_path).toBe(nettoye.chemin);
    expect(ligne.origine_path).toBe(original.chemin);
    expect(ligne.origine_mime).toBe("image/jpeg");
    expect(ligne.mime).toBe("image/webp");
    // Deux empreintes, deux fichiers : elles diffèrent.
    expect(ligne.sha256).not.toBe(ligne.origine_sha256);
  });

  it("l'original est INTACT, octet pour octet, et porte toujours sa position", async () => {
    const depart = await ticketPhotographie();
    expect(porteDesCoordonnees((await sharp(depart).metadata()).exif)).toBe(true);

    await deposerPiece({
      entite: "depense", entite_id: "d1", fichier: fichier(depart, "image/jpeg", "ticket.jpg"),
    });

    const original = H.deposes.find((d) => d.chemin.includes(".origine."))!;
    expect(original.octets.equals(depart)).toBe(true);
    expect(original.type).toBe("image/jpeg");
    // C'est bien là tout l'intérêt : il a gardé ce que le nettoyé a perdu.
    expect(porteDesCoordonnees((await sharp(original.octets).metadata()).exif)).toBe(true);
  });

  it("le nettoyé, lui, n'a rien gardé", async () => {
    await deposerPiece({
      entite: "depense", entite_id: "d1",
      fichier: fichier(await ticketPhotographie(), "image/jpeg", "ticket.jpg"),
    });
    const nettoye = H.deposes.find((d) => d.chemin.endsWith(".webp"))!;
    const meta = await sharp(nettoye.octets).metadata();
    expect(porteDesCoordonnees(meta.exif)).toBe(false);
    expect(meta.exif).toBeUndefined();
  });

  it("un PDF n'est pas dédoublé : il EST l'original", async () => {
    const pdf = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF");
    await deposerPiece({
      entite: "depense", entite_id: "d1", fichier: fichier(pdf, "application/pdf", "facture.pdf"),
    });
    expect(H.deposes).toHaveLength(1);
    expect(H.lignes[0].origine_path).toBeNull();
    expect(H.lignes[0].origine_sha256).toBeNull();
  });
});

describe("ce qui s'affiche est le nettoyé, jamais l'original", () => {
  it("l'URL servie aux écrans pointe sur le fichier nettoyé", async () => {
    H.ligneEnBase = { storage_path: "depense/d1/123.webp", origine_path: "depense/d1/123.origine.jpg" };
    const url = await urlSigneePiece("p1");
    expect(H.signes).toEqual(["depense/d1/123.webp"]);
    expect(url).not.toContain(".origine.");
  });

  it("l'original ne se sert que par sa propre porte", async () => {
    H.ligneEnBase = { storage_path: "depense/d1/123.webp", origine_path: "depense/d1/123.origine.jpg" };
    const url = await urlSigneeOriginePiece("p1");
    expect(H.signes).toEqual(["depense/d1/123.origine.jpg"]);
    expect(url).toContain(".origine.");
  });
});

describe("une pièce ancienne, sans original conservé", () => {
  it("s'affiche normalement", async () => {
    H.ligneEnBase = { storage_path: "depense/d0/vieux.png", origine_path: null };
    expect(await urlSigneePiece("p0")).toContain("vieux.png");
  });

  it("n'invente pas d'original : la porte répond « rien à servir »", async () => {
    H.ligneEnBase = { storage_path: "depense/d0/vieux.png", origine_path: null };
    expect(await urlSigneeOriginePiece("p0")).toBeNull();
    // Et surtout, elle n'a pas servi le nettoyé à la place.
    expect(H.signes).toEqual([]);
  });

  it("se supprime sans se plaindre d'un original absent", async () => {
    H.ligneEnBase = { storage_path: "depense/d0/vieux.png", origine_path: null };
    const r = await supprimerPiece("p0");
    expect(r.error).toBeUndefined();
    expect(H.retires).toEqual([["depense/d0/vieux.png"]]);
  });
});

describe("la suppression emporte les deux fichiers", () => {
  it("le nettoyé ET l'original s'en vont ensemble", async () => {
    H.ligneEnBase = { storage_path: "depense/d1/123.webp", origine_path: "depense/d1/123.origine.jpg" };
    const r = await supprimerPiece("p1");
    expect(r.error).toBeUndefined();
    expect(H.retires).toEqual([["depense/d1/123.webp", "depense/d1/123.origine.jpg"]]);
  });

  it("un retrait qui échoue se trace : des fichiers que plus rien ne désigne", async () => {
    H.ligneEnBase = { storage_path: "depense/d1/123.webp", origine_path: "depense/d1/123.origine.jpg" };
    H.echecRetrait = true;
    await supprimerPiece("p1");
    expect(H.traces).toHaveLength(1);
    expect(H.traces[0].message).toContain("restés au stockage");
  });
});

describe("si l'original ne peut pas être déposé", () => {
  it("la pièce entière est refusée : pas de dépôt à moitié fait", async () => {
    H.echecOrigine = true;
    const r = await deposerPiece({
      entite: "depense", entite_id: "d1",
      fichier: fichier(await ticketPhotographie(), "image/jpeg", "ticket.jpg"),
    });
    expect(r.ok).toBe(false);
    // Le nettoyé déjà déposé a été retiré, et aucune ligne n'a été écrite.
    expect(H.retires.flat()).toContain(H.deposes[0].chemin);
    expect(H.lignes).toHaveLength(0);
  });

  it("si même le retrait échoue, l'orphelin est tracé au lieu d'être avalé", async () => {
    H.echecOrigine = true;
    H.echecRetrait = true;
    await deposerPiece({
      entite: "depense", entite_id: "d1",
      fichier: fichier(await ticketPhotographie(), "image/jpeg", "ticket.jpg"),
    });
    expect(H.traces).toHaveLength(1);
    expect(H.traces[0].message).toContain("orphelin");
    expect(H.traces[0].contexte).toMatchObject({ level: "error" });
  });
});
