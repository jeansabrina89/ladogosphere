import { describe, it, expect } from "vitest";
import {
  MENTION_SANS_EFFET_RETROACTIF,
  POURCENTAGE_PAR_DEFAUT,
  TEXTES_PUBLICS_REMISE_MEMBRE,
  avertissementTextesASuivre,
  categorieExclue,
  pourcentageEffectif,
  refusPourcentageRemise,
  resumeRemises,
  type LigneRemiseCategorie,
} from "@/src/lib/remiseMembreLogique";
import { CATEGORIES_ARTICLE, libelleCategorieArticle } from "@/src/lib/boutiqueLogique";

/**
 * La remise d'adhésion, catégorie par catégorie.
 *
 * 0 % ou inactive : la catégorie est exclue, et aucune mention de remise ne
 * paraît sur ses articles. Annoncer une remise qui ne s'applique pas est pire
 * que ne rien annoncer.
 */

const ligne = (p: Partial<LigneRemiseCategorie> & { categorie: string }): LigneRemiseCategorie => ({
  pourcentage: POURCENTAGE_PAR_DEFAUT,
  actif: true,
  nbArticles: 3,
  ...p,
});

describe("le régime en vigueur", () => {
  it("est 10 %, et c’est ce que la reprise a écrit partout", () => {
    expect(POURCENTAGE_PAR_DEFAUT).toBe(10);
  });

  it("couvre les seize catégories du magasin", () => {
    expect(CATEGORIES_ARTICLE).toHaveLength(16);
  });
});

describe("l’exclusion d’une catégorie", () => {
  it("0 % exclut", () => {
    expect(categorieExclue(ligne({ categorie: "soins", pourcentage: 0 }))).toBe(true);
    expect(pourcentageEffectif(ligne({ categorie: "soins", pourcentage: 0 }))).toBe(0);
  });

  it("inactive exclut aussi : les deux disent la même chose", () => {
    expect(categorieExclue(ligne({ categorie: "soins", actif: false }))).toBe(true);
    expect(pourcentageEffectif(ligne({ categorie: "soins", pourcentage: 10, actif: false }))).toBe(0);
  });

  it("un taux positif et actif s’applique tel quel", () => {
    expect(pourcentageEffectif(ligne({ categorie: "jouets", pourcentage: 5 }))).toBe(5);
    expect(categorieExclue(ligne({ categorie: "jouets", pourcentage: 5 }))).toBe(false);
  });

  it("une ligne absente vaut zéro, pas « le défaut » : on ne devine pas", () => {
    expect(pourcentageEffectif(null)).toBe(0);
    expect(pourcentageEffectif(undefined)).toBe(0);
  });
});

describe("les refus de saisie", () => {
  it("acceptent 0 : c’est la façon d’exclure", () => {
    expect(refusPourcentageRemise("0")).toBeNull();
    expect(refusPourcentageRemise("10")).toBeNull();
    expect(refusPourcentageRemise("7,5")).toBeNull();
  });

  it("refusent le vide, le négatif, l’au-delà de 100 et le non-nombre", () => {
    expect(refusPourcentageRemise("")).toContain("Mettez 0 pour exclure");
    expect(refusPourcentageRemise("-5")).toContain("négatif");
    expect(refusPourcentageRemise("120")).toContain("ne dépasse pas 100");
    expect(refusPourcentageRemise("beaucoup")).toContain("n'est pas un nombre");
  });
});

describe("les textes que les clients lisent", () => {
  it("sont nommés avec l’endroit où ils vivent", () => {
    expect(TEXTES_PUBLICS_REMISE_MEMBRE).toHaveLength(3);
    expect(TEXTES_PUBLICS_REMISE_MEMBRE.map((t) => t.ou)).toContain("Site vitrine, page Adhésion");
    expect(TEXTES_PUBLICS_REMISE_MEMBRE.map((t) => t.ou))
      .toContain("Conditions d'adhésion remises au client");
  });

  it("ne déclenchent aucun avertissement tant que rien n’est exclu", () => {
    const toutes = CATEGORIES_ARTICLE.map((c) => ligne({ categorie: c.valeur }));
    expect(avertissementTextesASuivre(toutes, libelleCategorieArticle)).toBeNull();
  });

  it("sont signalés — pas modifiés — dès qu’une catégorie sort", () => {
    const lignes = [
      ligne({ categorie: "soins", pourcentage: 0 }),
      ligne({ categorie: "jouets" }),
    ];
    const avertissement = avertissementTextesASuivre(lignes, libelleCategorieArticle);
    expect(avertissement).toContain("Soins");
    expect(avertissement).toContain("à la main");
    expect(avertissement).toContain("Cet écran ne les touche pas");
  });

  it("nomme toutes les catégories sorties, pas seulement la première", () => {
    const lignes = [
      ligne({ categorie: "soins", pourcentage: 0 }),
      ligne({ categorie: "jouets", actif: false }),
      ligne({ categorie: "colliers" }),
    ];
    const avertissement = avertissementTextesASuivre(lignes, libelleCategorieArticle)!;
    expect(avertissement).toContain("Soins");
    expect(avertissement).toContain("Jouets");
    expect(avertissement).not.toContain("Colliers");
  });
});

describe("ce qui ne bouge pas", () => {
  it("est dit à l’écran, en toutes lettres", () => {
    expect(MENTION_SANS_EFFET_RETROACTIF).toContain("à partir de son enregistrement");
    expect(MENTION_SANS_EFFET_RETROACTIF).toContain("Aucune facture déjà émise ne change");
    expect(MENTION_SANS_EFFET_RETROACTIF).toContain("aucun panier déjà validé n'est recalculé");
  });
});

describe("le résumé de l’écran", () => {
  it("dit un taux unique quand il n’y en a qu’un", () => {
    const lignes = CATEGORIES_ARTICLE.map((c) => ligne({ categorie: c.valeur }));
    expect(resumeRemises(lignes)).toBe("Remise membre : 10 % sur 16 catégories.");
  });

  it("dit la fourchette quand les taux diffèrent, et compte les exclues", () => {
    const lignes = [
      ligne({ categorie: "friandises", pourcentage: 5 }),
      ligne({ categorie: "colliers", pourcentage: 15 }),
      ligne({ categorie: "soins", pourcentage: 0 }),
    ];
    expect(resumeRemises(lignes))
      .toBe("Remise membre : de 5 % à 15 % selon la catégorie — 1 catégorie exclue.");
  });

  it("le dit franchement quand plus rien n’ouvre la remise", () => {
    const lignes = CATEGORIES_ARTICLE.map((c) => ligne({ categorie: c.valeur, pourcentage: 0 }));
    expect(resumeRemises(lignes)).toBe("Aucune catégorie ne donne droit à la remise membre.");
  });
});
