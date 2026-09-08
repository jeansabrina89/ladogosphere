import { describe, it, expect } from "vitest";
import {
  AVERTISSEMENT_CONTRE_PRESTATIONS_RECUES,
  BASES_DECOMPTE,
  BASE_DECOMPTE_PAR_DEFAUT,
  REGIME_VIERGE,
  avertissementBaseDecompte,
} from "@/src/lib/decompteTvaLogique";

/**
 * La base du décompte : les contre-prestations CONVENUES.
 *
 * C'est le principe légal, et c'est ce que le décompte applique — il agrège
 * par date de facture. Le réglage décrit la réalité ; il ne la contredit pas.
 */

describe("le défaut", () => {
  it("porte sur les contre-prestations convenues", () => {
    expect(BASE_DECOMPTE_PAR_DEFAUT).toBe("convenues");
  });

  it("est celui d’un régime encore vierge", () => {
    expect(REGIME_VIERGE.baseDecompte).toBe("convenues");
  });

  it("se présente en premier dans la liste : c’est le cas ordinaire", () => {
    expect(BASES_DECOMPTE[0].valeur).toBe("convenues");
    expect(BASES_DECOMPTE.map((b) => b.valeur)).toEqual(["convenues", "recues"]);
  });

  it("dit que la TVA est due dès l’émission, même impayée", () => {
    const convenues = BASES_DECOMPTE.find((b) => b.valeur === "convenues")!;
    expect(convenues.aide).toContain("dès l'émission de la facture, même impayée");
    expect(convenues.aide).toContain("c'est ce que le décompte applique");
  });
});

describe("l’avertissement des contre-prestations reçues", () => {
  it("paraît dès que « reçues » est choisi, mot pour mot", () => {
    expect(avertissementBaseDecompte("recues")).toBe(
      "Le décompte selon les contre-prestations reçues exige une autorisation de l'AFC. " +
      "Tant que cette option n'est pas mise en œuvre, le décompte reste calculé sur les " +
      "contre-prestations convenues."
    );
    expect(avertissementBaseDecompte("recues")).toBe(AVERTISSEMENT_CONTRE_PRESTATIONS_RECUES);
  });

  it("ne paraît pas sur la base que le décompte applique vraiment", () => {
    expect(avertissementBaseDecompte("convenues")).toBeNull();
    expect(avertissementBaseDecompte(null)).toBeNull();
    expect(avertissementBaseDecompte(undefined)).toBeNull();
  });

  it("dit les deux choses qui comptent : l’autorisation, et ce qui est calculé", () => {
    const a = AVERTISSEMENT_CONTRE_PRESTATIONS_RECUES;
    // Un chiffre ne doit jamais pouvoir être lu comme reposant sur une base
    // qu'il n'applique pas.
    expect(a).toContain("exige une autorisation de l'AFC");
    expect(a).toContain("le décompte reste calculé sur les contre-prestations convenues");
  });

  it("renvoie une seule phrase, réutilisable telle quelle aux deux endroits", () => {
    // Le même texte sous le réglage ET en tête du décompte : une seule source.
    expect(avertissementBaseDecompte("recues")).toBe(avertissementBaseDecompte("recues"));
    expect(AVERTISSEMENT_CONTRE_PRESTATIONS_RECUES.split("\n")).toHaveLength(1);
  });
});
