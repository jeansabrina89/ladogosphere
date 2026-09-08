import { describe, it, expect } from "vitest";
import {
  motsIllustration,
  TYPES_GROUPE,
  type TypeGroupe,
} from "@/src/lib/personnalisationLogique";

/**
 * Une image sur chaque groupe, quel que soit son type — mais pas le même mot.
 *
 * Sur une mesure, le dessin dit OÙ poser le mètre : l'appeler « illustration »
 * le ferait prendre pour une décoration. Partout ailleurs, il montre DE QUELLE
 * PARTIE de l'objet on parle : parler de « schéma de mesure » n'aurait aucun
 * sens sur un choix de couleur.
 */

const TOUS = TYPES_GROUPE.map((t) => t.valeur);
const AUTRES: TypeGroupe[] = ["liste", "couleur", "texte", "booleen", "taille"];

describe("le vocabulaire suit l'usage, pas la colonne", () => {
  it("une mesure parle de guide de mesure", () => {
    const m = motsIllustration("mesure");
    expect(m.titre).toBe("Guide de mesure");
    expect(m.alt("Tour de cou")).toBe("Où mesurer : Tour de cou");
    expect(m.succesDepot).toBe("Schéma de mesure enregistré.");
    expect(m.absente).toBe("Aucun schéma de mesure n'est encore déposé.");
  });

  it("tous les autres types parlent d'illustration", () => {
    for (const type of AUTRES) {
      const m = motsIllustration(type);
      expect(m.titre, type).toBe("Illustration");
      expect(m.alt("Boucle"), type).toBe("Illustration : Boucle");
      expect(m.succesDepot, type).toBe("Illustration enregistrée.");
      expect(m.absente, type).toBe("Aucune illustration n'est encore déposée.");
    }
  });

  it("les six types du catalogue sont couverts, sans exception", () => {
    expect(TOUS).toEqual(["liste", "couleur", "texte", "booleen", "mesure", "taille"]);
    for (const type of TOUS) {
      const m = motsIllustration(type);
      expect(m.titre, type).toBeTruthy();
      expect(m.aide, type).toBeTruthy();
      expect(m.deposer, type).toBeTruthy();
    }
  });

  it("un type inconnu ou absent retombe sur « Illustration », jamais sur un vide", () => {
    for (const brut of [null, undefined, "", "inconnu"]) {
      expect(motsIllustration(brut).titre).toBe("Illustration");
    }
  });
});

describe("les mots eux-mêmes", () => {
  it("chaque phrase est écrite, jamais fabriquée par concaténation", () => {
    // « Illustration enregistrée » s'accorde au féminin, « Schéma enregistré »
    // au masculin : deux phrases, pas un gabarit.
    expect(motsIllustration("couleur").succesRetrait).toBe("Illustration retirée.");
    expect(motsIllustration("mesure").succesRetrait).toBe("Schéma de mesure retiré.");
  });

  it("les refus disent ce qui a échoué, en français", () => {
    for (const type of TOUS) {
      const m = motsIllustration(type);
      expect(m.echecDepot, type).toMatch(/^Le dépôt .* a échoué\.$/);
      expect(m.echecEnregistrement, type).toMatch(/^L'enregistrement .* a échoué\.$/);
    }
  });

  it("l'étiquette d'agrandissement nomme le groupe : sans elle, on lit « bouton »", () => {
    expect(motsIllustration("couleur").agrandir("Coloris de la sangle"))
      .toBe("Agrandir l'illustration : Coloris de la sangle");
    expect(motsIllustration("mesure").agrandir("Tour de cou"))
      .toBe("Agrandir le schéma de mesure : Tour de cou");
  });

  it("les deux vocabulaires ne se confondent jamais", () => {
    const mesure = motsIllustration("mesure");
    const autre = motsIllustration("couleur");
    for (const cle of ["titre", "aide", "deposer", "absente", "succesDepot"] as const) {
      expect(mesure[cle], cle).not.toBe(autre[cle]);
    }
  });
});
