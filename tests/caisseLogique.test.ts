import { describe, it, expect } from "vitest";
import {
  MODES_CAISSE,
  libelleModeVente,
  compteEncaissement,
  ligneDepuisArticle,
  changerQuantite,
  totalPanier,
  refusPanier,
  encaissementVente,
  rendreMonnaie,
  lignesEcritureVente,
  resteARendre,
  arrondiRetour,
  compteArrondiPour,
  construireRetour,
  retourTotal,
  lireMontant,
  COMPTE_CAISSE,
  COMPTE_BANQUE,
  COMPTE_VENTES_BOUTIQUE,
  type ArticleVendable,
  type LigneVendue,
} from "@/src/lib/caisseLogique";

const croquettes: ArticleVendable = {
  id: "a1",
  nom: "Croquettes agneau 12 kg",
  reference: "ART-0001",
  code_barres: "7612345000001",
  prix_vente: 79.9,
  taux_tva: 2.6,
  stock_actuel: 5,
  unite: "sac",
};

const balle: ArticleVendable = {
  id: "a2",
  nom: "Balle rebondissante",
  reference: "ART-0002",
  code_barres: null,
  prix_vente: 12.5,
  taux_tva: 8.1,
  stock_actuel: 3,
  unite: "pièce",
};

describe("panier", () => {
  it("fige le libellé, le prix et le taux au moment de la vente", () => {
    const ligne = ligneDepuisArticle(croquettes, 2);
    expect(ligne).toMatchObject({
      article_id: "a1",
      libelle: "Croquettes agneau 12 kg",
      quantite: 2,
      prix_unitaire: 79.9,
      taux_tva: 2.6,
      montant: 159.8,
    });

    // L'article change de nom et de prix : la ligne déjà au panier ne bouge pas.
    const apres = { ...croquettes, nom: "Croquettes agneau (nouveau)", prix_vente: 99 };
    expect(ligne.libelle).toBe("Croquettes agneau 12 kg");
    expect(ligne.prix_unitaire).toBe(79.9);
    expect(ligneDepuisArticle(apres, 2).prix_unitaire).toBe(99);
  });

  it("change la quantité sans jamais toucher au prix", () => {
    const ligne = changerQuantite(ligneDepuisArticle(croquettes), 3);
    expect(ligne.quantite).toBe(3);
    expect(ligne.prix_unitaire).toBe(79.9);
    expect(ligne.montant).toBe(239.7);
  });

  it("totalise le panier au centime", () => {
    const panier = [ligneDepuisArticle(croquettes, 2), ligneDepuisArticle(balle, 3)];
    expect(totalPanier(panier)).toBe(197.3);
    expect(totalPanier([])).toBe(0);
  });

  it("refuse un panier vide ou à zéro", () => {
    expect(refusPanier([])).toBe("Le panier est vide.");
    const gratuit = ligneDepuisArticle({ ...balle, prix_vente: 0 }, 1);
    expect(refusPanier([gratuit])).toBe("Le total du panier doit être supérieur à zéro.");
  });

  it("on ne vend pas ce qu'on n'a pas", () => {
    const trop = ligneDepuisArticle(balle, 5); // stock : 3
    expect(refusPanier([trop])).toBe(
      "Stock insuffisant pour « Balle rebondissante » : il en reste 3, vous en vendez 5."
    );
    // Vendre tout le stock reste possible.
    expect(refusPanier([ligneDepuisArticle(balle, 3)])).toBeNull();
  });

  it("aucun message ne cite une contrainte SQL", () => {
    const messages = [refusPanier([]), refusPanier([ligneDepuisArticle(balle, 9)])];
    for (const m of messages) expect(m).not.toMatch(/violates|constraint|relation|ventes_/);
  });
});

describe("arrondi des espèces et rendu de monnaie", () => {
  it("arrondit aux 5 centimes, et seulement en espèces", () => {
    expect(encaissementVente(79.92, "especes")).toEqual({ total: 79.92, aRegler: 79.9, arrondi: -0.02 });
    expect(encaissementVente(79.93, "especes")).toEqual({ total: 79.93, aRegler: 79.95, arrondi: 0.02 });
    expect(encaissementVente(79.92, "carte")).toEqual({ total: 79.92, aRegler: 79.92, arrondi: 0 });
    expect(encaissementVente(79.92, "twint")).toEqual({ total: 79.92, aRegler: 79.92, arrondi: 0 });
    expect(encaissementVente(79.92, "facture_client")).toEqual({ total: 79.92, aRegler: 79.92, arrondi: 0 });
  });

  it("un total déjà rond ne bouge pas", () => {
    expect(encaissementVente(25, "especes")).toEqual({ total: 25, aRegler: 25, arrondi: 0 });
    expect(encaissementVente(12.45, "especes")).toEqual({ total: 12.45, aRegler: 12.45, arrondi: 0 });
  });

  it("rend la monnaie, et rien tant que le compte n'y est pas", () => {
    expect(rendreMonnaie(45.5, 50)).toBe(4.5);
    expect(rendreMonnaie(45.5, 45.5)).toBe(0);
    expect(rendreMonnaie(45.5, 40)).toBeNull();
    expect(rendreMonnaie(45.5, null)).toBeNull();
    expect(rendreMonnaie(45.5, Number("abc"))).toBeNull();
  });

  it("lit un montant tapé à la virgule suisse", () => {
    expect(lireMontant("50,00")).toBe(50);
    expect(lireMontant("50")).toBe(50);
    expect(lireMontant("")).toBeNull();
    expect(lireMontant("cinquante")).toBeNull();
  });
});

describe("écriture d'une vente", () => {
  it("espèces : débit 1000, crédit 3200", () => {
    expect(lignesEcritureVente({ totalLignes: 25, arrondi: 0, mode: "especes" })).toEqual([
      { compte: COMPTE_CAISSE, debit: 25, credit: 0 },
      { compte: COMPTE_VENTES_BOUTIQUE, debit: 0, credit: 25 },
    ]);
  });

  it("carte et TWINT : débit 1020", () => {
    expect(compteEncaissement("carte")).toBe(COMPTE_BANQUE);
    expect(compteEncaissement("twint")).toBe(COMPTE_BANQUE);
    expect(lignesEcritureVente({ totalLignes: 12.5, mode: "carte" })).toEqual([
      { compte: COMPTE_BANQUE, debit: 12.5, credit: 0 },
      { compte: COMPTE_VENTES_BOUTIQUE, debit: 0, credit: 12.5 },
    ]);
  });

  it("l'arrondi en notre faveur va au crédit de 3800", () => {
    const lignes = lignesEcritureVente({ totalLignes: 79.93, arrondi: 0.02, mode: "especes" });
    expect(lignes).toContainEqual({ compte: "1000", debit: 79.95, credit: 0 });
    expect(lignes).toContainEqual({ compte: "3200", debit: 0, credit: 79.93 });
    expect(lignes).toContainEqual({ compte: "3800", debit: 0, credit: 0.02 });
  });

  it("l'arrondi à notre charge va au débit de 6940", () => {
    const lignes = lignesEcritureVente({ totalLignes: 79.92, arrondi: -0.02, mode: "especes" });
    expect(lignes).toContainEqual({ compte: "1000", debit: 79.9, credit: 0 });
    expect(lignes).toContainEqual({ compte: "3200", debit: 0, credit: 79.92 });
    expect(lignes).toContainEqual({ compte: "6940", debit: 0.02, credit: 0 });
  });

  it("l'écriture est toujours équilibrée, quel que soit l'arrondi", () => {
    for (const total of [25, 79.92, 79.93, 12.51, 1000.04]) {
      for (const mode of ["especes", "carte", "twint"]) {
        const { arrondi } = encaissementVente(total, mode);
        const lignes = lignesEcritureVente({ totalLignes: total, arrondi, mode });
        const debit = lignes.reduce((s, l) => s + l.debit, 0);
        const credit = lignes.reduce((s, l) => s + l.credit, 0);
        expect(Math.round((debit - credit) * 100) / 100).toBe(0);
      }
    }
  });

  it("« sur la facture du client » ne touche aucune trésorerie", () => {
    expect(compteEncaissement("facture_client")).toBeNull();
    expect(lignesEcritureVente({ totalLignes: 25, mode: "facture_client" })).toEqual([]);
  });

  it("un retour renverse les sens sans autre calcul", () => {
    const lignes = lignesEcritureVente({ totalLignes: -12.5, arrondi: 0, mode: "especes" });
    expect(lignes).toContainEqual({ compte: "3200", debit: 12.5, credit: 0 });
    expect(lignes).toContainEqual({ compte: "1000", debit: 0, credit: 12.5 });
  });

  it("les quatre modes sont nommés en français", () => {
    expect(MODES_CAISSE).toHaveLength(4);
    expect(libelleModeVente("especes")).toBe("Espèces");
    expect(libelleModeVente("facture_client")).toBe("Sur la facture du client");
    expect(libelleModeVente("bitcoin")).toBe("—");
  });
});

describe("retour partiel", () => {
  const lignesVente: LigneVendue[] = [
    { id: "l1", article_id: "a1", libelle: "Croquettes agneau 12 kg", quantite: 2, prix_unitaire: 79.9, taux_tva: 2.6, montant: 159.8 },
    { id: "l2", article_id: "a2", libelle: "Balle rebondissante", quantite: 3, prix_unitaire: 12.5, taux_tva: 8.1, montant: 37.5 },
  ];

  it("rend une partie, au prix de la vente et non à celui d'aujourd'hui", () => {
    const retour = construireRetour(lignesVente, { l1: 1 });
    expect(retour.lignes).toEqual([
      // Le retour reprend AUSSI le secteur de la ligne vendue : il servira
      // au décompte TVA, et un retour se ventile comme la vente qu'il corrige.
      {
        article_id: "a1", libelle: "Croquettes agneau 12 kg", quantite: -1,
        prix_unitaire: 79.9, taux_tva: 2.6, motif_tva: null, secteur_tdfn: "commerce",
        montant: -79.9,
        // Aucune remise sur la vente d'origine : le retour n'en invente pas.
        prix_base: null, remise_pourcentage: null, remise_origine: null, remise_libelle: null,
      },
    ]);
    expect(retour.total).toBe(-79.9);
  });

  it("ne rend jamais plus que ce qui a été vendu", () => {
    const retour = construireRetour(lignesVente, { l2: 10 });
    expect(retour.lignes[0].quantite).toBe(-3);
    expect(retour.total).toBe(-37.5);
  });

  it("tient compte de ce qui a déjà été rendu", () => {
    const deja = [{ article_id: "a1", libelle: "Croquettes agneau 12 kg", quantite: -1 }];
    expect(resteARendre(lignesVente, deja)).toEqual({ l1: 1, l2: 3 });

    const retour = construireRetour(lignesVente, { l1: 2 }, deja);
    expect(retour.lignes[0].quantite).toBe(-1);
  });

  it("ignore une ligne à zéro ou déjà entièrement rendue", () => {
    const deja = [{ article_id: "a2", libelle: "Balle rebondissante", quantite: -3 }];
    expect(construireRetour(lignesVente, { l2: 1 }, deja).lignes).toEqual([]);
    expect(construireRetour(lignesVente, { l1: 0 }).lignes).toEqual([]);
  });

  it("dit si la vente est entièrement rendue", () => {
    expect(retourTotal(lignesVente, construireRetour(lignesVente, { l1: 1 }))).toBe(false);
    expect(retourTotal(lignesVente, construireRetour(lignesVente, { l1: 2, l2: 3 }))).toBe(true);

    // En deux fois : le second retour solde la vente.
    const premier = construireRetour(lignesVente, { l1: 2 });
    const deja = premier.lignes.map((l) => ({ article_id: l.article_id, libelle: l.libelle, quantite: l.quantite }));
    const second = construireRetour(lignesVente, { l2: 3 }, deja);
    expect(retourTotal(lignesVente, second, deja)).toBe(true);
  });
});

describe("arrondi d'un retour", () => {
  // Vente de 19.93 encaissée 19.95 en espèces (arrondi +0.02).
  const encaisseOrigine = 19.95;

  it("un remboursement partiel en espèces tombe sur 5 centimes", () => {
    expect(arrondiRetour({
      totalRetour: -12.51, mode: "especes",
      encaisseOrigine, dejaRembourse: 0, estTotal: false,
    })).toBe(0.01); // on rend 12.50 pour 12.51 de marchandise
  });

  it("le dernier retour rend exactement ce qui avait été encaissé", () => {
    // 12.50 déjà rendus : il reste 7.45 à rendre pour 7.42 de marchandise.
    expect(arrondiRetour({
      totalRetour: -7.42, mode: "especes",
      encaisseOrigine, dejaRembourse: -12.5, estTotal: true,
    })).toBe(-0.03);
  });

  it("une vente rendue d'un coup se renverse au centime près", () => {
    expect(arrondiRetour({
      totalRetour: -19.93, mode: "especes",
      encaisseOrigine, dejaRembourse: 0, estTotal: true,
    })).toBe(-0.02);
  });

  it("hors espèces, aucun arrondi", () => {
    for (const mode of ["carte", "twint", "facture_client"]) {
      expect(arrondiRetour({
        totalRetour: -12.51, mode, encaisseOrigine: 12.51, dejaRembourse: 0, estTotal: true,
      })).toBe(0);
    }
  });

  it("la caisse revient à zéro quand tout est rendu, et les écarts s'annulent", () => {
    const compteEcart = compteArrondiPour(0.02); // celui de la vente

    const vente = lignesEcritureVente({ totalLignes: 19.93, arrondi: 0.02, mode: "especes" });
    const retour1 = lignesEcritureVente({
      totalLignes: -12.51, arrondi: 0.01, mode: "especes", compteArrondi: compteEcart,
    });
    const retour2 = lignesEcritureVente({
      totalLignes: -7.42, arrondi: -0.03, mode: "especes", compteArrondi: compteEcart,
    });

    const soldes: Record<string, number> = {};
    for (const l of [...vente, ...retour1, ...retour2]) {
      soldes[l.compte] = Math.round(((soldes[l.compte] ?? 0) + l.debit - l.credit) * 100) / 100;
    }
    expect(soldes["1000"]).toBe(0);
    expect(soldes["3200"]).toBe(0);
    expect(soldes["3800"]).toBe(0);
    expect(soldes["6940"] ?? 0).toBe(0);
  });

  it("un écart de retour repasse par le compte de la vente, pas par un autre", () => {
    // Sans indication, le sens choisirait 6940 ; en renversement, c'est 3800.
    const parDefaut = lignesEcritureVente({ totalLignes: -7.42, arrondi: -0.03, mode: "especes" });
    expect(parDefaut).toContainEqual({ compte: "6940", debit: 0.03, credit: 0 });

    const renverse = lignesEcritureVente({
      totalLignes: -7.42, arrondi: -0.03, mode: "especes", compteArrondi: "3800",
    });
    expect(renverse).toContainEqual({ compte: "3800", debit: 0.03, credit: 0 });
    expect(renverse.some((l) => l.compte === "6940")).toBe(false);
  });

  it("choisit le compte d'écart selon le signe", () => {
    expect(compteArrondiPour(0.02)).toBe("3800");
    expect(compteArrondiPour(-0.02)).toBe("6940");
  });
});
