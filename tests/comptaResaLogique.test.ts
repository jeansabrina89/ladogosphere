import { describe, it, expect } from "vitest";
import { calculerLignesEcriture } from "@/src/lib/comptaResaLogique";

type L = { compte: string; debit: number; credit: number };
const parCompte = (lignes: L[]) => Object.fromEntries(lignes.map((l) => [l.compte, l]));
const equilibree = (lignes: L[]) => {
  const d = lignes.reduce((s, l) => s + l.debit, 0);
  const c = lignes.reduce((s, l) => s + l.credit, 0);
  return Math.abs(d - c) < 0.01;
};

describe("calculerLignesEcriture — ventilation adhésion 3000/3005", () => {
  it("réservation terminée AVEC adhésion → 3000 = séjour, 3005 = adhésion, équilibrée", () => {
    const lignes = calculerLignesEcriture(
      { statut: "terminee", type_reservation: "sejour", montant_final: 100 },
      [{ mode: "cash", montant: 100 }],
      [],
      30,
    );
    const m = parCompte(lignes);
    expect(m["1000"].debit).toBe(100);
    expect(m["3000"].credit).toBe(70);
    expect(m["3005"].credit).toBe(30);
    expect(m["1100"]).toBeUndefined();
    expect(equilibree(lignes)).toBe(true);
  });

  it("réservation terminée SANS adhésion → tout en 3000 (comportement inchangé)", () => {
    const lignes = calculerLignesEcriture(
      { statut: "terminee", type_reservation: "sejour", montant_final: 100 },
      [{ mode: "cash", montant: 100 }],
      [],
    );
    const m = parCompte(lignes);
    expect(m["3000"].credit).toBe(100);
    expect(m["3005"]).toBeUndefined();
    expect(equilibree(lignes)).toBe(true);
  });

  it("montantAdhesion borné à P (jamais plus que le produit reconnu)", () => {
    const lignes = calculerLignesEcriture(
      { statut: "terminee", type_reservation: "sejour", montant_final: 100 },
      [{ mode: "virement", montant: 100 }],
      [],
      150, // > P
    );
    const m = parCompte(lignes);
    expect(m["3005"].credit).toBe(100);
    expect(m["3000"]).toBeUndefined(); // P - adhésion = 0 → aucune ligne 3000
    expect(equilibree(lignes)).toBe(true);
  });

  it("paiement partiel AVEC adhésion → 3000/3005 + débiteur 1100, équilibrée", () => {
    const lignes = calculerLignesEcriture(
      { statut: "terminee", type_reservation: "sejour", montant_final: 100 },
      [{ mode: "cash", montant: 40 }],
      [],
      30,
    );
    const m = parCompte(lignes);
    expect(m["1000"].debit).toBe(40);
    expect(m["1100"].debit).toBe(60);
    expect(m["3000"].credit).toBe(70);
    expect(m["3005"].credit).toBe(30);
    expect(equilibree(lignes)).toBe(true);
  });

  it("non terminée → acompte en 2030, aucune adhésion reconnue", () => {
    const lignes = calculerLignesEcriture(
      { statut: "validee", type_reservation: "sejour", montant_final: 100 },
      [{ mode: "virement", montant: 20 }],
      [],
      30,
    );
    const m = parCompte(lignes);
    expect(m["2030"].credit).toBe(20);
    expect(m["3005"]).toBeUndefined();
    expect(m["3000"]).toBeUndefined();
    expect(equilibree(lignes)).toBe(true);
  });
});
