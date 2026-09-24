import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * La pagination de l'inventaire (19a), éprouvée comme celle du relevé des
 * documents perdus (20-quater).
 *
 * `listerDossier` porte la même boucle, et je la croyais correcte pour cette
 * seule raison — ce qui est exactement ce que je disais de `documentsPerdus`
 * avant qu'on ne pose la question. Elle est donc éprouvée ici, sur un dossier
 * plus grand qu'une page.
 *
 * Sans la boucle, l'inventaire mentirait DEUX FOIS : il annoncerait un export
 * amputé de tout ce qui dépasse la page, et déclarerait ces mêmes fichiers
 * « référencés en base, absents du stockage ».
 */

const H = vi.hoisted(() => ({
  factures: [] as { id: string; numero: string; pdf_path: string; date_facture: string; exercice: number }[],
  objets: new Map<string, number>(),
  appelsListe: [] as { dossier: string; offset: number; limit: number }[],
}));

vi.mock("@sentry/nextjs", () => ({ captureException: () => {}, captureMessage: () => {} }));
vi.mock("@/src/lib/journalEvenements", () => ({ tracerEvenement: async () => {} }));
vi.mock("@/src/lib/factureDocument", () => ({
  BUCKET_FACTURES: "factures",
  finaliserEmission: async () => ({}),
}));
vi.mock("@/src/lib/pieces", () => ({ BUCKET_JUSTIFICATIFS: "justificatifs" }));

vi.mock("@/src/lib/supabase-admin", () => {
  const from = (table: string) => {
    const filtres: Record<string, boolean> = {};
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      order: () => chain,
      is: (col: string) => { if (col === "pdf_path") filtres.pdfNul = true; return chain; },
      not: (col: string) => { if (col === "pdf_path") filtres.pdfEcrit = true; return chain; },
      maybeSingle: async () => ({ data: null, error: null }),
      then: (resoudre: (v: unknown) => void) => {
        if (table === "pieces") return resoudre({ data: [], error: null });
        // « is null » cherche les manquants : il n'y en a aucun ici.
        if (filtres.pdfNul) return resoudre({ data: [], error: null });
        return resoudre({ data: H.factures, error: null });
      },
    };
    return chain;
  };
  const storage = {
    from: () => ({
      list: async (dossier: string, o: { limit: number; offset?: number }) => {
        const offset = o.offset ?? 0;
        H.appelsListe.push({ dossier, offset, limit: o.limit });
        const tous = [...H.objets.entries()]
          .filter(([c]) => c.startsWith(`${dossier}/`))
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([c, taille]) => ({ name: c.split("/")[1], metadata: { size: taille } }));
        return { data: tous.slice(offset, offset + o.limit), error: null };
      },
    }),
  };
  return { supabaseAdmin: { from, storage } };
});

import { inventaireExercice } from "@/src/lib/exportComptable";

/** Un exercice de `n` factures, toutes présentes dans le bucket. */
function exercice(n: number) {
  H.factures = [];
  H.objets.clear();
  for (let i = 1; i <= n; i++) {
    const numero = `FAC-2026-${String(i).padStart(5, "0")}`;
    const chemin = `2026/${numero}.pdf`;
    H.factures.push({ id: `f${i}`, numero, pdf_path: chemin, date_facture: "2026-03-01", exercice: 2026 });
    H.objets.set(chemin, 100_000);
  }
}

beforeEach(() => { H.appelsListe.length = 0; });

describe("l'inventaire d'un dossier plus grand qu'une page", () => {
  it("mille cinq cents factures : toutes comptées, toutes pesées", async () => {
    exercice(1500);
    const inv = await inventaireExercice(2026);

    expect(
      inv.total.nbFactures,
      "l'inventaire n'a vu qu'une page : l'export serait annoncé amputé",
    ).toBe(1500);
    expect(inv.total.octets).toBe(1500 * 100_000);
  });

  it("et aucune n'est déclarée absente du stockage", async () => {
    exercice(1500);
    const inv = await inventaireExercice(2026);

    expect(
      inv.anomalies.manquants,
      "des factures bien présentes sont signalées manquantes : la page n'a pas été redemandée",
    ).toEqual([]);
    expect(inv.anomalies.orphelins).toEqual([]);
  });

  it("le coût est rendu : deux appels pour mille cinq cents objets", async () => {
    exercice(1500);
    const inv = await inventaireExercice(2026);

    expect(inv.appelsStockage).toBe(2);
    // Les décalages demandés, dans l'ordre : c'est la boucle qui les produit.
    const surLesFactures = H.appelsListe.filter((a) => a.dossier === "2026");
    expect(surLesFactures.map((a) => a.offset).slice(0, 2)).toEqual([0, 1000]);
    expect(surLesFactures[0].limit).toBe(1000);
  });

  it("cent cinquante factures tiennent en un seul appel", async () => {
    exercice(150);
    const inv = await inventaireExercice(2026);
    expect(inv.total.nbFactures).toBe(150);
    expect(inv.appelsStockage).toBe(1);
  });
});
