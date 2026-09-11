import { describe, it, expect } from "vitest";
import {
  USAGES_BOX,
  USAGE_BOX_PAR_DEFAUT,
  estBoxDePension,
  infoUsageBox,
  libelleUsageBox,
  parcBox,
  resumeParcBox,
  usageBox,
} from "@/src/lib/usageBox";

/**
 * « 14 » ne veut rien dire au moment d'accepter une réservation : deux de ces
 * box ne sont pas de la pension. Mais ils occupent de la surface, et ne sont
 * retirés d'aucun calcul de disponibilité.
 */

describe("les trois usages", () => {
  it("sont ceux de la maison, et la pension est le défaut", () => {
    expect(USAGES_BOX.map((u) => u.valeur)).toEqual([
      "pension", "prive_hors_sarl", "refacture",
    ]);
    expect(USAGE_BOX_PAR_DEFAUT).toBe("pension");
  });

  it("une valeur absente ou inventée retombe sur la pension", () => {
    expect(usageBox(null)).toBe("pension");
    expect(usageBox("garage")).toBe("pension");
    expect(libelleUsageBox(undefined)).toBe("Pension");
  });

  it("disent chacun d’où vient l’argent", () => {
    expect(infoUsageBox("prive_hors_sarl").aide).toContain("aucun loyer");
    expect(infoUsageBox("refacture").aide).toContain("refacturé");
  });

  it("seule la pension est offerte à la clientèle", () => {
    expect(estBoxDePension("pension")).toBe(true);
    expect(estBoxDePension("prive_hors_sarl")).toBe(false);
    expect(estBoxDePension("refacture")).toBe(false);
  });
});

describe("le parc de box", () => {
  const maison = [
    ...Array.from({ length: 12 }, () => ({ actif: true, usage_box: "pension" })),
    { actif: true, usage_box: "prive_hors_sarl" },
    { actif: true, usage_box: "refacture" },
  ];

  it("sépare ce qui accueille des clients du reste", () => {
    expect(parcBox(maison)).toEqual({
      pension: 12, particuliers: 2, actifs: 14, inactifs: 0,
    });
  });

  it("se lit en une phrase qui aide à décider", () => {
    expect(resumeParcBox(parcBox(maison))).toBe("12 box de pension · 2 box particuliers");
  });

  it("un box désactivé n’accueille rien et se compte à part", () => {
    const parc = parcBox([...maison, { actif: false, usage_box: "pension" }]);
    expect(parc).toEqual({ pension: 12, particuliers: 2, actifs: 14, inactifs: 1 });
    expect(resumeParcBox(parc)).toBe("12 box de pension · 2 box particuliers · 1 désactivé");
  });

  it("avant que Sabrina ne qualifie quoi que ce soit, tout est de la pension", () => {
    // Le défaut ne retire aucune place : c'est le sens de « pension ».
    const parc = parcBox(Array.from({ length: 14 }, () => ({ actif: true })));
    expect(parc.pension).toBe(14);
    expect(resumeParcBox(parc)).toBe("14 box de pension");
  });

  it("le singulier se dit au singulier", () => {
    const parc = parcBox([
      { actif: true, usage_box: "pension" },
      { actif: true, usage_box: "refacture" },
    ]);
    expect(resumeParcBox(parc)).toBe("1 box de pension · 1 box particulier");
  });
});
