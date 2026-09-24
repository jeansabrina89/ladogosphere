import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Le PDF d'une facture se fabrique à la demande pour celui à qui elle
 * appartient — pas pour celui qui porte le bon rôle.
 *
 * Avant, seul le personnel déclenchait la fabrication : un client qui ouvrait
 * SA facture tombait sur « PDF indisponible » pour un document qui est le sien.
 */

const H = vi.hoisted(() => ({
  appelant: null as null | { userId: string; role: string; actif: boolean },
  factures: new Map<string, Record<string, unknown>>(),
  generations: [] as string[],
}));

vi.mock("@sentry/nextjs", () => ({ captureException: () => {}, captureMessage: () => {} }));
vi.mock("@/src/lib/garde", () => ({ lireAppelant: async () => H.appelant }));

vi.mock("@/src/lib/factureDocument", () => ({
  genererPdfFacture: async (id: string) => {
    H.generations.push(id);
    const f = H.factures.get(id);
    if (f) f.pdf_path = "2026/x.pdf";
    return null;
  },
  urlSigneePdf: async (id: string) =>
    H.factures.get(id)?.pdf_path ? `https://exemple.invalid/${id}.pdf` : null,
}));

vi.mock("@/src/lib/supabase-admin", () => {
  const from = () => {
    const filtres: Record<string, unknown> = {};
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (c: string, v: unknown) => { filtres[c] = v; return chain; },
      maybeSingle: async () => ({ data: H.factures.get(filtres.id as string) ?? null, error: null }),
    };
    return chain;
  };
  return { supabaseAdmin: { from } };
});

import { GET } from "@/app/api/factures/[id]/pdf/route";

const appel = (id: string) =>
  GET({} as never, { params: Promise.resolve({ id }) });

beforeEach(() => {
  H.factures.clear();
  H.generations.length = 0;
  H.factures.set("f1", {
    id: "f1", numero: "FAC-2026-0001", client_id: "c1", pdf_path: null,
    clients: { auth_user_id: "u-client" },
  });
});

describe("le PDF d'une facture, à la demande", () => {
  it("le client propriétaire l'obtient, et le document est fabriqué pour lui", async () => {
    H.appelant = { userId: "u-client", role: "client", actif: true };

    const r = await appel("f1");

    expect(
      H.generations,
      "la fabrication est restée réservée au personnel : le client reste devant une page vide",
    ).toEqual(["f1"]);
    expect(r.status).toBe(307); // redirection vers l'URL signée
  });

  it("un autre client ne l'obtient pas, et rien n'est fabriqué", async () => {
    H.appelant = { userId: "u-intrus", role: "client", actif: true };

    const r = await appel("f1");

    expect(r.status).toBe(403);
    expect(H.generations).toEqual([]);
  });

  it("le personnel l'obtient toujours", async () => {
    H.appelant = { userId: "u-staff", role: "employe", actif: true };
    const r = await appel("f1");
    expect(r.status).toBe(307);
    expect(H.generations).toEqual(["f1"]);
  });

  it("une facture déjà pourvue n'est pas refabriquée à chaque ouverture", async () => {
    H.factures.get("f1")!.pdf_path = "2026/FAC-2026-0001.pdf";
    H.appelant = { userId: "u-client", role: "client", actif: true };

    await appel("f1");
    await appel("f1");
    await appel("f1");

    // Sinon un client qui rafraîchit fabriquerait un PDF à chaque appel.
    expect(H.generations).toEqual([]);
  });

  it("un compte désactivé n'ouvre rien", async () => {
    H.appelant = { userId: "u-client", role: "client", actif: false };
    const r = await appel("f1");
    expect(r.status).toBe(403);
    expect(H.generations).toEqual([]);
  });
});
