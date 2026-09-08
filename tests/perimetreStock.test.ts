import { describe, it, expect } from "vitest";
import {
  PERIMETRES,
  configPerimetre,
  perimetreDeArticle,
  estDuPerimetre,
  filtrerPerimetre,
  permissionStock,
  accesStockAccorde,
  perimetreDuCompte,
  COMPTE_MATIERES_FABRICATION,
  COMPTE_MARCHANDISES_REVENDUES,
} from "@/src/lib/perimetreStock";
import { ecartEquilibre } from "@/src/lib/rapportsCompta";

/**
 * L'atelier et le magasin ne se mélangent pas.
 *
 * Une fourniture qui apparaît dans un écran de boutique, c'est Sabrina qui s'y
 * perd ; un article vendable dans l'atelier, c'est une commande fournisseur
 * passée pour rien.
 */

const article = (composant: boolean | null | undefined, nom = "x") => ({ nom, composant });

describe("à quel périmètre appartient un article", () => {
  it("la fourniture est celle qui porte le drapeau", () => {
    expect(perimetreDeArticle(article(true))).toBe("atelier");
    expect(perimetreDeArticle(article(false))).toBe("boutique");
  });

  it("un article sans drapeau se vend : c'est l'ancien monde, jamais une fourniture", () => {
    expect(perimetreDeArticle(article(null))).toBe("boutique");
    expect(perimetreDeArticle(article(undefined))).toBe("boutique");
    expect(perimetreDeArticle(null)).toBe("boutique");
    expect(perimetreDeArticle({})).toBe("boutique");
  });

  it("estDuPerimetre répond aux deux questions", () => {
    expect(estDuPerimetre(article(true), "atelier")).toBe(true);
    expect(estDuPerimetre(article(true), "boutique")).toBe(false);
    expect(estDuPerimetre(article(false), "boutique")).toBe(true);
  });
});

describe("les listes ne se mélangent plus", () => {
  const catalogue = [
    article(false, "Croquettes"),
    article(true, "Sangle 20 mm"),
    article(false, "Collier"),
    article(true, "Boucle inox"),
    article(null, "Vieux jouet"),
  ];

  it("la boutique ne montre AUCUNE fourniture", () => {
    const vus = filtrerPerimetre(catalogue, "boutique").map((a) => a.nom);
    expect(vus).toEqual(["Croquettes", "Collier", "Vieux jouet"]);
    expect(vus).not.toContain("Sangle 20 mm");
    expect(vus).not.toContain("Boucle inox");
  });

  it("l'atelier ne montre AUCUN article vendable", () => {
    const vus = filtrerPerimetre(catalogue, "atelier").map((a) => a.nom);
    expect(vus).toEqual(["Sangle 20 mm", "Boucle inox"]);
  });

  it("les deux listes se complètent exactement : rien ne se perd, rien n'apparaît deux fois", () => {
    const total = filtrerPerimetre(catalogue, "boutique").length
      + filtrerPerimetre(catalogue, "atelier").length;
    expect(total).toBe(catalogue.length);
  });

  it("l'ordre reçu est conservé : on filtre, on ne retrie pas", () => {
    expect(filtrerPerimetre(catalogue, "boutique").map((a) => a.nom))
      .toEqual(["Croquettes", "Collier", "Vieux jouet"]);
  });
});

describe("la permission dépend du périmètre, pas de l'écran", () => {
  it("l'atelier n'a qu'un niveau ; la boutique en a deux", () => {
    expect(permissionStock("atelier", "vente")).toBe("perm_atelier");
    expect(permissionStock("atelier", "gestion")).toBe("perm_atelier");
    expect(permissionStock("boutique", "vente")).toBe("perm_boutique_vente");
    expect(permissionStock("boutique", "gestion")).toBe("perm_boutique_gestion");
  });

  it("gérer le magasin n'ouvre PAS l'atelier", () => {
    const gestionnaire = { perm_boutique_vente: true, perm_boutique_gestion: true, perm_atelier: false };
    expect(accesStockAccorde(gestionnaire, "boutique", "gestion")).toBe(true);
    expect(accesStockAccorde(gestionnaire, "atelier", "gestion")).toBe(false);
  });

  it("et l'atelier n'ouvre pas le magasin", () => {
    const artisane = { perm_atelier: true };
    expect(accesStockAccorde(artisane, "atelier", "gestion")).toBe(true);
    expect(accesStockAccorde(artisane, "boutique", "vente")).toBe(false);
    expect(accesStockAccorde(artisane, "boutique", "gestion")).toBe(false);
  });

  it("une vendeuse ne gère ni l'un ni l'autre", () => {
    const vendeuse = { perm_boutique_vente: true };
    expect(accesStockAccorde(vendeuse, "boutique", "vente")).toBe(true);
    expect(accesStockAccorde(vendeuse, "boutique", "gestion")).toBe(false);
    expect(accesStockAccorde(vendeuse, "atelier", "vente")).toBe(false);
  });

  it("rien de coché, rien d'ouvert — et une valeur approximative ne vaut pas true", () => {
    expect(accesStockAccorde({}, "atelier", "gestion")).toBe(false);
    expect(accesStockAccorde(null, "boutique", "vente")).toBe(false);
    expect(accesStockAccorde({ perm_atelier: 1 as unknown as boolean }, "atelier", "vente")).toBe(false);
  });
});

describe("la catégorie de dépense décide de l'entrée en stock", () => {
  it("4000 entre des fournitures, 4200 des marchandises", () => {
    expect(perimetreDuCompte(COMPTE_MATIERES_FABRICATION)).toBe("atelier");
    expect(perimetreDuCompte(COMPTE_MARCHANDISES_REVENDUES)).toBe("boutique");
    expect(COMPTE_MATIERES_FABRICATION).toBe("4000");
    expect(COMPTE_MARCHANDISES_REVENDUES).toBe("4200");
  });

  it("toute autre catégorie n'ouvre pas d'entrée en stock du tout", () => {
    expect(perimetreDuCompte("6500")).toBeNull();
    expect(perimetreDuCompte(null)).toBeNull();
    expect(perimetreDuCompte(undefined)).toBeNull();
  });
});

describe("la configuration d'écran", () => {
  it("chaque périmètre a ses propres adresses, et elles ne se croisent pas", () => {
    expect(configPerimetre("boutique").liste).toBe("/boutique/articles");
    expect(configPerimetre("atelier").liste).toBe("/atelier/fournitures");
    expect(configPerimetre("boutique").accueil).toBe("/boutique");
    expect(configPerimetre("atelier").accueil).toBe("/atelier");
  });

  it("les libellés sont écrits, pas fabriqués : le français s'accorde", () => {
    expect(PERIMETRES.atelier.affiches(1)).toBe("1 fourniture affichée");
    expect(PERIMETRES.atelier.affiches(3)).toBe("3 fournitures affichées");
    expect(PERIMETRES.boutique.affiches(1)).toBe("1 article affiché");
    expect(PERIMETRES.boutique.affiches(3)).toBe("3 articles affichés");
    expect(PERIMETRES.atelier.tuileActifs).toBe("Fournitures actives");
    expect(PERIMETRES.boutique.tuileActifs).toBe("Articles actifs");
  });

  it("le drapeau `composant` de chaque périmètre est celui de la requête", () => {
    expect(PERIMETRES.boutique.composant).toBe(false);
    expect(PERIMETRES.atelier.composant).toBe(true);
  });
});

describe("l'équilibre du grand-livre", () => {
  it("doit être zéro quand débits et crédits se répondent", () => {
    expect(ecartEquilibre([
      { debit: 120, credit: 0 },
      { debit: 0, credit: 120 },
    ])).toBe(0);
  });

  it("dit l'écart quand il y en a un", () => {
    expect(ecartEquilibre([{ debit: 100, credit: 0 }, { debit: 0, credit: 99.9 }])).toBe(0.1);
  });

  it("supporte les nombres écrits en texte et les nuls, comme les rend PostgREST", () => {
    expect(ecartEquilibre([
      { debit: "80.00", credit: null },
      { debit: null, credit: "80.00" },
    ])).toBe(0);
  });

  it("ne rend jamais un centime fantôme d'arrondi flottant", () => {
    expect(ecartEquilibre([
      { debit: 0.1, credit: 0 }, { debit: 0.2, credit: 0 }, { debit: 0, credit: 0.3 },
    ])).toBe(0);
  });

  it("sur un grand-livre vide, zéro", () => {
    expect(ecartEquilibre([])).toBe(0);
  });
});
