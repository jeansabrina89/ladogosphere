import { vi, describe, it, expect } from "vitest";

// Mock supabase-admin avant tout import qui en depend
vi.mock("@/src/lib/supabase-admin", () => ({ supabaseAdmin: {} }));

import { calculerLignesAbonnement, type AbonnementForCompta } from "../src/lib/comptaAbonnementLogique";
import { calculerSolde } from "../src/lib/abonnementSolde";

const somme = (lignes: { debit: number; credit: number }[], cote: "debit" | "credit") =>
  lignes.reduce((s, l) => s + l[cote], 0);

const abo = (overrides: Partial<AbonnementForCompta> = {}): AbonnementForCompta => ({
  paye: true,
  mode_paiement: "cash",
  prix_paye: 200,
  jours_total: 11,
  jours_termines: 0,
  expire: false,
  ...overrides,
});

describe("calculerLignesAbonnement", () => {
  it("non paye -> aucune ligne", () => {
    expect(calculerLignesAbonnement(abo({ paye: false }), [])).toHaveLength(0);
  });

  it("paye, 0 jour termine : Dr 1000=200, Cr 2031=200, pas de 3000", () => {
    const lignes = calculerLignesAbonnement(abo({ jours_termines: 0 }), []);
    expect(lignes.find((l) => l.compte === "1000")).toMatchObject({ debit: 200, credit: 0 });
    expect(lignes.find((l) => l.compte === "2031")).toMatchObject({ debit: 0, credit: 200 });
    expect(lignes.find((l) => l.compte === "3000")).toBeUndefined();
    expect(somme(lignes, "debit")).toBe(somme(lignes, "credit"));
  });

  it("mapping modes : twint -> 1021, virement -> 1020", () => {
    const lignesTwint = calculerLignesAbonnement(abo({ mode_paiement: "twint" }), []);
    expect(lignesTwint.find((l) => l.compte === "1021")).toBeDefined();
    expect(lignesTwint.find((l) => l.compte === "1000")).toBeUndefined();

    const lignesVirement = calculerLignesAbonnement(abo({ mode_paiement: "virement" }), []);
    expect(lignesVirement.find((l) => l.compte === "1020")).toBeDefined();
    expect(lignesVirement.find((l) => l.compte === "1000")).toBeUndefined();
  });

  it("11 jours termines : reconnaissance complete — Cr 3000=200, 2031 a 0", () => {
    const lignes = calculerLignesAbonnement(abo({ jours_termines: 11 }), []);
    expect(lignes.find((l) => l.compte === "3000")).toMatchObject({ debit: 0, credit: 200 });
    expect(lignes.find((l) => l.compte === "2031")).toBeUndefined();
    expect(somme(lignes, "debit")).toBe(somme(lignes, "credit"));
  });

  it("5/11 jours : rec=90.91 (Cr 3000), 2031=109.09, equilibre", () => {
    const lignes = calculerLignesAbonnement(abo({ jours_termines: 5 }), []);
    expect(lignes.find((l) => l.compte === "3000")).toMatchObject({ debit: 0, credit: 90.91 });
    expect(lignes.find((l) => l.compte === "2031")).toMatchObject({ debit: 0, credit: 109.09 });
    expect(somme(lignes, "debit")).toBeCloseTo(somme(lignes, "credit"), 5);
  });

  it("idempotence : dejaLignes = cible -> []", () => {
    const etat = calculerLignesAbonnement(abo({ jours_termines: 5 }), []);
    const dejaLignes = etat.map((l) => ({ compte_numero: l.compte, debit: l.debit, credit: l.credit }));
    expect(calculerLignesAbonnement(abo({ jours_termines: 5 }), dejaLignes)).toHaveLength(0);
  });

  it("recredit : 4 jours apres etat a 5 -> contre-passe partielle, equilibre", () => {
    const etat5 = calculerLignesAbonnement(abo({ jours_termines: 5 }), []);
    const dejaLignes = etat5.map((l) => ({ compte_numero: l.compte, debit: l.debit, credit: l.credit }));
    const delta = calculerLignesAbonnement(abo({ jours_termines: 4 }), dejaLignes);
    // 3000 debite (inversion partielle du produit)
    expect(delta.find((l) => l.compte === "3000")?.debit).toBeGreaterThan(0);
    // 2031 credite (retour en passif)
    expect(delta.find((l) => l.compte === "2031")?.credit).toBeGreaterThan(0);
    expect(somme(delta, "debit")).toBeCloseTo(somme(delta, "credit"), 5);
  });

  it("breakage (expire=true) : Cr 3000=prix, 2031=0", () => {
    const lignes = calculerLignesAbonnement(abo({ jours_termines: 3, expire: true }), []);
    expect(lignes.find((l) => l.compte === "3000")).toMatchObject({ debit: 0, credit: 200 });
    expect(lignes.find((l) => l.compte === "2031")).toBeUndefined();
    expect(somme(lignes, "debit")).toBe(somme(lignes, "credit"));
  });

  it("invariant debit==credit pour toute situation non vide", () => {
    const scenarios: AbonnementForCompta[] = [
      abo({ jours_termines: 0 }),
      abo({ jours_termines: 3 }),
      abo({ jours_termines: 11 }),
      abo({ jours_termines: 7, mode_paiement: "twint" }),
      abo({ jours_termines: 2, expire: true }),
      abo({ jours_termines: 0, prix_paye: 99, jours_total: 10 }),
    ];
    for (const a of scenarios) {
      const lignes = calculerLignesAbonnement(a, []);
      if (lignes.length > 0) {
        expect(somme(lignes, "debit")).toBeCloseTo(somme(lignes, "credit"), 5);
      }
    }
  });
});

describe("calculerSolde", () => {
  it("+11,-1,-1,+1 -> 10", () => {
    expect(
      calculerSolde([{ delta: 11 }, { delta: -1 }, { delta: -1 }, { delta: 1 }]),
    ).toBe(10);
  });

  it("vide -> 0", () => {
    expect(calculerSolde([])).toBe(0);
  });

  it("arrondi a 2 decimales", () => {
    expect(calculerSolde([{ delta: "0.1" }, { delta: "0.2" }])).toBeCloseTo(0.3, 5);
  });
});
