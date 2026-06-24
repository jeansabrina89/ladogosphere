import { describe, it, expect } from "vitest";
import { cartesEligibles } from "../src/lib/abonnementsTypes";

describe("cartesEligibles", () => {
  it("1 chien partage_autorise -> [journee_partage_1]", () => {
    expect(cartesEligibles([{ hebergement_autorise: "partage_autorise" }])).toEqual(["journee_partage_1"]);
  });

  it("2 chiens partage_autorise -> [journee_partage_1, journee_partage_2]", () => {
    expect(
      cartesEligibles([
        { hebergement_autorise: "partage_autorise" },
        { hebergement_autorise: "partage_autorise" },
      ])
    ).toEqual(["journee_partage_1", "journee_partage_2"]);
  });

  it("1 chien privatif_obligatoire -> [journee_privatif]", () => {
    expect(cartesEligibles([{ hebergement_autorise: "privatif_obligatoire" }])).toEqual(["journee_privatif"]);
  });

  it("1 partage + 1 privatif -> [journee_partage_1, journee_privatif]", () => {
    expect(
      cartesEligibles([
        { hebergement_autorise: "partage_autorise" },
        { hebergement_autorise: "privatif_obligatoire" },
      ])
    ).toEqual(["journee_partage_1", "journee_privatif"]);
  });

  it("chien actif:false est ignore", () => {
    expect(
      cartesEligibles([
        { hebergement_autorise: "partage_autorise", actif: false },
        { hebergement_autorise: "partage_autorise", actif: true },
      ])
    ).toEqual(["journee_partage_1"]);
  });

  it("hebergement_autorise null est ignore", () => {
    expect(
      cartesEligibles([
        { hebergement_autorise: null },
        { hebergement_autorise: "partage_autorise" },
      ])
    ).toEqual(["journee_partage_1"]);
  });

  it("liste vide -> []", () => {
    expect(cartesEligibles([])).toEqual([]);
  });
});
