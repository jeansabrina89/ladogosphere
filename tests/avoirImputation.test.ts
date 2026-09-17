import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  COMPTE_REMBOURSEMENT_DEFAUT,
  contrepartiesAvoir,
  imputerAvoir,
  libelleImputation,
  raisonSansExcedent,
  repartirRemboursement,
} from "@/src/lib/avoirImputation";
import { cibleFacture } from "@/src/lib/comptaFactureLogique";

/**
 * Un avoir solde la créance AVANT de créditer le client.
 *
 * L'ordre n'est pas une préférence de présentation : créditer un client qui
 * n'a rien payé lui donne un avoir tout en lui laissant sa dette, et le 1100
 * garde une créance que plus personne ne réclamera.
 */

const FACTURE = 250;
/** La facture de contrôle : un séjour de 250, compte de produit 3000. */
const lignesAvoir = (montant: number) => [{ compte_produit: "3000", montant, taux_tva: 0 }];

/** L'écriture de l'avoir, telle que le moteur la passera. */
const ecriture = (montant: number, imputation: ReturnType<typeof imputerAvoir>) =>
  cibleFacture({
    type: "avoir",
    emise: true,
    statut: "envoyee",
    lignes: lignesAvoir(montant),
    paiements: [],
    imputationAvoir: { credit: imputation.credit, remboursements: imputation.remboursements },
  });

/** JavaScript distingue 0 de −0 : on remet les zéros à l endroit. */
const z = (n: number | undefined) => (n ?? 0) + 0;
const somme = (c: Record<string, number>) => Math.round(Object.values(c).reduce((s, v) => s + v, 0) * 100) / 100;

describe("les six combinaisons", () => {
  const cas = [
    { nom: "impayée", paye: 0 },
    { nom: "partiellement payée (100)", paye: 100 },
    { nom: "payée", paye: 250 },
  ];

  for (const { nom, paye } of cas) {
    const reste = FACTURE - paye;
    const paiements = paye > 0 ? [{ mode: "twint", montant: paye }] : [];

    it(`facture ${nom} + porté au crédit : ${reste} au 1100, ${paye} au 2035`, () => {
      const i = imputerAvoir({ montant: FACTURE, resteFacture: reste, destination: "credit", paiements });
      expect(i).toMatchObject({ creance: reste, credit: paye, remboursements: [], excedent: paye });
      // Le mouvement d'avoir vaut la part créditée, et elle seule.
      expect(i.credit).toBe(paye);
      expect(contrepartiesAvoir(i)).toEqual(
        Object.fromEntries([...(reste ? [["1100", reste]] : []), ...(paye ? [["2035", paye]] : [])]));
      // L'écriture : produit repris au débit, contreparties au crédit.
      const e = ecriture(FACTURE, i);
      expect(e["3000"]).toBe(FACTURE);
      expect(z(e["1100"])).toBe(-reste + 0);
      expect(z(e["2035"])).toBe(-paye + 0);
      expect(somme(e)).toBe(0);
    });

    it(`facture ${nom} + remboursé : ${reste} au 1100, ${paye} à la liquidité`, () => {
      const i = imputerAvoir({ montant: FACTURE, resteFacture: reste, destination: "rembourser", paiements });
      expect(i).toMatchObject({ creance: reste, credit: 0, excedent: paye });
      expect(i.remboursements).toEqual(paye > 0 ? [{ compte: "1021", montant: paye }] : []);
      // Rien au registre des avoirs : l'argent ressort, il ne devient pas un crédit.
      expect(i.credit).toBe(0);
      const e = ecriture(FACTURE, i);
      expect(e["3000"]).toBe(FACTURE);
      expect(z(e["1100"])).toBe(-reste + 0);
      expect(z(e["1021"])).toBe(-paye + 0);
      expect(z(e["2035"])).toBe(0);
      expect(somme(e)).toBe(0);
    });
  }

  it("les trois exemples du chantier, au centime", () => {
    // 250 impayée, avoir 250 → 250 au crédit du 1100, rien au 2035.
    expect(contrepartiesAvoir(imputerAvoir({ montant: 250, resteFacture: 250, destination: "credit" })))
      .toEqual({ "1100": 250 });
    // 250 payée, avoir 250 → 250 au 2035, rien au 1100.
    expect(contrepartiesAvoir(imputerAvoir({ montant: 250, resteFacture: 0, destination: "credit" })))
      .toEqual({ "2035": 250 });
    // 250 payée 100, avoir 250 → 150 au 1100 et 100 au 2035.
    expect(contrepartiesAvoir(imputerAvoir({ montant: 250, resteFacture: 150, destination: "credit" })))
      .toEqual({ "1100": 150, "2035": 100 });
  });
});

describe("un avoir total sur une facture impayée", () => {
  it("ramène le 1100 de la facture à zéro, et ne crée aucun mouvement d'avoir", () => {
    // La facture : produit 250 au crédit, créance 250 au débit.
    const facture = cibleFacture({
      type: "facture", emise: true, statut: "envoyee", lignes: lignesAvoir(250), paiements: [],
    });
    expect(facture).toEqual({ "1100": 250, "3000": -250 });

    const i = imputerAvoir({ montant: 250, resteFacture: 250, destination: "credit" });
    expect(i.credit).toBe(0);
    const avoir = ecriture(250, i);

    // Les deux pièces ensemble : le 1100 est soldé, le produit aussi.
    const cumul = { ...facture };
    for (const [compte, montant] of Object.entries(avoir)) cumul[compte] = (cumul[compte] ?? 0) + montant;
    expect(cumul["1100"]).toBe(0);
    expect(cumul["3000"]).toBe(0);
    expect(z(cumul["2035"])).toBe(0);
    expect(somme(cumul)).toBe(0);
  });

  it("même chose en remboursé : rien ne part en liquidité, il n'y avait rien à rendre", () => {
    const i = imputerAvoir({ montant: 250, resteFacture: 250, destination: "rembourser", paiements: [] });
    expect(i).toMatchObject({ creance: 250, credit: 0, remboursements: [], excedent: 0 });
  });
});

describe("par où sort un remboursement", () => {
  it("par le compte qui a encaissé", () => {
    expect(repartirRemboursement(100, [{ mode: "cash", montant: 100 }])).toEqual([{ compte: "1000", montant: 100 }]);
    expect(repartirRemboursement(100, [{ mode: "virement", montant: 100 }])).toEqual([{ compte: "1020", montant: 100 }]);
    expect(repartirRemboursement(60, [{ mode: "carte", montant: 60 }])).toEqual([{ compte: "1021", montant: 60 }]);
  });

  it("au prorata quand la facture a été payée en plusieurs fois, au centime près", () => {
    const parts = repartirRemboursement(100, [{ mode: "cash", montant: 200 }, { mode: "virement", montant: 100 }]);
    expect(parts).toEqual([{ compte: "1000", montant: 66.67 }, { compte: "1020", montant: 33.33 }]);
    expect(Math.round(parts.reduce((s, p) => s + p.montant, 0) * 100) / 100).toBe(100);
  });

  it("une facture payée par avoir rend l'avoir, pas de l'argent", () => {
    expect(repartirRemboursement(50, [{ mode: "avoir", montant: 50 }])).toEqual([{ compte: "2035", montant: 50 }]);
  });

  it("sans encaissement identifiable, le remboursement sort de la banque", () => {
    expect(repartirRemboursement(40, [])).toEqual([{ compte: COMPTE_REMBOURSEMENT_DEFAUT, montant: 40 }]);
    expect(repartirRemboursement(40, [{ mode: "inconnu", montant: 40 }])).toEqual([{ compte: "1020", montant: 40 }]);
  });

  it("une contre-passation ne fait pas rembourser deux fois : seul le net compte", () => {
    expect(repartirRemboursement(50, [{ mode: "cash", montant: 100 }, { mode: "cash", montant: -50 }]))
      .toEqual([{ compte: "1000", montant: 50 }]);
  });
});

describe("ce que l'écran dit avant de valider", () => {
  it("facture impayée : le reste est soldé, le crédit est nul", () => {
    const i = imputerAvoir({ montant: 250, resteFacture: 250, destination: "credit" });
    expect(libelleImputation(i, 250)).toEqual([
      "Reste à payer de la facture : 250.00 CHF → soldé.",
      "Crédit au client : 0.00 CHF.",
    ]);
    expect(raisonSansExcedent(250, 250)).toContain("pas d'excédent");
  });

  it("facture payée : rien à solder, tout va au client", () => {
    const i = imputerAvoir({ montant: 250, resteFacture: 0, destination: "credit" });
    expect(libelleImputation(i, 0)).toEqual([
      "Reste à payer de la facture : 0.00 CHF — il n'y a rien à solder.",
      "Crédit au client : 250.00 CHF.",
    ]);
    expect(raisonSansExcedent(250, 0)).toBeNull();
  });

  it("facture partiellement payée, remboursée : les deux parts sont annoncées", () => {
    const i = imputerAvoir({ montant: 250, resteFacture: 150, destination: "rembourser", paiements: [{ mode: "cash", montant: 100 }] });
    expect(libelleImputation(i, 150)).toEqual([
      "Reste à payer de la facture : 150.00 CHF → soldé.",
      "Crédit au client : 0.00 CHF.",
      "Remboursement : 100.00 CHF — espèces.",
    ]);
    expect(raisonSansExcedent(250, 150)).toBeNull();
  });

  it("un avoir partiel plus petit que le reste réduit la créance sans la solder", () => {
    const i = imputerAvoir({ montant: 100, resteFacture: 250, destination: "credit" });
    expect(i).toMatchObject({ creance: 100, credit: 0, excedent: 0 });
    expect(libelleImputation(i, 250)[0]).toBe("Reste à payer de la facture : 250.00 CHF → réduit de 100.00 CHF.");
  });
});

describe("les avoirs déjà émis ne bougent pas", () => {
  it("sans imputation figée, le moteur garde exactement son ancien calcul", () => {
    const ancien = cibleFacture({
      type: "avoir", emise: true, statut: "envoyee", lignes: lignesAvoir(10), paiements: [],
      montantCredite: 10,
    });
    // AV-2026-0006 : 2035 crédité de 10 alors que la facture était impayée.
    expect(ancien).toEqual({ "2035": -10, "3000": 10 });
  });
});

describe("le dépôt", () => {
  const lire = (chemin: string) => readFileSync(join(__dirname, "..", chemin), "utf8");

  it("le registre des avoirs ne reçoit que la part créditée", () => {
    const code = lire("app/(admin)/(espace-comptabilite)/factures/actionsCreation.ts");
    expect(code).toMatch(/const imputation = imputerAvoir\(\{[\s\S]*?resteFacture: Number\(origine\.montant_restant \?\? 0\),/);
    expect(code).toMatch(/if \(imputation\.credit > 0\) \{[\s\S]{0,400}?montant: imputation\.credit,/);
    // L'imputation naît avec la pièce, et le trigger la fige ensuite.
    expect(code).toMatch(/imputation_avoir: \{\s*creance: imputation\.creance,\s*credit: imputation\.credit,\s*remboursements: imputation\.remboursements,/);
  });

  it("un avoir supérieur à ce qui reste à créditer est toujours refusé", () => {
    const code = lire("app/(admin)/(espace-comptabilite)/factures/actionsCreation.ts");
    expect(code).toMatch(/if \(montantAvoir > creditable \+ 0\.005\) \{/);
    expect(code).toContain("Cet avoir dépasse ce qui reste à créditer");
    // Le motif reste obligatoire.
    expect(code).toContain(`if (!motif) return { error: "Le motif de l'avoir est obligatoire." };`);
  });

  it("l'imputation est figée en base comme le reste de la pièce", () => {
    const sql = lire("supabase/migrations/20260917200924_avoirs_imputation_figee.sql");
    expect(sql).toContain("add column if not exists imputation_avoir jsonb");
    expect(sql).toMatch(/or NEW\.imputation_avoir\s+is distinct from OLD\.imputation_avoir/);
    expect(sql).toMatch(/revoke execute on function public\.factures_inalterabilite\(\) from public, anon, authenticated;/);
  });

  it("l'écran montre l'imputation avant de valider", () => {
    const ecran = lire("app/(admin)/(espace-comptabilite)/factures/[id]/ActionsFacture.tsx");
    expect(ecran).toContain("libelleImputation(imputation, reste)");
    expect(ecran).toContain("const sansExcedent = raisonSansExcedent(total, reste);");
    expect(ecran).toMatch(/const grisee = v === "credit" && !!sansExcedent;/);
  });
});
