import { describe, it, expect } from "vitest";
import {
  TITRE_MESSAGE_PROPRIETAIRE,
  aUnMessageProprietaire,
  messageProprietaire,
} from "@/src/lib/messageProprietaire";

/**
 * Le message que le propriétaire laisse en réservant.
 *
 * Deux règles, et elles portent tout : un encadré ne paraît QUE s'il y a
 * quelque chose à lire, et ce qu'on lit est ce qui a été écrit — sauts de
 * ligne compris.
 */

describe("l’encadré n’apparaît que s’il y a un message", () => {
  it("un message paraît", () => {
    expect(messageProprietaire("Il boite de la patte arrière droite.")).toBe(
      "Il boite de la patte arrière droite."
    );
    expect(aUnMessageProprietaire("Il boite de la patte arrière droite.")).toBe(true);
  });

  it("un champ vide ne paraît pas", () => {
    expect(messageProprietaire("")).toBeNull();
    expect(aUnMessageProprietaire("")).toBe(false);
  });

  it("un champ absent ne paraît pas", () => {
    expect(messageProprietaire(null)).toBeNull();
    expect(messageProprietaire(undefined)).toBeNull();
    expect(aUnMessageProprietaire(null)).toBe(false);
    expect(aUnMessageProprietaire(undefined)).toBe(false);
  });

  it("un champ qui ne contient que des espaces ne paraît pas", () => {
    // Un cadre vide sur trois écrans, c'est trois fois du bruit — et le jour
    // où il y aura vraiment un message, plus personne ne le regardera.
    expect(messageProprietaire("   ")).toBeNull();
    expect(messageProprietaire("\n")).toBeNull();
    expect(messageProprietaire("\n\n   \t\n")).toBeNull();
    expect(aUnMessageProprietaire("   ")).toBe(false);
  });

  it("un seul caractère suffit à faire paraître l’encadré", () => {
    expect(messageProprietaire("?")).toBe("?");
    expect(aUnMessageProprietaire("?")).toBe(true);
  });
});

describe("le texte est rendu tel qu’il a été écrit", () => {
  it("les sauts de ligne sont conservés", () => {
    const deuxParagraphes =
      "Filou boite depuis mardi, la patte arrière droite.\n" +
      "Le vétérinaire l'a vu, ce n'est rien de grave.\n" +
      "\n" +
      "Il a aussi très peur de l'orage : s'il tonne, laissez-le à l'intérieur.";
    expect(messageProprietaire(deuxParagraphes)).toBe(deuxParagraphes);
  });

  it("un saut de ligne simple ne se recolle pas", () => {
    expect(messageProprietaire("Ligne 1\nLigne 2")).toBe("Ligne 1\nLigne 2");
  });

  it("la ponctuation, les accents et les apostrophes passent intacts", () => {
    const texte = "Traitement : ½ comprimé d’Apoquel matin & soir — jusqu’au 12/10.";
    expect(messageProprietaire(texte)).toBe(texte);
  });

  it("seuls les blancs de BORDURE tombent : l’encadré ne s’ouvre pas sur du vide", () => {
    expect(messageProprietaire("\n\n  Il boite.\n\n  ")).toBe("Il boite.");
    // Ce qui est à l'intérieur, en revanche, ne bouge pas d'un caractère.
    expect(messageProprietaire("  a\n\n\nb  ")).toBe("a\n\n\nb");
  });
});

describe("le titre de l’encadré", () => {
  it("nomme son auteur, pour qu’on ne le prenne pas pour une note interne", () => {
    expect(TITRE_MESSAGE_PROPRIETAIRE).toBe("Message du propriétaire");
  });
});
