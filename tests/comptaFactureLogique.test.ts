import { describe, it, expect } from "vitest";
import {
  cibleFacture,
  calculerLignesFacture,
  arrondirEspeces,
  compteLiquidite,
  type FactureCompta,
} from "../src/lib/comptaFactureLogique";

const somme = (l: { debit: number; credit: number }[]) =>
  (Math.round((l.reduce((s, x) => s + x.debit - x.credit, 0)) * 100) / 100) + 0 || 0;

const parCompte = (l: { compte: string; debit: number; credit: number }[]) =>
  Object.fromEntries(l.map((x) => [x.compte, x]));

const FACTURE: FactureCompta = {
  type: "facture",
  emise: true,
  statut: "envoyee",
  lignes: [
    { compte_produit: "3000", montant: 200 },
    { compte_produit: "3010", montant: 50 },
  ],
  paiements: [],
  acomptesImputes: 0,
};

describe("facture émise : reconnaissance du produit", () => {
  it("D 1100 pour le total, C chaque compte de produit", () => {
    expect(cibleFacture(FACTURE)).toEqual({ "1100": 250, "3000": -200, "3010": -50 });
  });

  it("l'écriture est équilibrée", () => {
    expect(somme(calculerLignesFacture(FACTURE, []))).toBe(0);
  });

  it("un brouillon ne produit aucune écriture", () => {
    expect(cibleFacture({ ...FACTURE, emise: false })).toEqual({});
  });

  it("une facture annulée non plus", () => {
    expect(cibleFacture({ ...FACTURE, statut: "annulee" })).toEqual({});
  });

  it("deux lignes sur le même compte sont regroupées", () => {
    const f = { ...FACTURE, lignes: [
      { compte_produit: "3000", montant: 100 },
      { compte_produit: "3000", montant: 40 },
    ] };
    expect(cibleFacture(f)).toEqual({ "1100": 140, "3000": -140 });
  });

  it("sans compte de produit, la ligne tombe en 3000", () => {
    const f = { ...FACTURE, lignes: [{ montant: 80 }] };
    expect(cibleFacture(f)).toEqual({ "1100": 80, "3000": -80 });
  });
});

describe("imputation des acomptes", () => {
  it("l'acompte bascule de 2030 vers 1100", () => {
    const f = { ...FACTURE, acomptesImputes: 100 };
    expect(cibleFacture(f)).toEqual({ "1100": 150, "2030": 100, "3000": -200, "3010": -50 });
  });

  it("un acompte couvrant tout laisse un débiteur nul", () => {
    const f = { ...FACTURE, acomptesImputes: 250 };
    expect(cibleFacture(f)["1100"]).toBeUndefined();
  });

  it("l'écriture reste équilibrée avec acompte", () => {
    expect(somme(calculerLignesFacture({ ...FACTURE, acomptesImputes: 100 }, []))).toBe(0);
  });
});

describe("encaissements", () => {
  it("un paiement complet solde le débiteur", () => {
    const f = { ...FACTURE, paiements: [{ mode: "virement", montant: 250 }] };
    expect(cibleFacture(f)).toEqual({ "1020": 250, "3000": -200, "3010": -50 });
  });

  it("paiement partiel : le débiteur garde le reste", () => {
    const f = { ...FACTURE, paiements: [{ mode: "cash", montant: 100 }] };
    expect(cibleFacture(f)).toEqual({ "1000": 100, "1100": 150, "3000": -200, "3010": -50 });
  });

  it("chaque mode tombe sur son compte", () => {
    expect(compteLiquidite("cash")).toBe("1000");
    expect(compteLiquidite("virement")).toBe("1020");
    expect(compteLiquidite("twint")).toBe("1021");
    expect(compteLiquidite("carte")).toBe("1021");
    expect(compteLiquidite("avoir")).toBe("2035");
    expect(compteLiquidite("inconnu")).toBeNull();
  });

  it("un mode inconnu est ignoré, jamais deviné", () => {
    const f = { ...FACTURE, paiements: [{ mode: "bitcoin", montant: 250 }] };
    expect(cibleFacture(f)["1100"]).toBe(250);
  });

  it("payer par avoir débite le 2035", () => {
    const f = { ...FACTURE, paiements: [{ mode: "avoir", montant: 250 }] };
    expect(cibleFacture(f)["2035"]).toBe(250);
  });
});

describe("arrondi des espèces", () => {
  it("arrondit aux 5 centimes", () => {
    expect(arrondirEspeces(10.02)).toEqual({ encaisse: 10, arrondi: -0.02 });
    expect(arrondirEspeces(10.03)).toEqual({ encaisse: 10.05, arrondi: 0.02 });
    expect(arrondirEspeces(10.05)).toEqual({ encaisse: 10.05, arrondi: 0 });
    expect(arrondirEspeces(249.99)).toEqual({ encaisse: 250, arrondi: 0.01 });
  });

  it("désactivé, ne touche à rien", () => {
    expect(arrondirEspeces(10.02, false)).toEqual({ encaisse: 10.02, arrondi: 0 });
  });

  it("un manque part en charge (6940)", () => {
    const f = { ...FACTURE, lignes: [{ compte_produit: "3000", montant: 10.02 }],
      paiements: [{ mode: "cash", montant: 10.02, arrondi: -0.02 }] };
    const c = cibleFacture(f);
    expect(c["1000"]).toBe(10);
    expect(c["6940"]).toBe(0.02);
    expect(c["1100"]).toBeUndefined();
  });

  it("un excédent part en produit (3800)", () => {
    const f = { ...FACTURE, lignes: [{ compte_produit: "3000", montant: 10.03 }],
      paiements: [{ mode: "cash", montant: 10.03, arrondi: 0.02 }] };
    const c = cibleFacture(f);
    expect(c["1000"]).toBe(10.05);
    expect(c["3800"]).toBe(-0.02);
  });

  it("l'écriture avec arrondi reste équilibrée", () => {
    for (const a of [-0.02, 0.03, -0.01, 0.04]) {
      const f = { ...FACTURE, lignes: [{ compte_produit: "3000", montant: 100 }],
        paiements: [{ mode: "cash", montant: 100, arrondi: a }] };
      expect(somme(calculerLignesFacture(f, []))).toBe(0);
    }
  });
});

describe("facture d'acompte", () => {
  const acompte: FactureCompta = {
    type: "acompte", emise: true, statut: "envoyee",
    lignes: [{ compte_produit: "3000", montant: 100 }],
    paiements: [],
  };

  it("à l'émission : aucune écriture (l'acompte n'est pas un produit)", () => {
    expect(cibleFacture(acompte)).toEqual({});
  });

  it("à l'encaissement : D liquidité / C 2030", () => {
    const f = { ...acompte, paiements: [{ mode: "twint", montant: 100 }] };
    expect(cibleFacture(f)).toEqual({ "1021": 100, "2030": -100 });
  });
});

describe("avoir", () => {
  const base: FactureCompta = {
    type: "avoir", emise: true, statut: "envoyee",
    lignes: [{ compte_produit: "3000", montant: 60 }],
    paiements: [],
  };

  it("sur une facture DÉJÀ PAYÉE, porté au crédit : D 3000 / C 2035", () => {
    // Tout l'avoir devient un crédit utilisable : rien n'était plus dû.
    expect(cibleFacture({ ...base, montantCredite: 60 })).toEqual({ "3000": 60, "2035": -60 });
  });

  it("sur une facture IMPAYÉE : D 3000 / C 1100 — la dette s'efface", () => {
    // Rien n'est créditable : créditer donnerait un avoir ET laisserait la dette.
    expect(cibleFacture({ ...base, montantCredite: 0 })).toEqual({ "3000": 60, "1100": -60 });
  });

  it("sur une facture À MOITIÉ payée : la dette d'abord, le crédit ensuite", () => {
    // 30 restaient dus : 30 effacent la dette, 30 deviennent un crédit.
    expect(cibleFacture({ ...base, montantCredite: 30 })).toEqual({ "3000": 60, "1100": -30, "2035": -30 });
  });

  it("à rembourser : tout passe par le débiteur, le remboursement est un paiement négatif", () => {
    const f = { ...base, montantCredite: 0, paiements: [{ mode: "virement", montant: -60 }] };
    expect(cibleFacture(f)).toEqual({ "3000": 60, "1020": -60 });
  });

  it("la part créditée ne peut pas dépasser l'avoir", () => {
    expect(cibleFacture({ ...base, montantCredite: 200 })).toEqual({ "3000": 60, "2035": -60 });
  });

  it("tous les cas restent équilibrés", () => {
    for (const f of [
      { ...base, montantCredite: 60 },
      { ...base, montantCredite: 0 },
      { ...base, montantCredite: 30 },
      { ...base, montantCredite: 0, paiements: [{ mode: "virement", montant: -60 }] },
    ]) {
      expect(somme(calculerLignesFacture(f, []))).toBe(0);
    }
  });
});

describe("idempotence par delta", () => {
  it("rejouer sans changement ne passe rien", () => {
    const premier = calculerLignesFacture(FACTURE, []);
    const deja = premier.map((l) => ({ compte_numero: l.compte, debit: l.debit, credit: l.credit }));
    expect(calculerLignesFacture(FACTURE, deja)).toEqual([]);
  });

  it("un paiement qui arrive après l'émission ne passe que son delta", () => {
    const emission = calculerLignesFacture(FACTURE, []);
    const deja = emission.map((l) => ({ compte_numero: l.compte, debit: l.debit, credit: l.credit }));

    const apres = calculerLignesFacture(
      { ...FACTURE, paiements: [{ mode: "cash", montant: 250 }] },
      deja,
    );
    const c = parCompte(apres);
    expect(c["1000"]).toEqual({ compte: "1000", debit: 250, credit: 0 });
    expect(c["1100"]).toEqual({ compte: "1100", debit: 0, credit: 250 });
    expect(c["3000"]).toBeUndefined();
    expect(somme(apres)).toBe(0);
  });

  it("annuler une facture après coup contre-passe tout", () => {
    const emission = calculerLignesFacture(FACTURE, []);
    const deja = emission.map((l) => ({ compte_numero: l.compte, debit: l.debit, credit: l.credit }));

    const apres = calculerLignesFacture({ ...FACTURE, statut: "annulee" }, deja);
    const c = parCompte(apres);
    expect(c["1100"]).toEqual({ compte: "1100", debit: 0, credit: 250 });
    expect(c["3000"]).toEqual({ compte: "3000", debit: 200, credit: 0 });
    expect(somme(apres)).toBe(0);
  });

  it("l'émission puis la synchronisation donnent le même état (pas de doublon)", () => {
    // La RPC SQL pose l'écriture d'émission ; la synchronisation TS la relit et
    // ne doit rien ajouter tant que rien n'a bougé.
    const emission = [
      { compte_numero: "1100", debit: 250, credit: 0 },
      { compte_numero: "3000", debit: 0, credit: 200 },
      { compte_numero: "3010", debit: 0, credit: 50 },
    ];
    expect(calculerLignesFacture(FACTURE, emission)).toEqual([]);
  });
});
