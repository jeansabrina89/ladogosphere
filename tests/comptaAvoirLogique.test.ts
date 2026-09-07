import { describe, it, expect } from "vitest";
import {
  calculerLignesAvoir,
  cibleAvoir,
  contrepartieAvoir,
  avoirEstComptabilise,
  COMPTE_AVOIRS,
  COMPTE_DIMINUTION_PRODUITS,
  COMPTE_DEBITEURS,
} from "../src/lib/comptaAvoirLogique";

const somme = (lignes: { debit: number; credit: number }[]) => ({
  debit: lignes.reduce((s, l) => s + l.debit, 0),
  credit: lignes.reduce((s, l) => s + l.credit, 0),
});

describe("quels mouvements portent une écriture", () => {
  it("ajout, retrait et trop-perçu sont comptabilisés", () => {
    expect(avoirEstComptabilise("ajout_manuel")).toBe(true);
    expect(avoirEstComptabilise("retrait_manuel")).toBe(true);
    expect(avoirEstComptabilise("trop_percu")).toBe(true);
  });
  it("utilisation et annulation de paiement suivent la réservation", () => {
    expect(avoirEstComptabilise("utilisation")).toBe(false);
    expect(avoirEstComptabilise("annulation_paiement")).toBe(false);
  });
  it("type inconnu ou absent : rien", () => {
    expect(avoirEstComptabilise("reprise")).toBe(false);
    expect(avoirEstComptabilise(null)).toBe(false);
  });
});

describe("contrepartieAvoir", () => {
  it("geste commercial → 3800", () => {
    expect(contrepartieAvoir("ajout_manuel")).toBe(COMPTE_DIMINUTION_PRODUITS);
    expect(contrepartieAvoir("retrait_manuel")).toBe(COMPTE_DIMINUTION_PRODUITS);
  });
  it("trop-perçu → 1100", () => {
    expect(contrepartieAvoir("trop_percu")).toBe(COMPTE_DEBITEURS);
  });
  it("sinon rien", () => {
    expect(contrepartieAvoir("utilisation")).toBeNull();
  });
});

describe("ajout manuel : D 3800 / C 2035", () => {
  const lignes = calculerLignesAvoir({ type: "ajout_manuel", montant: 50 }, []);

  it("deux lignes équilibrées", () => {
    expect(lignes).toHaveLength(2);
    expect(somme(lignes)).toEqual({ debit: 50, credit: 50 });
  });
  it("3800 au débit", () => {
    expect(lignes.find((l) => l.compte === COMPTE_DIMINUTION_PRODUITS)).toEqual({
      compte: "3800", debit: 50, credit: 0,
    });
  });
  it("2035 au crédit (la dette envers le client augmente)", () => {
    expect(lignes.find((l) => l.compte === COMPTE_AVOIRS)).toEqual({
      compte: "2035", debit: 0, credit: 50,
    });
  });
});

describe("retrait manuel : l'inverse", () => {
  // Un retrait est stocké en montant NÉGATIF dans avoirs_mouvements.
  const lignes = calculerLignesAvoir({ type: "retrait_manuel", montant: -30 }, []);

  it("2035 au débit, 3800 au crédit", () => {
    expect(lignes.find((l) => l.compte === COMPTE_AVOIRS)).toEqual({
      compte: "2035", debit: 30, credit: 0,
    });
    expect(lignes.find((l) => l.compte === COMPTE_DIMINUTION_PRODUITS)).toEqual({
      compte: "3800", debit: 0, credit: 30,
    });
  });
  it("équilibrée", () => {
    expect(somme(lignes)).toEqual({ debit: 30, credit: 30 });
  });
});

describe("trop-perçu : D 1100 / C 2035", () => {
  const lignes = calculerLignesAvoir({ type: "trop_percu", montant: 15 }, []);

  it("1100 au débit, 2035 au crédit", () => {
    expect(lignes.find((l) => l.compte === COMPTE_DEBITEURS)).toEqual({
      compte: "1100", debit: 15, credit: 0,
    });
    expect(lignes.find((l) => l.compte === COMPTE_AVOIRS)).toEqual({
      compte: "2035", debit: 0, credit: 15,
    });
  });
  it("jamais de débiteur négatif : le 1100 est bien AU DÉBIT", () => {
    const l1100 = lignes.find((l) => l.compte === COMPTE_DEBITEURS)!;
    expect(l1100.debit).toBeGreaterThan(0);
    expect(l1100.credit).toBe(0);
  });
});

describe("types portés par la réservation : aucune écriture", () => {
  it("utilisation", () => {
    expect(calculerLignesAvoir({ type: "utilisation", montant: -40 }, [])).toEqual([]);
  });
  it("annulation de paiement", () => {
    expect(calculerLignesAvoir({ type: "annulation_paiement", montant: 40 }, [])).toEqual([]);
  });
  it("montant nul", () => {
    expect(calculerLignesAvoir({ type: "ajout_manuel", montant: 0 }, [])).toEqual([]);
  });
});

describe("idempotence par delta", () => {
  it("rejouer sans changement ne passe rien", () => {
    const premier = calculerLignesAvoir({ type: "ajout_manuel", montant: 50 }, []);
    const deja = premier.map((l) => ({ compte_numero: l.compte, debit: l.debit, credit: l.credit }));
    expect(calculerLignesAvoir({ type: "ajout_manuel", montant: 50 }, deja)).toEqual([]);
  });

  it("un montant corrigé ne passe que le delta", () => {
    const deja = [
      { compte_numero: "3800", debit: 50, credit: 0 },
      { compte_numero: "2035", debit: 0, credit: 50 },
    ];
    const lignes = calculerLignesAvoir({ type: "ajout_manuel", montant: 80 }, deja);
    expect(somme(lignes)).toEqual({ debit: 30, credit: 30 });
    expect(lignes.find((l) => l.compte === "3800")).toEqual({ compte: "3800", debit: 30, credit: 0 });
  });

  it("un mouvement devenu non comptabilisable est contre-passé", () => {
    const deja = [
      { compte_numero: "3800", debit: 50, credit: 0 },
      { compte_numero: "2035", debit: 0, credit: 50 },
    ];
    const lignes = calculerLignesAvoir({ type: "utilisation", montant: -50 }, deja);
    expect(somme(lignes)).toEqual({ debit: 50, credit: 50 });
    expect(lignes.find((l) => l.compte === "3800")).toEqual({ compte: "3800", debit: 0, credit: 50 });
    expect(lignes.find((l) => l.compte === "2035")).toEqual({ compte: "2035", debit: 50, credit: 0 });
  });
});

describe("cibleAvoir — soldes signés", () => {
  it("ajout : 3800 débiteur, 2035 créditeur", () => {
    expect(cibleAvoir({ type: "ajout_manuel", montant: 50 })).toEqual({ "3800": 50, "2035": -50 });
  });
  it("la cible s'annule toujours (écriture équilibrée)", () => {
    for (const m of [10, -10, 0.05, 123.45]) {
      const cible = cibleAvoir({ type: "trop_percu", montant: m });
      const total = Object.values(cible).reduce((s, v) => s + v, 0);
      expect(Math.round(total * 100) / 100).toBe(0);
    }
  });
  it("arrondi au centime", () => {
    expect(cibleAvoir({ type: "ajout_manuel", montant: 10.005 })["2035"]).toBe(-10.01);
  });
});
