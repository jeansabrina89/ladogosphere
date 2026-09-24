import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * La pagination du relevé des documents perdus.
 *
 * `documentsPerdus` compare les chemins écrits en base aux objets listés dans
 * le bucket. Le listage est PAGINÉ : ce qui dépasse la page n'est pas rendu.
 * Sans redemander, toute facture au-delà de la page serait déclarée perdue —
 * une alerte fausse sur des pièces bien présentes, ce qui est pire que pas
 * d'alerte : on cesse de la lire.
 */

const H = vi.hoisted(() => ({
  /** Les factures en base : numero → chemin. */
  chemins: [] as { numero: string; pdf_path: string }[],
  /** Ce que le bucket contient vraiment. */
  objets: new Set<string>(),
  /** Les appels de listage : dossier et décalage demandés. */
  appels: [] as { dossier: string; offset: number; limit: number }[],
}));

vi.mock("@sentry/nextjs", () => ({ captureException: () => {}, captureMessage: () => {} }));
vi.mock("@/src/lib/journalEvenements", () => ({ tracerEvenement: async () => {} }));
vi.mock("@/src/lib/factureDocument", () => ({
  BUCKET_FACTURES: "factures",
  finaliserEmission: async () => ({}),
}));

vi.mock("@/src/lib/supabase-admin", () => {
  const from = () => {
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      is: () => chain,
      not: () => chain,
      order: () => chain,
      update: () => ({ eq: async () => ({ error: null }) }),
      maybeSingle: async () => ({ data: null, error: null }),
      then: (resoudre: (v: unknown) => void) => resoudre({ data: H.chemins, error: null }),
    };
    return chain;
  };
  const storage = {
    from: () => ({
      /** Un vrai listage : il rend une PAGE, jamais tout. */
      list: async (dossier: string, o: { limit: number; offset?: number }) => {
        const offset = o.offset ?? 0;
        H.appels.push({ dossier, offset, limit: o.limit });
        const tous = [...H.objets]
          .filter((c) => c.startsWith(`${dossier}/`))
          .sort()
          .map((c) => ({ name: c.split("/")[1] }));
        return { data: tous.slice(offset, offset + o.limit), error: null };
      },
    }),
  };
  return { supabaseAdmin: { from, storage } };
});

import { documentsPerdus } from "@/src/lib/reconciliationFactures";

/** Un exercice de `n` factures, toutes bien présentes dans le bucket. */
function exercice(n: number, absentes: number[] = []) {
  H.chemins = [];
  H.objets.clear();
  for (let i = 1; i <= n; i++) {
    const numero = `FAC-2026-${String(i).padStart(4, "0")}`;
    const chemin = `2026/${numero}.pdf`;
    H.chemins.push({ numero, pdf_path: chemin });
    if (!absentes.includes(i)) H.objets.add(chemin);
  }
}

beforeEach(() => { H.appels.length = 0; });

describe("un dossier plus grand qu'une page", () => {
  it("cent cinquante objets : aucun déclaré perdu, en UN seul appel", async () => {
    exercice(150);
    const { perdus, appels } = await documentsPerdus();

    expect(
      perdus,
      "des factures bien présentes sont déclarées perdues : la page n'a pas été redemandée",
    ).toEqual([]);
    // Cent cinquante tiennent dans une page de mille : un appel suffit.
    expect(appels).toBe(1);
    expect(H.appels[0].limit).toBe(1000);
  });

  it("mille cinq cents objets : aucun déclaré perdu, et la page est redemandée", async () => {
    exercice(1500);
    const { perdus, appels } = await documentsPerdus();

    expect(
      perdus.length,
      "les objets au-delà de la première page sont déclarés perdus alors qu'ils existent",
    ).toBe(0);
    expect(appels).toBe(2);
    expect(H.appels.map((a) => a.offset)).toEqual([0, 1000]);
  });

  it("deux mille objets : trois appels, le dernier vide", async () => {
    exercice(2000);
    const { perdus, appels } = await documentsPerdus();
    expect(perdus).toEqual([]);
    // La page est pleine deux fois : il faut un troisième appel pour le savoir.
    expect(appels).toBe(3);
  });

  it("une absence réelle au-delà de la première page est bien vue", async () => {
    // Le point qui compte : la pagination ne doit pas rendre le relevé aveugle.
    exercice(1500, [1234]);
    const { perdus } = await documentsPerdus();
    expect(perdus.map((p) => p.numero)).toEqual(["FAC-2026-1234"]);
  });

  it("aucune facture avec chemin : aucun appel au stockage", async () => {
    exercice(0);
    const { perdus, appels } = await documentsPerdus();
    expect(perdus).toEqual([]);
    expect(appels).toBe(0);
  });
});
