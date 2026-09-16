import { describe, it, expect } from "vitest";
import {
  avertissementCouverture,
  bornesPeriode,
  calculerStatistiques,
  csvArticles,
  ligneRetenue,
  lireFiltresStatistiques,
  palmares,
  trier,
  type Filtres,
  type LigneStat,
} from "@/src/lib/statistiquesBoutiqueLogique";
import { estArticleDeRecette } from "@/src/lib/ficheDeRecette";

/** Les statistiques de la boutique : ce qui se vend, ce que cela rapporte. */

const F: Filtres = { du: "2026-09-01", au: "2026-09-30", canal: "tous", vendeuse: null };

let n = 0;
function ligne(p: Partial<LigneStat> = {}): LigneStat {
  n += 1;
  return {
    vente_id: `v${n}`, vente_origine_id: null, jour: "2026-09-10", canal: "comptoir", vendu_par: "u1",
    statut_vente: "finalisee", statut_origine: null, client_recette: false,
    article_id: "laisse", article_nom: "Laisse", article_categorie: "laisses", article_recette: false,
    quantite: 1, montant: 32.43, taux_tva: 8.1, cout_unitaire_fige: 15, remise_origine: null, libelle: "Laisse",
    ...p,
  };
}

describe("bornes de période (dates de Zurich, incluses)", () => {
  const jour = "2026-03-31";
  it("ce mois et le mois précédent, fin de mois comprise", () => {
    expect(bornesPeriode("mois", jour)).toEqual({ du: "2026-03-01", au: "2026-03-31" });
    expect(bornesPeriode("mois_precedent", jour)).toEqual({ du: "2026-02-01", au: "2026-02-28" });
    expect(bornesPeriode("mois_precedent", "2026-01-15")).toEqual({ du: "2025-12-01", au: "2025-12-31" });
    expect(bornesPeriode("mois", "2028-02-10")).toEqual({ du: "2028-02-01", au: "2028-02-29" });
  });

  it("3 et 12 mois glissants jusqu'à aujourd'hui", () => {
    expect(bornesPeriode("3_mois", "2026-09-16")).toEqual({ du: "2026-06-17", au: "2026-09-16" });
    expect(bornesPeriode("12_mois", "2026-09-16")).toEqual({ du: "2025-09-17", au: "2026-09-16" });
    // 31 mai − 3 mois = 28 février (pas de 31 février), puis le lendemain.
    expect(bornesPeriode("3_mois", "2026-05-31")).toEqual({ du: "2026-03-01", au: "2026-05-31" });
  });

  it("l'exercice est l'année civile", () => {
    expect(bornesPeriode("exercice", "2026-09-16")).toEqual({ du: "2026-01-01", au: "2026-12-31" });
  });

  it("dates libres : remises dans l'ordre, incomplètes → mois en cours", () => {
    expect(bornesPeriode("libre", jour, { du: "2026-03-20", au: "2026-03-05" })).toEqual({ du: "2026-03-05", au: "2026-03-20" });
    expect(bornesPeriode("libre", jour, { du: "2026-03-05" })).toEqual({ du: "2026-03-01", au: "2026-03-31" });
  });

  it("des filtres illisibles retombent sur les valeurs par défaut", () => {
    expect(lireFiltresStatistiques({ periode: "n'importe", canal: "boutique", vendeuse: "1 or 1=1" }, "2026-09-16"))
      .toEqual({ periode: "mois", du: "2026-09-01", au: "2026-09-30", canal: "tous", vendeuse: null });
  });

  it("une ligne du dernier jour est dedans, celle du lendemain dehors", () => {
    expect(ligneRetenue(ligne({ jour: "2026-09-30" }), F)).toBe(true);
    expect(ligneRetenue(ligne({ jour: "2026-10-01" }), F)).toBe(false);
    expect(ligneRetenue(ligne({ jour: "2026-08-31" }), F)).toBe(false);
  });
});

describe("ce qui compte", () => {
  it("les retours se déduisent de la vente", () => {
    const vente = ligne({ vente_id: "A", quantite: 3, montant: 97.29 });
    const retour = ligne({ vente_id: "R", vente_origine_id: "A", statut_origine: "finalisee", quantite: -1, montant: -32.43 });
    const s = calculerStatistiques([vente, retour], F);
    const laisse = s.articles.find((a) => a.cle === "laisse")!;
    expect(laisse.quantite).toBe(2);
    expect(laisse.caTtc).toBe(64.86);
    expect(laisse.cout).toBe(30);
    expect(s.totaux.nbVentes).toBe(1);
  });

  it("une vente entièrement rendue (annulée) est exclue, avec ses retours", () => {
    const vente = ligne({ vente_id: "A", statut_vente: "annulee" });
    const retour = ligne({ vente_id: "R", vente_origine_id: "A", statut_origine: "annulee", quantite: -1, montant: -32.43 });
    const s = calculerStatistiques([vente, retour], F);
    expect(s.totaux.caTtc).toBe(0);
    expect(s.totaux.nbVentes).toBe(0);
  });

  it("les ventes de recette sont exclues — client ou article « ZZ »", () => {
    const s = calculerStatistiques([
      ligne({ client_recette: true }),
      ligne({ article_id: "zz", article_nom: "ZZ contrôle", article_recette: true }),
      ligne(),
    ], F);
    expect(s.totaux.nbVentes).toBe(1);
    expect(estArticleDeRecette({ nom: "ZZ contrôle caisse — laisse" })).toBe(true);
    expect(estArticleDeRecette({ nom: "Laisse en cuir" })).toBe(false);
  });

  it("filtres canal et vendeuse", () => {
    const lignes = [ligne({ canal: "en_ligne", vendu_par: "u2" }), ligne()];
    expect(calculerStatistiques(lignes, { ...F, canal: "en_ligne" }).totaux.nbVentes).toBe(1);
    expect(calculerStatistiques(lignes, { ...F, vendeuse: "u1" }).totaux.nbVentes).toBe(1);
  });
});

describe("la marge et les lignes sans coût", () => {
  it("HT, coût, marge en francs et en pour cent", () => {
    const s = calculerStatistiques([ligne({ quantite: 2, montant: 64.86 })], F);
    const a = s.articles[0];
    expect(a.caHt).toBe(60);
    expect(a.cout).toBe(30);
    expect(a.marge).toBe(30);
    expect(a.margePct).toBe(50);
    expect(s.totaux.marge).toBe(30);
    expect(avertissementCouverture(s.couverture)).toBeNull();
  });

  it("une ligne sans coût est comptée à part, jamais à coût nul", () => {
    const s = calculerStatistiques([
      ligne({ quantite: 2, montant: 64.86 }),
      ligne({ montant: 10.81, cout_unitaire_fige: null }),
    ], F);
    const a = s.articles[0];
    expect(a.caHt).toBe(70);
    // La marge porte sur les 60 HT chiffrés, pas sur 70.
    expect(a.marge).toBe(30);
    expect(a.margePct).toBe(50);
    expect(a.lignesSansCout).toBe(1);
    expect(s.couverture).toEqual({ lignesSansCout: 1, lignesArticle: 2, pourcentage: 86 });
    expect(avertissementCouverture(s.couverture)).toBe("Marge calculée sur 86 % des ventes — 1 ligne sans coût renseigné");
  });

  it("aucune ligne chiffrée : pas de marge du tout, et on le dit", () => {
    const s = calculerStatistiques([ligne({ cout_unitaire_fige: null }), ligne({ cout_unitaire_fige: null })], F);
    expect(s.totaux.marge).toBeNull();
    expect(s.articles[0].marge).toBeNull();
    expect(avertissementCouverture(s.couverture)).toBe("Marge non calculable — 2 lignes sans coût renseigné");
  });

  it("port et remise membre comptent dans le CA, pas comme lignes sans coût", () => {
    const s = calculerStatistiques([
      ligne({ vente_id: "A" }),
      ligne({ vente_id: "A", article_id: null, libelle: "Frais de port", montant: 9, taux_tva: 0, cout_unitaire_fige: null }),
      ligne({ vente_id: "A", article_id: null, libelle: "Remise membre", montant: -3, taux_tva: 0, cout_unitaire_fige: null }),
    ], F);
    expect(s.totaux.caTtc).toBe(38.43);
    expect(s.couverture.lignesSansCout).toBe(0);
    expect(s.totaux.remiseMembre).toBe(3);
    expect(s.totaux.partMembres).toBe(100);
    expect(s.totaux.panierMoyen).toBe(38.43);
  });
});

describe("par article et par catégorie", () => {
  it("les deux vues agrègent les mêmes lignes", () => {
    const s = calculerStatistiques([
      ligne(),
      ligne({ article_id: "collier", article_nom: "Collier", article_categorie: "colliers", montant: 21.62, cout_unitaire_fige: 8 }),
      ligne({ article_id: "laisse2", article_nom: "Laisse longue", montant: 43.24, cout_unitaire_fige: 20 }),
    ], F);
    const laisses = s.categories.find((c) => c.cle === "laisses")!;
    expect(laisses.quantite).toBe(2);
    expect(laisses.caTtc).toBe(75.67);
    expect(laisses.cout).toBe(35);
    expect(s.categories.reduce((t, c) => t + c.caTtc, 0)).toBeCloseTo(s.totaux.caTtc, 2);
  });

  it("les articles sans vente apparaissent — « ne se vend pas »", () => {
    const s = calculerStatistiques([ligne()], F, [
      { id: "laisse", nom: "Laisse", categorie: "laisses" },
      { id: "panier", nom: "Panier", categorie: "couchages" },
    ]);
    const { sansVente, premiers } = palmares(s.articles);
    expect([...sansVente]).toEqual(["panier"]);
    expect([...premiers]).toEqual(["laisse"]);
  });

  it("dix premiers et dix derniers, sans doublon quand il y a moins de vingt articles", () => {
    const lignes = Array.from({ length: 15 }, (_, i) =>
      ligne({ article_id: `a${i}`, article_nom: `Article ${i}`, montant: 10 + i }));
    const { premiers, derniers } = palmares(calculerStatistiques(lignes, F).articles);
    expect(premiers.size).toBe(10);
    expect(derniers.size).toBe(5);
    expect(premiers.has("a14")).toBe(true);
    expect(derniers.has("a0")).toBe(true);
  });

  it("tri sur chaque colonne ; une marge inconnue va au fond", () => {
    const s = calculerStatistiques([
      ligne({ article_id: "b", article_nom: "B", montant: 50 }),
      ligne({ article_id: "a", article_nom: "A", montant: 20, cout_unitaire_fige: null }),
      ligne({ article_id: "c", article_nom: "C", montant: 30 }),
    ], F);
    expect(trier(s.articles, "caTtc", "desc").map((a) => a.cle)).toEqual(["b", "c", "a"]);
    expect(trier(s.articles, "libelle", "asc").map((a) => a.cle)).toEqual(["a", "b", "c"]);
    expect(trier(s.articles, "marge", "asc").map((a) => a.cle).at(-1)).toBe("a");
    expect(trier(s.articles, "marge", "desc").map((a) => a.cle).at(-1)).toBe("a");
  });

  it("export CSV point-virgule, avec BOM et guillemets quand il le faut", () => {
    const s = calculerStatistiques([ligne({ article_nom: "Laisse; « cuir »" })], F);
    const csv = csvArticles(s.articles, (c) => c ?? "");
    expect(csv.startsWith("﻿Article;Catégorie;Quantité;CA TTC;CA HT;Coût figé;Marge CHF;Marge %;Lignes sans coût")).toBe(true);
    expect(csv).toContain('"Laisse; « cuir »";laisses;1;32.43;30.00;15.00;15.00;50.0;0');
  });
});
