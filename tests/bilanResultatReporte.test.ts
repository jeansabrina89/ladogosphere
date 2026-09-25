import { describe, it, expect } from "vitest";
import { construireRapport, type CompteMeta, type EcritureBrute } from "@/src/lib/rapportsCompta";

/**
 * Le bilan doit tomber juste, même quand rien n'a été clôturé.
 *
 * Ce que le code faisait déjà, et qui est juste : le résultat de l'exercice LU
 * entre au passif tant qu'il n'est pas clôturé (`resultatAuBilan`).
 *
 * Ce qui manquait : le résultat des exercices ANTÉRIEURS restés ouverts. Une
 * clôture solde les comptes de résultat vers 2970, un compte de passif ; tant
 * qu'elle n'a pas eu lieu, ce résultat reste sur les charges et les produits,
 * hors du bilan, et l'actif ne répond plus au passif.
 *
 * C'est l'écart que Sabrina a vu : -7'942 sur l'exercice 2027, soit exactement
 * le résultat de 2026 — resté ouvert. Sur 2026 lui-même, le bilan tombait déjà
 * juste, et c'est pourquoi le diagnostic demandait d'être vérifié avant d'être
 * corrigé.
 *
 * Le calcul ne devine rien : le solde cumulé des comptes de résultat antérieurs
 * vaut zéro pour un exercice clos et le résultat pour un exercice ouvert. Le
 * double comptage est donc impossible — ce qui est passé par 2970 n'est plus là.
 */

const COMPTES: CompteMeta[] = [
  { numero: "1020", libelle: "Banque", type: "actif" },
  { numero: "2000", libelle: "Créanciers", type: "passif" },
  { numero: "2970", libelle: "Résultat reporté", type: "passif" },
  { numero: "3200", libelle: "Ventes", type: "produit" },
  { numero: "6000", libelle: "Charges", type: "charge" },
];

/** Une écriture à deux lignes, en partie double. */
const ecr = (
  date: string,
  debit: [string, number],
  credit: [string, number],
  pieceType: string | null = null,
): EcritureBrute => ({
  date_ecriture: date,
  libelle: `${debit[0]}/${credit[0]}`,
  piece_type: pieceType,
  ecritures_lignes: [
    { compte_numero: debit[0], debit: debit[1], credit: 0 },
    { compte_numero: credit[0], debit: 0, credit: credit[1] },
  ],
});

const rapport = (p: {
  annee: EcritureBrute[];
  anterieures?: EcritureBrute[];
  cloture?: boolean;
}) =>
  construireRapport({
    comptes: COMPTES,
    ecrituresAnnee: p.annee,
    ecrituresAnterieures: p.anterieures ?? [],
    exerciceCloture: p.cloture ?? false,
  });

describe("le bilan d'un exercice ouvert", () => {
  it("porte le résultat de l'exercice, et actif = passif", () => {
    // Une vente de 1000 encaissée, une charge de 300 payée : résultat +700.
    const rap = rapport({
      annee: [
        ecr("2026-03-01", ["1020", 1000], ["3200", 1000]),
        ecr("2026-04-01", ["6000", 300], ["1020", 300]),
      ],
    });

    expect(rap.resultat).toBe(700);
    expect(rap.resultatAuBilan).toBe(700);
    expect(rap.reportExercicesAnterieurs).toBe(0);
    expect(rap.totalActif).toBe(700);
    expect(rap.totalPassif, "le bilan ne tombe pas juste").toBe(rap.totalActif);
  });

  it("un résultat nul laisse le bilan juste, et rien à reporter", () => {
    const rap = rapport({
      annee: [
        ecr("2026-03-01", ["1020", 500], ["3200", 500]),
        ecr("2026-04-01", ["6000", 500], ["1020", 500]),
      ],
    });

    expect(rap.resultat).toBe(0);
    expect(rap.reportExercicesAnterieurs).toBe(0);
    expect(rap.totalActif).toBe(0);
    expect(rap.totalPassif).toBe(0);
  });
});

describe("un exercice antérieur resté OUVERT", () => {
  /** 2026 : vente 1058, charges 9000 → résultat -7942. Jamais clôturé. */
  const ANTERIEURES_OUVERTES: EcritureBrute[] = [
    ecr("2026-03-01", ["1020", 1058], ["3200", 1058]),
    ecr("2026-04-01", ["6000", 9000], ["1020", 9000]),
  ];

  it("son résultat est reporté au passif, et le bilan tombe juste", () => {
    // Le cas réel : sur 2027, l'écart valait -7942, soit le résultat de 2026.
    const rap = rapport({
      annee: [ecr("2027-02-01", ["1020", 170], ["3200", 170])],
      anterieures: ANTERIEURES_OUVERTES,
    });

    expect(rap.reportExercicesAnterieurs, "le résultat de 2026 n'est pas reporté").toBe(-7942);
    expect(rap.resultat).toBe(170);
    expect(rap.totalActif).toBe(-7772);
    expect(
      rap.totalPassif,
      "l'écart actif/passif vaut le résultat de l'exercice d'avant, resté ouvert",
    ).toBe(rap.totalActif);
    expect(rap.totalActif - rap.totalPassif).toBe(0);
  });
});

describe("un exercice antérieur CLÔTURÉ", () => {
  /**
   * La clôture solde les comptes de résultat vers 2970 : après elle, le solde
   * cumulé des charges et produits est nul, et 2970 porte le résultat.
   */
  const ANTERIEURES_CLOSES: EcritureBrute[] = [
    ecr("2026-03-01", ["1020", 1000], ["3200", 1000]),
    ecr("2026-04-01", ["6000", 300], ["1020", 300]),
    // Écriture de clôture : produits soldés, charges soldées, 2970 crédité de 700.
    {
      date_ecriture: "2026-12-31",
      libelle: "Clôture",
      piece_type: "cloture",
      ecritures_lignes: [
        { compte_numero: "3200", debit: 1000, credit: 0 },
        { compte_numero: "6000", debit: 0, credit: 300 },
        { compte_numero: "2970", debit: 0, credit: 700 },
      ],
    },
  ];

  it("rien n'est reporté deux fois : le report est nul, 2970 porte le résultat", () => {
    const rap = rapport({
      annee: [ecr("2027-02-01", ["1020", 170], ["3200", 170])],
      anterieures: ANTERIEURES_CLOSES,
    });

    expect(
      rap.reportExercicesAnterieurs,
      "le résultat est compté deux fois : dans 2970 ET dans le report",
    ).toBe(0);
    expect(rap.passifs.find((p) => p.numero === "2970")?.montant).toBe(700);
    expect(rap.totalActif).toBe(870);
    expect(rap.totalPassif).toBe(rap.totalActif);
  });

  it("l'exercice LU clôturé ne porte pas deux fois son propre résultat", () => {
    const rap = rapport({
      annee: ANTERIEURES_CLOSES,
      cloture: true,
    });

    // Clôturé : le résultat est dans 2970, pas en ligne « Résultat de l'exercice ».
    expect(rap.resultatAuBilan).toBe(0);
    expect(rap.reportExercicesAnterieurs).toBe(0);
    expect(rap.totalActif).toBe(700);
    expect(rap.totalPassif).toBe(rap.totalActif);
  });
});
