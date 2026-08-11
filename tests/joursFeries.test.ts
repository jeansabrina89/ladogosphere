import { describe, it, expect } from "vitest";
import { getJoursFeries } from "../src/lib/joursFeries";

describe("getJoursFeries — jours fériés valaisans", () => {
  it("2026 reproduit exactement les 9 dates existantes", () => {
    expect(getJoursFeries(2026)).toEqual([
      "2026-01-01", "2026-03-19", "2026-05-14", "2026-06-04",
      "2026-08-01", "2026-08-15", "2026-11-01", "2026-12-08", "2026-12-25",
    ]);
  });

  it("2027 reproduit exactement les 9 dates existantes", () => {
    expect(getJoursFeries(2027)).toEqual([
      "2027-01-01", "2027-03-19", "2027-05-06", "2027-05-27",
      "2027-08-01", "2027-08-15", "2027-11-01", "2027-12-08", "2027-12-25",
    ]);
  });

  it("2028 : 9 dates non vides, avec Nouvel An, Noël et les fériés mobiles corrects", () => {
    const feries = getJoursFeries(2028);
    expect(feries).toHaveLength(9);
    expect(feries).toContain("2028-01-01");
    expect(feries).toContain("2028-12-25");
    // Pâques 2028 = 16 avril → Ascension +39 j, Fête-Dieu +60 j.
    expect(feries).toContain("2028-05-25"); // Ascension
    expect(feries).toContain("2028-06-15"); // Fête-Dieu
  });

  it("le résultat est trié en ordre croissant, pour toute année", () => {
    for (const annee of [2025, 2028, 2030, 2040, 2099]) {
      const feries = getJoursFeries(annee);
      expect(feries).toHaveLength(9);
      expect([...feries].sort()).toEqual(feries);
    }
  });
});
