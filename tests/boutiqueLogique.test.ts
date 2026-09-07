import { describe, it, expect } from "vitest";
import {
  CATEGORIES_ARTICLE,
  TAUX_REDUIT,
  TAUX_NORMAL,
  tauxPropose,
  estPerissable,
  libelleCategorieArticle,
  ordreCategorie,
  libelleMouvement,
  motifObligatoire,
  quantiteSignee,
  stockApres,
  formatQuantite,
  refusMouvement,
  MESSAGE_MOTIF_REQUIS,
  ecartInventaire,
  ajustementsInventaire,
  motifInventaire,
  margeArticle,
  valeurStock,
  sousLeSeuil,
  validerChampsArticle,
  normaliserReference,
  normaliserCodeBarres,
  lireNombre,
  urlPhotoArticle,
} from "@/src/lib/boutiqueLogique";

describe("taux de TVA proposé par la catégorie", () => {
  it("2,6 % pour l'alimentation, les friandises et la litière", () => {
    expect(tauxPropose("alimentation")).toBe(2.6);
    expect(tauxPropose("friandises")).toBe(2.6);
    expect(tauxPropose("litiere")).toBe(2.6);
    expect(TAUX_REDUIT).toBe(2.6);
  });

  it("8,1 % pour tout le reste", () => {
    for (const c of ["colliers", "laisses", "harnais", "muselieres", "longes", "jouets",
                     "peluches", "couchages", "soins", "medaillons_accessoires", "divers"]) {
      expect(tauxPropose(c)).toBe(8.1);
    }
    expect(TAUX_NORMAL).toBe(8.1);
  });

  it("retombe sur le taux normal pour une catégorie inconnue", () => {
    expect(tauxPropose("chapeaux")).toBe(8.1);
    expect(tauxPropose(null)).toBe(8.1);
  });

  it("les quatorze catégories du modèle sont là, en français accentué", () => {
    expect(CATEGORIES_ARTICLE).toHaveLength(14);
    expect(libelleCategorieArticle("litiere")).toBe("Litière");
    expect(libelleCategorieArticle("colliers")).toBe("Colliers");
    expect(libelleCategorieArticle("laisses")).toBe("Laisses");
    expect(libelleCategorieArticle("harnais")).toBe("Harnais");
    expect(libelleCategorieArticle("muselieres")).toBe("Muselières");
    expect(libelleCategorieArticle("longes")).toBe("Longes");
    expect(libelleCategorieArticle("medaillons_accessoires")).toBe("Médaillons et accessoires");
    expect(libelleCategorieArticle(null)).toBe("—");
    // L'ancien fourre-tout n'existe plus.
    expect(CATEGORIES_ARTICLE.some((c) => c.valeur === ("laisses_harnais" as never))).toBe(false);
  });

  it("suit l'ordre du magasin, pas l'alphabet", () => {
    expect(CATEGORIES_ARTICLE.map((c) => c.valeur)).toEqual([
      "alimentation", "friandises", "litiere",
      "colliers", "laisses", "harnais", "muselieres", "longes",
      "jouets", "peluches", "couchages", "soins", "medaillons_accessoires", "divers",
    ]);
    // Un rang par catégorie, et le dernier rang pour une valeur inconnue.
    expect(ordreCategorie("alimentation")).toBe(0);
    expect(ordreCategorie("colliers")).toBeLessThan(ordreCategorie("jouets"));
    expect(ordreCategorie("harnais")).toBeLessThan(ordreCategorie("divers"));
    expect(ordreCategorie("chapeaux")).toBe(CATEGORIES_ARTICLE.length);
  });

  it("seules les denrées se périment", () => {
    expect(estPerissable("alimentation")).toBe(true);
    expect(estPerissable("friandises")).toBe(true);
    expect(estPerissable("jouets")).toBe(false);
  });
});

describe("stock après mouvement", () => {
  it("ajoute la quantité signée au stock", () => {
    expect(stockApres(12, 3)).toBe(15);
    expect(stockApres(12, -3)).toBe(9);
    expect(stockApres(0, 5)).toBe(5);
  });

  it("garde trois décimales, sans traîne de virgule flottante", () => {
    expect(stockApres(0.1, 0.2)).toBe(0.3);
    expect(stockApres(1.005, 0.001)).toBe(1.006);
  });

  it("c'est le type qui donne le sens, pas la saisie", () => {
    expect(quantiteSignee("entree", 5)).toBe(5);
    expect(quantiteSignee("retour", 5)).toBe(5);
    expect(quantiteSignee("vente", 5)).toBe(-5);
    expect(quantiteSignee("perte", 5)).toBe(-5);
    expect(quantiteSignee("usage_interne", 5)).toBe(-5);
    // Même une quantité saisie négative ressort dans le bon sens.
    expect(quantiteSignee("vente", -5)).toBe(-5);
    expect(quantiteSignee("entree", -5)).toBe(5);
  });

  it("écrit les quantités comme on les dit", () => {
    expect(formatQuantite(12)).toBe("12");
    expect(formatQuantite(12.5)).toBe("12.5");
    expect(formatQuantite("3")).toBe("3");
    expect(formatQuantite(null)).toBe("0");
  });

  it("nomme chaque type de mouvement", () => {
    expect(libelleMouvement("entree")).toBe("Entrée");
    expect(libelleMouvement("perte")).toBe("Perte / casse");
    expect(libelleMouvement("ajustement")).toBe("Ajustement d'inventaire");
    expect(libelleMouvement("inconnu")).toBe("—");
  });
});

describe("aucun stock négatif silencieux", () => {
  it("accepte une sortie couverte par le stock", () => {
    expect(refusMouvement({ type: "vente", quantite: -3, stockActuel: 12 })).toBeNull();
    expect(refusMouvement({ type: "vente", quantite: -12, stockActuel: 12 })).toBeNull();
  });

  it("refuse la sortie qui passerait sous zéro, et dit ce qu'il reste", () => {
    const refus = refusMouvement({ type: "vente", quantite: -20, stockActuel: 12 });
    expect(refus).toBe(
      "Stock insuffisant : il reste 12 en stock, la sortie demandée est de 20."
    );
  });

  it("refuse aussi une perte ou un usage interne excessifs", () => {
    expect(
      refusMouvement({ type: "perte", quantite: -5, stockActuel: 2, motif: "Casse" })
    ).toMatch(/^Stock insuffisant/);
    expect(
      refusMouvement({ type: "usage_interne", quantite: -5, stockActuel: 0, motif: "Chenil" })
    ).toMatch(/^Stock insuffisant/);
  });

  it("l'ajustement d'inventaire fait foi : lui n'est jamais refusé pour cela", () => {
    expect(
      refusMouvement({ type: "ajustement", quantite: -20, stockActuel: 12, motif: "Inventaire" })
    ).toBeNull();
  });

  it("exige le motif de l'ajustement, de la perte et de l'usage interne", () => {
    expect(refusMouvement({ type: "ajustement", quantite: -1, stockActuel: 10 })).toBe(MESSAGE_MOTIF_REQUIS);
    expect(refusMouvement({ type: "perte", quantite: -1, stockActuel: 10, motif: "  " })).toBe(MESSAGE_MOTIF_REQUIS);
    expect(refusMouvement({ type: "usage_interne", quantite: -1, stockActuel: 10 })).toBe(MESSAGE_MOTIF_REQUIS);
    // L'entrée, la vente et le retour n'ont rien à justifier.
    expect(motifObligatoire("entree")).toBe(false);
    expect(refusMouvement({ type: "entree", quantite: 1, stockActuel: 0 })).toBeNull();
  });

  it("refuse une quantité nulle ou illisible", () => {
    expect(refusMouvement({ type: "entree", quantite: 0, stockActuel: 5 })).toBe(
      "Indiquez une quantité différente de zéro."
    );
    expect(refusMouvement({ type: "entree", quantite: Number("abc"), stockActuel: 5 })).toBe(
      "Indiquez une quantité différente de zéro."
    );
  });

  it("aucun message ne cite une contrainte SQL", () => {
    const messages = [
      refusMouvement({ type: "vente", quantite: -20, stockActuel: 12 }),
      refusMouvement({ type: "perte", quantite: -1, stockActuel: 10 }),
    ];
    for (const m of messages) expect(m).not.toMatch(/violates|constraint|relation|mouvements_/);
  });
});

describe("écart d'inventaire", () => {
  it("compté moins théorique", () => {
    expect(ecartInventaire(12, 10)).toBe(-2);
    expect(ecartInventaire(12, 14)).toBe(2);
    expect(ecartInventaire(12, 12)).toBe(0);
    expect(ecartInventaire(0, 3)).toBe(3);
  });

  it("un ajustement par écart, et rien pour une ligne juste", () => {
    const ajustements = ajustementsInventaire([
      { article_id: "a", stock_theorique: 12, stock_compte: 10 },
      { article_id: "b", stock_theorique: 5, stock_compte: 5 },
      { article_id: "c", stock_theorique: 0, stock_compte: 3 },
    ]);
    expect(ajustements).toEqual([
      { article_id: "a", quantite: -2, stock_compte: 10 },
      { article_id: "c", quantite: 3, stock_compte: 3 },
    ]);
  });

  it("une ligne non comptée n'est pas une perte : elle ne produit rien", () => {
    expect(
      ajustementsInventaire([
        { article_id: "a", stock_theorique: 12, stock_compte: null },
        { article_id: "b", stock_theorique: 4, stock_compte: -1 },
      ])
    ).toEqual([]);
  });

  it("le motif commun porte la date de l'inventaire", () => {
    expect(motifInventaire("2026-09-07")).toBe("Inventaire du 07.09.2026");
    expect(motifInventaire("2026-09-07T10:00:00Z")).toBe("Inventaire du 07.09.2026");
  });
});

describe("marge, valeur du stock et seuil", () => {
  it("marge sur le prix d'achat, en francs et en pour-cent", () => {
    expect(margeArticle(24, 15)).toEqual({ montant: 9, pourcentage: 60 });
    expect(margeArticle(10, 12)).toEqual({ montant: -2, pourcentage: -16.7 });
  });

  it("pas de prix d'achat, pas de marge affichée", () => {
    expect(margeArticle(24, null)).toBeNull();
    expect(margeArticle(24, 0)).toBeNull();
    expect(margeArticle(null, 15)).toBeNull();
  });

  it("valeur du stock au prix d'achat", () => {
    expect(
      valeurStock([
        { stock_actuel: 10, prix_achat: 3.5 },
        { stock_actuel: "4", prix_achat: "2" },
        { stock_actuel: 6, prix_achat: null },
      ])
    ).toBe(43);
    expect(valeurStock([])).toBe(0);
  });

  it("sous le seuil : au niveau d'alerte ou en dessous", () => {
    expect(sousLeSeuil({ stock_actuel: 2, stock_alerte: 3 })).toBe(true);
    expect(sousLeSeuil({ stock_actuel: 3, stock_alerte: 3 })).toBe(true);
    expect(sousLeSeuil({ stock_actuel: 4, stock_alerte: 3 })).toBe(false);
    // Sans seuil, pas d'alerte — sinon tout le catalogue clignoterait.
    expect(sousLeSeuil({ stock_actuel: 0, stock_alerte: 0 })).toBe(false);
    expect(sousLeSeuil({ stock_actuel: 0, stock_alerte: null })).toBe(false);
  });
});

describe("saisie d'un article", () => {
  const complet = {
    nom: "Croquettes agneau 12 kg",
    categorie: "alimentation",
    taux_tva: 2.6,
    prix_vente: 79.9,
    prix_achat: 52,
    stock_alerte: 2,
  };

  it("accepte une fiche complète", () => {
    expect(validerChampsArticle(complet)).toBeNull();
  });

  it("désigne le champ fautif", () => {
    expect(validerChampsArticle({ ...complet, nom: "  " })).toMatchObject({ champ: "nom" });
    expect(validerChampsArticle({ ...complet, categorie: "chapeaux" })).toMatchObject({ champ: "categorie" });
    expect(validerChampsArticle({ ...complet, taux_tva: 120 })).toMatchObject({ champ: "taux_tva" });
    expect(validerChampsArticle({ ...complet, prix_vente: -1 })).toMatchObject({ champ: "prix_vente" });
    expect(validerChampsArticle({ ...complet, prix_achat: -1 })).toMatchObject({ champ: "prix_achat" });
    expect(validerChampsArticle({ ...complet, stock_alerte: -1 })).toMatchObject({ champ: "stock_alerte" });
  });

  it("le prix d'achat et le seuil restent facultatifs", () => {
    expect(validerChampsArticle({ ...complet, prix_achat: null, stock_alerte: null })).toBeNull();
  });

  it("le prix de vente à zéro est accepté, le prix manquant non", () => {
    expect(validerChampsArticle({ ...complet, prix_vente: 0 })).toBeNull();
    expect(validerChampsArticle({ ...complet, prix_vente: null })).toMatchObject({ champ: "prix_vente" });
  });

  it("normalise la référence et le code-barres", () => {
    expect(normaliserReference("  art-0007 ")).toBe("ART-0007");
    expect(normaliserReference("   ")).toBeNull();
    expect(normaliserCodeBarres(" 7612345678901 ")).toBe("7612345678901");
    expect(normaliserCodeBarres("")).toBeNull();
  });

  it("lit un nombre saisi à la virgule suisse", () => {
    expect(lireNombre("79,90")).toBe(79.9);
    expect(lireNombre("12")).toBe(12);
    expect(lireNombre("")).toBeNull();
    expect(lireNombre("douze")).toBeNull();
  });
});

describe("photo de la vitrine", () => {
  it("compose une URL publique stable à partir du chemin", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://exemple.supabase.co";
    expect(urlPhotoArticle("abc/1.jpg")).toBe(
      "https://exemple.supabase.co/storage/v1/object/public/boutique-photos/abc/1.jpg"
    );
  });

  it("laisse passer une URL déjà complète, et rien pour un chemin vide", () => {
    expect(urlPhotoArticle("https://ailleurs/photo.jpg")).toBe("https://ailleurs/photo.jpg");
    expect(urlPhotoArticle(null)).toBeNull();
    expect(urlPhotoArticle("  ")).toBeNull();
  });
});
