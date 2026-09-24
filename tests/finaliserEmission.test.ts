import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * L'émission ne peut plus avaler l'échec du document, et l'envoi ne peut plus
 * partir sans la pièce jointe.
 *
 * Ce ne sont pas deux façons de dire la même chose : le PDF est JOINT à
 * l'e-mail (`piecesJointes`), et `telechargerPdf` rendait `null` sans bruit
 * quand il manquait. Le client recevait alors une annonce de facture sans
 * facture — et l'envoi était marqué fait, donc jamais repris.
 */

const H = vi.hoisted(() => ({
  factures: new Map<string, Record<string, unknown>>(),
  /** Le bucket : chemin → contenu. */
  objets: new Map<string, string>(),
  emails: [] as { pdf: unknown; numero: string }[],
  marquees: [] as string[],
}));

vi.mock("@sentry/nextjs", () => ({ captureException: () => {}, captureMessage: () => {} }));
vi.mock("@/src/lib/journalEvenements", () => ({ tracerEvenement: async () => {} }));

vi.mock("@/src/lib/email", () => ({
  envoyerEmailFactureEmise: async (p: { pdf: unknown; numero: string }) => {
    H.emails.push({ pdf: p.pdf, numero: p.numero });
  },
}));

vi.mock("@/src/lib/supabase-admin", () => {
  const from = () => {
    const filtres: Record<string, unknown> = {};
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (col: string, val: unknown) => { filtres[col] = val; return chain; },
      in: () => chain,
      not: () => chain,
      order: () => chain,
      update: (v: Record<string, unknown>) => ({
        eq: async (_c: string, id: string) => {
          const f = H.factures.get(id);
          if (f) Object.assign(f, v);
          return { error: null };
        },
      }),
      maybeSingle: async () => ({ data: H.factures.get(filtres.id as string) ?? null, error: null }),
    };
    return chain;
  };
  return {
    supabaseAdmin: {
      from,
      rpc: async () => ({ data: 0, error: null }),
      storage: {
        from: () => ({
          download: async (chemin: string) => {
            const contenu = H.objets.get(chemin);
            if (!contenu) return { data: null, error: { message: "not found" } };
            return { data: new Blob([contenu]), error: null };
          },
        }),
      },
    },
  };
});

import { finaliserEmission, envoyerFactureParEmail } from "@/src/lib/factureDocument";

beforeEach(() => {
  H.factures.clear();
  H.objets.clear();
  H.emails.length = 0;
  H.marquees.length = 0;
});

describe("finaliserEmission ne rend plus la main en silence", () => {
  it("la génération renonce SANS lever : l'échec est dit quand même", async () => {
    // Le cas que le `catch` ne voyait pas — et c'est la moitié des cas.
    // `genererPdfFacture` sort de lui-même quand la facture n'a pas de quoi
    // être rendue : aucune exception, aucun document, et l'ancienne version
    // déclarait l'émission réussie. Seul le FAIT compte : `pdf_path` est-il
    // écrit ?
    H.factures.set("f1", { id: "f1", numero: null, pdf_path: null });

    const res = await finaliserEmission("f1", null);

    expect(
      res.error,
      "l'échec est avalé : l'émission se déclare réussie sans document conservé",
    ).toBeTruthy();
    expect(res.error).toContain("émise et porte son numéro");
    // La facture n'est pas défaite : on ne reprend pas un numéro attribué.
    expect(H.factures.has("f1")).toBe(true);
  });

  it("la génération lève : l'échec est dit aussi", async () => {
    // L'autre moitié : une exception pendant le rendu ou le dépôt.
    H.factures.set("f2b", { id: "f2b", numero: "FAC-2026-0009", pdf_path: null });
    const res = await finaliserEmission("f2b", null);
    expect(res.error).toBeTruthy();
  });

  it("document présent : rien à signaler", async () => {
    H.factures.set("f2", { id: "f2", numero: "FAC-2026-0002", pdf_path: "2026/FAC-2026-0002.pdf" });
    const res = await finaliserEmission("f2", null);
    expect(res.error).toBeUndefined();
  });
});

describe("l'e-mail ne part pas sans la facture", () => {
  it("document introuvable : rien n'est envoyé, et on dit pourquoi", async () => {
    H.factures.set("f3", {
      id: "f3", numero: "FAC-2026-0003", pdf_path: null,
      clients: { prenom: "ZZ", email: "zz@exemple.invalid" },
    });

    const res = await envoyerFactureParEmail("f3", null);

    expect(
      H.emails.length,
      "un e-mail est parti sans la facture jointe : le client reçoit une annonce vide",
    ).toBe(0);
    expect(res.error).toContain("introuvable");
  });

  it("document présent : il part en pièce jointe", async () => {
    H.factures.set("f4", {
      id: "f4", numero: "FAC-2026-0004", pdf_path: "2026/FAC-2026-0004.pdf",
      clients: { prenom: "ZZ", email: "zz@exemple.invalid" },
    });
    H.objets.set("2026/FAC-2026-0004.pdf", "%PDF-1.4 contenu");

    const res = await envoyerFactureParEmail("f4", null);

    expect(res.error).toBeUndefined();
    expect(H.emails).toHaveLength(1);
    expect(H.emails[0].pdf).not.toBeNull();
  });
});
