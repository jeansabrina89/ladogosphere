import { describe, it, expect } from "vitest";
import { pourPdf } from "@/src/lib/texteWinAnsi";
import { libelleRemise } from "@/src/lib/prixLogique";

/**
 * Ce qu'une police PDF de base sait écrire.
 *
 * Les documents sont composés en Helvetica `/WinAnsiEncoding`, sans table de
 * différences : un caractère absent ne lève rien, il DISPARAÎT. Le cas qui
 * coûte cher est le signe moins « − » : « Remise membre −10 % » s'imprimait
 * « Remise membre 10 % », qui se lit comme une majoration.
 */

describe("le signe moins", () => {
  it("devient un trait d’union, qui lui s’imprime", () => {
    expect(pourPdf("Remise membre −10 %")).toBe("Remise membre -10 %");
    expect(pourPdf(libelleRemise("Action du mois", 20))).toBe("Action du mois -20 %");
  });

  it("vaut aussi pour les tirets cadratins des libellés composés", () => {
    expect(pourPdf("Retour — Croquettes")).toBe("Retour - Croquettes");
    expect(pourPdf("TVA non applicable – art. 10 LTVA")).toBe("TVA non applicable - art. 10 LTVA");
  });

  it("laisse intact ce que WinAnsi sait déjà écrire", () => {
    expect(pourPdf("Pâtée à l’agneau « bio » · 2 × 4,50 CHF")).toBe(
      "Pâtée à l'agneau « bio » · 2 × 4,50 CHF"
    );
  });

  it("ne casse pas sur rien", () => {
    expect(pourPdf(null)).toBe("");
    expect(pourPdf(undefined)).toBe("");
    expect(pourPdf("")).toBe("");
  });

  it("ne touche pas au texte à l’écran : c’est la SORTIE qui s’adapte", () => {
    // Le libellé stocké garde le bon caractère typographique.
    expect(libelleRemise("Remise membre", 10)).toBe("Remise membre −10 %");
  });
});
