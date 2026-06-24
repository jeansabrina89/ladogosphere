import { describe, it, expect } from "vitest";
import { joursTravaillesSemaine, moyenneJoursTravaillesSemaine, joursVacancesTheoriques } from "../src/lib/planningUtils";

describe("joursTravaillesSemaine", () => {
  it("100% → 5 jours (entier, constant)", () => {
    expect(joursTravaillesSemaine(100, 0)).toBe(5);
    expect(joursTravaillesSemaine(100, 1)).toBe(5);
  });

  it("80% → 4 jours (entier, constant)", () => {
    expect(joursTravaillesSemaine(80, 0)).toBe(4);
    expect(joursTravaillesSemaine(80, 3)).toBe(4);
  });

  it("60% → 3 jours (entier, constant)", () => {
    expect(joursTravaillesSemaine(60, 0)).toBe(3);
  });

  it("40% → 2 jours (entier, constant)", () => {
    expect(joursTravaillesSemaine(40, 0)).toBe(2);
  });

  it("50% → plancher (2) semaine paire, plafond (3) semaine impaire", () => {
    expect(joursTravaillesSemaine(50, 0)).toBe(2); // index pair
    expect(joursTravaillesSemaine(50, 1)).toBe(3); // index impair
    expect(joursTravaillesSemaine(50, 2)).toBe(2); // pair
    expect(joursTravaillesSemaine(50, 3)).toBe(3); // impair
  });

  it("90% → plancher (4) semaine paire, plafond (5) semaine impaire", () => {
    expect(joursTravaillesSemaine(90, 0)).toBe(4);
    expect(joursTravaillesSemaine(90, 1)).toBe(5);
  });
});

describe("moyenneJoursTravaillesSemaine", () => {
  it("retourne taux/20", () => {
    expect(moyenneJoursTravaillesSemaine(100)).toBe(5);
    expect(moyenneJoursTravaillesSemaine(50)).toBe(2.5);
    expect(moyenneJoursTravaillesSemaine(80)).toBe(4);
  });
});

describe("joursVacancesTheoriques", () => {
  // Référence : 2024-01-01 est un lundi (index 0, pair)
  it("100% sur 5 jours ouvrés (lun-ven) → 5", () => {
    expect(joursVacancesTheoriques(100, "2024-01-01", "2024-01-05")).toBe(5);
  });

  it("80% sur 5 jours ouvrés → 4", () => {
    expect(joursVacancesTheoriques(80, "2024-01-01", "2024-01-05")).toBe(4);
  });

  it("50% sur semaine paire (index 0) → plancher 2", () => {
    // 2024-01-01 à 2024-01-07 : semaine index 0 (pair) → joursTravaillesSemaine(50,0)=2
    expect(joursVacancesTheoriques(50, "2024-01-01", "2024-01-07")).toBe(2);
  });

  it("50% sur semaine impaire (index 1) → plafond 3", () => {
    // 2024-01-08 à 2024-01-14 : semaine index 1 (impair) → joursTravaillesSemaine(50,1)=3
    expect(joursVacancesTheoriques(50, "2024-01-08", "2024-01-14")).toBe(3);
  });

  it("plage nulle (un seul jour) → au plus 1", () => {
    const j = joursVacancesTheoriques(100, "2024-01-01", "2024-01-01");
    expect(j).toBeGreaterThanOrEqual(0);
    expect(j).toBeLessThanOrEqual(1);
  });
});
