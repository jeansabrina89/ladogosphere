import { describe, it, expect } from "vitest";
import { calculerLignesEcriture } from "../src/lib/comptaResaLogique";

const resa = (statut: string, montant_final: number | null, montant_calcule: number | null = null) => ({
  statut,
  type_reservation: "sejour",
  montant_final,
  montant_calcule,
});

const somme = (lignes: { debit: number; credit: number }[], cote: "debit" | "credit") =>
  lignes.reduce((s, l) => s + l[cote], 0);

describe("calculerLignesEcriture — invariants", () => {
  it("terminee + cash intégral : crédit 3000, débit 1000, équilibre", () => {
    const lignes = calculerLignesEcriture(
      resa("terminee", 100),
      [{ mode: "cash", montant: 100 }],
      [],
    );
    expect(lignes.find((l) => l.compte === "3000")).toMatchObject({ debit: 0, credit: 100 });
    expect(lignes.find((l) => l.compte === "1000")).toMatchObject({ debit: 100, credit: 0 });
    expect(somme(lignes, "debit")).toBe(somme(lignes, "credit"));
  });

  it("terminee + paiement partiel : 1000 + 1100 au débit, 3000 au crédit, équilibre", () => {
    const lignes = calculerLignesEcriture(
      resa("terminee", 100),
      [{ mode: "cash", montant: 50 }],
      [],
    );
    expect(lignes.find((l) => l.compte === "3000")).toMatchObject({ debit: 0, credit: 100 });
    expect(lignes.find((l) => l.compte === "1000")).toMatchObject({ debit: 50, credit: 0 });
    expect(lignes.find((l) => l.compte === "1100")).toMatchObject({ debit: 50, credit: 0 });
    expect(somme(lignes, "debit")).toBe(100);
    expect(somme(lignes, "credit")).toBe(100);
  });

  it("non-terminee : encaissement en compte 2030, pas de 3000", () => {
    const lignes = calculerLignesEcriture(
      resa("validee", 100),
      [{ mode: "cash", montant: 50 }],
      [],
    );
    expect(lignes.find((l) => l.compte === "2030")).toMatchObject({ debit: 0, credit: 50 });
    expect(lignes.find((l) => l.compte === "3000")).toBeUndefined();
    expect(somme(lignes, "debit")).toBe(somme(lignes, "credit"));
  });

  it("idempotence : appel avec les lignes déjà postées renvoie []", () => {
    const mvts = [{ mode: "cash", montant: 100 }];
    const premierAppel = calculerLignesEcriture(resa("terminee", 100), mvts, []);
    const dejaLignes = premierAppel.map((l) => ({
      compte_numero: l.compte,
      debit: l.debit,
      credit: l.credit,
    }));
    const secondAppel = calculerLignesEcriture(resa("terminee", 100), mvts, dejaLignes);
    expect(secondAppel).toHaveLength(0);
  });

  it("mapping modes : virement→1020, twint→1021, stripe→1021, avoir→2035", () => {
    const tester = (mode: string, compte: string) => {
      const lignes = calculerLignesEcriture(resa("validee", 100), [{ mode, montant: 10 }], []);
      expect(lignes.find((l) => l.compte === compte)).toBeDefined();
    };
    tester("virement", "1020");
    tester("twint", "1021");
    tester("stripe", "1021");
    tester("avoir", "2035");
  });

  it("montant_final prioritaire sur montant_calcule", () => {
    const lignes = calculerLignesEcriture(
      { statut: "terminee", type_reservation: "sejour", montant_final: 80, montant_calcule: 100 },
      [],
      [],
    );
    expect(lignes.find((l) => l.compte === "3000")).toMatchObject({ credit: 80 });
    expect(lignes.find((l) => l.compte === "3000")?.debit ?? -1).not.toBe(100);
  });

  it("montant_final null : repli sur montant_calcule", () => {
    const lignes = calculerLignesEcriture(
      { statut: "terminee", type_reservation: "sejour", montant_final: null, montant_calcule: 100 },
      [],
      [],
    );
    expect(lignes.find((l) => l.compte === "3000")).toMatchObject({ credit: 100 });
  });

  it("équilibre débit = crédit pour toute situation", () => {
    const scenarios = [
      { r: resa("terminee", 120), mvts: [{ mode: "cash", montant: 60 }, { mode: "virement", montant: 30 }] },
      { r: resa("validee", 200), mvts: [{ mode: "twint", montant: 200 }] },
      { r: resa("terminee", 75), mvts: [] },
    ];
    for (const { r, mvts } of scenarios) {
      const lignes = calculerLignesEcriture(r, mvts, []);
      expect(somme(lignes, "debit")).toBeCloseTo(somme(lignes, "credit"), 5);
    }
  });
});
