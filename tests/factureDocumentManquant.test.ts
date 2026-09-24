import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * La facture émise sans pièce conservée.
 *
 * Le numéro est attribué, la facture existe comptablement — et le document
 * n'existe pas. Dix ans de conservation sont dus. Trois gardes :
 *   1. l'émission ne l'avale plus ;
 *   2. l'envoi ne part pas sans la pièce jointe ;
 *   3. la réconciliation quotidienne rattrape ce qu'aucun `catch` ne voit.
 */

const H = vi.hoisted(() => ({
  /** Les factures en base : id → { pdf_path, statut, numero } */
  factures: new Map<string, Record<string, unknown>>(),
  /** La génération réussit-elle ? */
  generationReussit: true,
  /** Combien de fois la génération a été tentée. */
  generations: 0,
  journal: [] as { evenement: string; apres: unknown }[],
  traces: [] as { message: string; contexte: unknown }[],
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: () => {},
  captureMessage: (message: string, contexte: unknown) => H.traces.push({ message, contexte }),
}));

vi.mock("@/src/lib/journalEvenements", () => ({
  tracerEvenement: async (e: { evenement: string; apres: unknown }) => {
    H.journal.push({ evenement: e.evenement, apres: e.apres });
  },
}));

vi.mock("@/src/lib/supabase-admin", () => {
  const from = (table: string) => {
    const filtres: Record<string, unknown> = {};
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (col: string, val: unknown) => { filtres[col] = val; return chain; },
      is: () => chain,
      not: () => chain,
      in: () => chain,
      order: () => chain,
      update: (valeurs: Record<string, unknown>) => ({
        eq: async (_c: string, id: string) => {
          const f = H.factures.get(id);
          if (f) Object.assign(f, valeurs);
          return { error: null };
        },
      }),
      maybeSingle: async () => ({ data: H.factures.get(filtres.id as string) ?? null, error: null }),
      then: undefined,
    };
    // `facturesSansDocument` lit la table entière : la promesse se résout sur
    // la liste filtrée, comme le ferait PostgREST.
    if (table === "factures") {
      (chain as { then?: unknown }).then = (resoudre: (v: unknown) => void) =>
        resoudre({
          data: [...H.factures.values()].filter((f) => !f.pdf_path && f.numero && f.statut !== "brouillon"),
          error: null,
        });
    }
    return chain;
  };
  return { supabaseAdmin: { from, storage: { from: () => ({}) } } };
});

// Ce fichier teste la RECONCILIATION : `finaliserEmission` y est simulee.
// Son propre contrat -- ne plus avaler l echec -- est teste a part, dans
// tests/finaliserEmission.test.ts.
vi.mock("@/src/lib/factureDocument", () => ({
  BUCKET_FACTURES: "factures",
  finaliserEmission: async (id: string) => {
    H.generations += 1;
    if (!H.generationReussit) return { error: "document absent" };
    const f = H.factures.get(id);
    if (f) f.pdf_path = `2026/${String(f.numero)}.pdf`;
    return {};
  },
}));

import { reconcilierDocumentsFactures, facturesSansDocument } from "@/src/lib/reconciliationFactures";

beforeEach(() => {
  H.factures.clear();
  H.generationReussit = true;
  H.generations = 0;
  H.journal.length = 0;
  H.traces.length = 0;
});

const facture = (id: string, o: Record<string, unknown> = {}) => {
  H.factures.set(id, {
    id, numero: `FAC-2026-${id}`, statut: "envoyee", date_facture: "2026-03-01",
    pdf_path: null, ...o,
  });
};

describe("repérer les factures émises sans document", () => {
  it("une facture numérotée sans PDF est trouvée", async () => {
    facture("0001");
    const liste = await facturesSansDocument();
    expect(liste.map((f) => f.numero)).toEqual(["FAC-2026-0001"]);
  });

  it("un brouillon n'en est pas une : il n'a jamais été émis", async () => {
    facture("0002", { statut: "brouillon", numero: null });
    expect(await facturesSansDocument()).toHaveLength(0);
  });

  it("une facture annulée EN est une : elle reste une pièce comptable", async () => {
    facture("0003", { statut: "annulee_par_avoir" });
    expect(await facturesSansDocument()).toHaveLength(1);
  });

  it("une facture qui a son document n'est pas signalée", async () => {
    facture("0004", { pdf_path: "2026/FAC-2026-0004.pdf" });
    expect(await facturesSansDocument()).toHaveLength(0);
  });
});

describe("la réconciliation répare", () => {
  it("fabrique le document manquant et le dit au journal", async () => {
    facture("0001");
    const bilan = await reconcilierDocumentsFactures();

    expect(bilan).toMatchObject({ manquantes: 1, reparees: 1 });
    expect(bilan.irreparables).toHaveLength(0);
    expect(H.factures.get("0001")!.pdf_path).toBe("2026/FAC-2026-0001.pdf");
    expect(H.journal.map((j) => j.evenement)).toContain("documents_reconcilies");
    // Rien d'alarmant à signaler : la réparation a suffi.
    expect(H.traces).toHaveLength(0);
  });

  it("ce qu'elle ne répare pas, elle l'alerte UNE fois, pas une par facture", async () => {
    facture("0001"); facture("0002"); facture("0003");
    H.generationReussit = false;

    const bilan = await reconcilierDocumentsFactures();

    expect(bilan.irreparables).toHaveLength(3);
    expect(
      H.traces.length,
      "une alerte par facture noierait le signal : trois manques, trois alertes",
    ).toBe(1);
    expect(H.traces[0].message).toContain("Factures émises sans document");
    expect(H.traces[0].contexte).toMatchObject({ level: "error", extra: { nombre: 3 } });
  });

  it("une fois réparée, elle ne réalerte plus le lendemain", async () => {
    facture("0001");
    H.generationReussit = false;
    await reconcilierDocumentsFactures();
    expect(H.traces).toHaveLength(1);

    // Le lendemain, la génération remarche.
    H.traces.length = 0;
    H.generationReussit = true;
    await reconcilierDocumentsFactures();
    expect(H.traces).toHaveLength(0);

    // Le surlendemain, il n'y a plus rien à faire : ni travail, ni alerte.
    H.generations = 0;
    const bilan = await reconcilierDocumentsFactures();
    expect(bilan.manquantes).toBe(0);
    expect(H.generations).toBe(0);
    expect(H.traces).toHaveLength(0);
  });
});
