import { describe, it, expect } from "vitest";
import { cartesEligibles, categorieJourneePourChiens } from "../src/lib/abonnementsTypes";

describe("cartesEligibles", () => {
  it("1 chien {doit_etre_isole:false} -> [journee_partage_1]", () => {
    expect(cartesEligibles([{ doit_etre_isole: false }])).toEqual(["journee_partage_1"]);
  });

  it("2 chiens sociables -> [journee_partage_1, journee_partage_2]", () => {
    expect(
      cartesEligibles([{ doit_etre_isole: false }, { doit_etre_isole: false }])
    ).toEqual(["journee_partage_1", "journee_partage_2"]);
  });

  it("3 chiens sociables -> [journee_partage_1, journee_partage_2, journee_partage_3]", () => {
    expect(
      cartesEligibles([{ doit_etre_isole: false }, { doit_etre_isole: false }, { doit_etre_isole: false }])
    ).toEqual(["journee_partage_1", "journee_partage_2", "journee_partage_3"]);
  });

  it("1 chien {doit_etre_isole:true} -> [journee_privatif]", () => {
    expect(cartesEligibles([{ doit_etre_isole: true }])).toEqual(["journee_privatif"]);
  });

  it("1 sociable + 1 isole -> [journee_partage_1, journee_privatif]", () => {
    expect(
      cartesEligibles([{ doit_etre_isole: false }, { doit_etre_isole: true }])
    ).toEqual(["journee_partage_1", "journee_privatif"]);
  });

  it("chien actif:false est ignore", () => {
    expect(
      cartesEligibles([{ doit_etre_isole: false, actif: false }, { doit_etre_isole: false, actif: true }])
    ).toEqual(["journee_partage_1"]);
  });

  it("liste vide -> []", () => {
    expect(cartesEligibles([])).toEqual([]);
  });
});

describe("categorieJourneePourChiens", () => {
  it("[] -> null", () => {
    expect(categorieJourneePourChiens([])).toBeNull();
  });

  it("1 chien sociable -> journee_partage_1", () => {
    expect(categorieJourneePourChiens([{ doit_etre_isole: false }])).toBe("journee_partage_1");
  });

  it("2 chiens sociables -> journee_partage_2", () => {
    expect(
      categorieJourneePourChiens([{ doit_etre_isole: false }, { doit_etre_isole: false }])
    ).toBe("journee_partage_2");
  });

  it("3 chiens sociables -> journee_partage_3", () => {
    expect(
      categorieJourneePourChiens([{ doit_etre_isole: false }, { doit_etre_isole: false }, { doit_etre_isole: false }])
    ).toBe("journee_partage_3");
  });

  it("4 chiens sociables -> null", () => {
    expect(
      categorieJourneePourChiens([
        { doit_etre_isole: false }, { doit_etre_isole: false },
        { doit_etre_isole: false }, { doit_etre_isole: false },
      ])
    ).toBeNull();
  });

  it("tout lot avec un {doit_etre_isole:true} -> journee_privatif", () => {
    expect(
      categorieJourneePourChiens([{ doit_etre_isole: false }, { doit_etre_isole: true }])
    ).toBe("journee_privatif");
  });
});
