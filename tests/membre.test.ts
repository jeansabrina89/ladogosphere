import { describe, it, expect } from "vitest";
import { anneesPertinentes } from "../src/lib/membre";

describe("anneesPertinentes — période de grâce janvier-février", () => {
  it("mars : uniquement l'année en cours", () => {
    expect(anneesPertinentes("2025-03-15")).toEqual([2025]);
  });

  it("décembre : uniquement l'année en cours", () => {
    expect(anneesPertinentes("2025-12-31")).toEqual([2025]);
  });

  it("septembre : uniquement l'année en cours", () => {
    expect(anneesPertinentes("2024-09-01")).toEqual([2024]);
  });

  it("janvier : année en cours + année précédente (grâce)", () => {
    expect(anneesPertinentes("2025-01-15")).toEqual([2025, 2024]);
  });

  it("février : année en cours + année précédente (grâce)", () => {
    expect(anneesPertinentes("2025-02-28")).toEqual([2025, 2024]);
  });

  it("1er janvier : grâce active", () => {
    expect(anneesPertinentes("2024-01-01")).toEqual([2024, 2023]);
  });

  it("sans argument : retourne un tableau non-vide (date du jour)", () => {
    const r = anneesPertinentes();
    expect(r.length).toBeGreaterThanOrEqual(1);
    expect(r.every((a) => typeof a === "number")).toBe(true);
  });
});
