import { describe, it, expect } from "vitest";
import {
  COMPTE_DECOMPTE_TDFN,
  COMPTE_TVA_DUE,
  COMPTE_IMPOT_PREALABLE,
  SEUIL_SECOND_TAUX,
  calculerDecompteEffectif,
  calculerDecompteTdfn,
  lignesEcritureDecompteEffectif,
  lignesEcritureDecompteTdfn,
  lignesEcriturePaiementTva,
  periodeContenant,
  periodesDe,
  periodiciteInhabituelle,
  periodiciteProposee,
  refusDecompte,
  seuilSecondTaux,
  type ParametresTva,
} from "@/src/lib/decompteTvaLogique";
import { cibleFacture } from "@/src/lib/comptaFactureLogique";
import { ventilerPanier } from "@/src/lib/tvaLogique";

/**
 * AUCUN taux de dette fiscale nette réel n'apparaît dans ce fichier.
 *
 * Ces taux sont attribués entreprise par entreprise par l'AFC : en écrire un
 * ici, même « pour l'exemple », c'est prendre le risque qu'il soit un jour
 * recopié dans le code et facturé pour de bon. Les deux constantes ci-dessous
 * portent des valeurs volontairement impossibles — les taux réels de l'AFC
 * vont de 0,1 % à 6,7 % — et leur nom dit ce qu'elles sont.
 */
const TAUX_TDFN_FICTIF_SECTEUR_1 = 9.9;
const TAUX_TDFN_FICTIF_SECTEUR_2 = 8.8;

const regime = (p: Partial<ParametresTva> = {}): ParametresTva => ({
  assujettie: true,
  dateAssujettissement: "2026-01-01",
  numero: "CHE-123.456.789 TVA",
  methode: "tdfn",
  periodicite: "semestrielle",
  tauxTdfn1: TAUX_TDFN_FICTIF_SECTEUR_1,
  libelleSecteur1: "Pension pour chiens",
  tauxTdfn2: null,
  libelleSecteur2: null,
  ...p,
});

describe("la méthode et la périodicité", () => {
  it("propose le semestre pour la dette fiscale nette, le trimestre pour l’effective", () => {
    expect(periodiciteProposee("tdfn")).toBe("semestrielle");
    expect(periodiciteProposee("effective")).toBe("trimestrielle");
  });

  it("propose sans forcer : l’AFC peut en décider autrement", () => {
    expect(periodiciteInhabituelle({ methode: "tdfn", periodicite: "semestrielle" })).toBeNull();
    const avis = periodiciteInhabituelle({ methode: "tdfn", periodicite: "trimestrielle" });
    expect(avis).toContain("Gardez la périodicité trimestrielle si votre décision de l'AFC le prévoit");
  });
});

describe("les périodes", () => {
  it("découpe l’année en deux semestres", () => {
    const p = periodesDe(2026, "semestrielle");
    expect(p).toHaveLength(2);
    expect(p[0]).toMatchObject({ code: "2026-S1", debut: "2026-01-01", fin: "2026-06-30" });
    expect(p[1]).toMatchObject({ code: "2026-S2", debut: "2026-07-01", fin: "2026-12-31" });
  });

  it("découpe l’année en quatre trimestres", () => {
    const p = periodesDe(2026, "trimestrielle");
    expect(p.map((x) => x.code)).toEqual(["2026-T1", "2026-T2", "2026-T3", "2026-T4"]);
    expect(p[3]).toMatchObject({ debut: "2026-10-01", fin: "2026-12-31" });
  });

  it("tient compte des années bissextiles", () => {
    expect(periodesDe(2028, "trimestrielle")[0].fin).toBe("2028-03-31");
    expect(periodesDe(2026, "trimestrielle")[0].fin).toBe("2026-03-31");
  });

  it("retrouve la période d’une date", () => {
    expect(periodeContenant("2026-06-30", "semestrielle")!.code).toBe("2026-S1");
    expect(periodeContenant("2026-07-01", "semestrielle")!.code).toBe("2026-S2");
  });
});

describe("ce qui manque pour décompter", () => {
  it("refuse tant que le taux du secteur 1 n’est pas saisi", () => {
    const refus = refusDecompte(regime({ tauxTdfn1: 0 }));
    expect(refus).toContain("secteur 1 n'est pas saisi");
    expect(refus).toContain("décision de l'AFC");
  });

  it("dit précisément ce qui manque, pas « erreur »", () => {
    expect(refusDecompte(regime({ numero: null }))).toContain("numéro de TVA");
    expect(refusDecompte(regime({ dateAssujettissement: null }))).toContain("date d'assujettissement");
    expect(refusDecompte(regime({ libelleSecteur1: "" }))).toContain("libellé du secteur 1");
    expect(refusDecompte(regime({ tauxTdfn2: TAUX_TDFN_FICTIF_SECTEUR_2, libelleSecteur2: "" })))
      .toContain("sans libellé de secteur");
  });

  it("n’attend aucun taux d’une entreprise non assujettie", () => {
    expect(refusDecompte(regime({ assujettie: false }))).toContain("pas assujettie");
  });

  it("laisse passer quand tout est saisi", () => {
    expect(refusDecompte(regime())).toBeNull();
  });
});

describe("le décompte en dette fiscale nette", () => {
  const ca = [
    { secteur: "pension" as const, ttc: 80000 },
    { secteur: "commerce" as const, ttc: 20000 },
  ];

  it("applique le taux SAISI au chiffre d’affaires TTC", () => {
    const d = calculerDecompteTdfn({ parametres: regime(), caParSecteur: ca });
    expect(d.caTotal).toBe(100000);
    expect(d.totalDu).toBe(Math.round(100000 * TAUX_TDFN_FICTIF_SECTEUR_1) / 100);
  });

  it("rattache TOUT au secteur 1 tant qu’un second taux n’est pas accordé", () => {
    const d = calculerDecompteTdfn({ parametres: regime(), caParSecteur: ca });
    expect(d.lignes).toHaveLength(1);
    expect(d.lignes[0].ca).toBe(100000);
    expect(d.lignes[0].libelle).toBe("Pension pour chiens");
  });

  it("sépare les deux secteurs dès qu’un second taux est saisi", () => {
    const d = calculerDecompteTdfn({
      parametres: regime({
        tauxTdfn2: TAUX_TDFN_FICTIF_SECTEUR_2,
        libelleSecteur2: "Commerce d'accessoires",
      }),
      caParSecteur: ca,
    });
    expect(d.lignes).toHaveLength(2);
    const commerce = d.lignes.find((l) => l.secteur === "commerce")!;
    const pension = d.lignes.find((l) => l.secteur === "pension")!;
    expect(commerce.ca).toBe(20000);
    expect(commerce.taux).toBe(TAUX_TDFN_FICTIF_SECTEUR_2);
    expect(pension.ca).toBe(80000);
    expect(pension.taux).toBe(TAUX_TDFN_FICTIF_SECTEUR_1);
    expect(d.totalDu).toBe(
      Math.round(80000 * TAUX_TDFN_FICTIF_SECTEUR_1) / 100 +
      Math.round(20000 * TAUX_TDFN_FICTIF_SECTEUR_2) / 100
    );
  });
});

describe("l’écriture du décompte", () => {
  it("débite 3806 et crédite 2200, et rien d’autre", () => {
    const lignes = lignesEcritureDecompteTdfn(1234.55);
    expect(lignes).toEqual([
      { compte: COMPTE_DECOMPTE_TDFN, debit: 1234.55, credit: 0 },
      { compte: COMPTE_TVA_DUE, debit: 0, credit: 1234.55 },
    ]);
    expect(lignes.reduce((s, l) => s + l.debit - l.credit, 0)).toBe(0);
  });

  it("ne passe rien quand il n’y a rien à devoir", () => {
    expect(lignesEcritureDecompteTdfn(0)).toEqual([]);
  });

  it("s’inverse sur un décompte négatif", () => {
    const lignes = lignesEcritureDecompteTdfn(-50);
    expect(lignes[0]).toEqual({ compte: COMPTE_TVA_DUE, debit: 50, credit: 0 });
    expect(lignes[1]).toEqual({ compte: COMPTE_DECOMPTE_TDFN, debit: 0, credit: 50 });
  });

  it("solde 2200 par la banque au paiement", () => {
    expect(lignesEcriturePaiementTva(1234.55)).toEqual([
      { compte: COMPTE_TVA_DUE, debit: 1234.55, credit: 0 },
      { compte: "1020", debit: 0, credit: 1234.55 },
    ]);
  });

  it("solde 1170 dans 2200 en méthode effective", () => {
    const d = calculerDecompteEffectif({
      ventilation: ventilerPanier({ lignes: [{ montant: 1081, taux_tva: 8.1 }] }),
      impotPrealable: 30,
    });
    expect(d.tvaFacturee).toBe(81);
    expect(d.totalDu).toBe(51);
    expect(lignesEcritureDecompteEffectif(d)).toEqual([
      { compte: COMPTE_TVA_DUE, debit: 30, credit: 0 },
      { compte: COMPTE_IMPOT_PREALABLE, debit: 0, credit: 30 },
    ]);
  });
});

describe("les deux méthodes de comptabilisation d’une facture", () => {
  const facture = (tvaEffective: boolean) =>
    cibleFacture({
      type: "facture",
      emise: true,
      statut: "emise",
      lignes: [
        { compte_produit: "3200", montant: 43, taux_tva: 8.1 },
        { compte_produit: "3200", montant: 29.5, taux_tva: 2.6 },
      ],
      tvaEffective,
    });

  it("en dette fiscale nette, le produit reste TTC et 2200 ne bouge PAS", () => {
    const cible = facture(false);
    // 3200 crédité de tout le TTC ; aucune TVA au fil de la facture.
    expect(cible["3200"]).toBe(-72.5);
    expect(cible["1100"]).toBe(72.5);
    expect(cible["2200"]).toBeUndefined();
  });

  it("en méthode effective, le produit est NET et la TVA se crédite en 2200", () => {
    const cible = facture(true);
    const ht = Math.round((43 / 1.081) * 100) / 100 + Math.round((29.5 / 1.026) * 100) / 100;
    const tva = Math.round((72.5 - ht) * 100) / 100;
    expect(cible["3200"]).toBe(-Math.round(ht * 100) / 100);
    expect(cible["2200"]).toBe(-tva);
    expect(cible["1100"]).toBe(72.5);
  });

  it("reste équilibrée dans les deux méthodes", () => {
    for (const effective of [false, true]) {
      const cible = facture(effective);
      const solde = Object.values(cible).reduce((s, v) => s + v, 0);
      expect(Math.round(solde * 100) / 100).toBe(0);
    }
  });

  it("un avoir reprend la TVA qu’il annule, en méthode effective", () => {
    const cible = cibleFacture({
      type: "avoir",
      emise: true,
      statut: "emise",
      lignes: [{ compte_produit: "3200", montant: 43, taux_tva: 8.1 }],
      montantCredite: 0,
      tvaEffective: true,
    });
    // 2200 se REDÉBITE : la dette née à la facture d'origine s'efface.
    expect(cible["2200"]).toBeGreaterThan(0);
    expect(Math.round(Object.values(cible).reduce((s, v) => s + v, 0) * 100) / 100).toBe(0);
  });
});

describe("le seuil des 10 %", () => {
  it("avertit quand l’activité secondaire dépasse 10 %", () => {
    const s = seuilSecondTaux({
      caParSecteur: [
        { secteur: "pension", ttc: 80000 },
        { secteur: "commerce", ttc: 20000 },
      ],
    })!;
    expect(s.part).toBe(20);
    expect(s.secteur).toBe("commerce");
    expect(s.depasse).toBe(true);
    expect(s.message).toContain("boutique et atelier représente 20 %");
    expect(s.message).toContain("demande-le à l'AFC");
  });

  it("ne dit rien tant que le seuil n’est pas franchi", () => {
    const s = seuilSecondTaux({
      caParSecteur: [
        { secteur: "pension", ttc: 95000 },
        { secteur: "commerce", ttc: 5000 },
      ],
    })!;
    expect(s.part).toBe(5);
    expect(s.depasse).toBe(false);
    expect(s.message).toBeNull();
  });

  it("se tait quand le second taux est déjà saisi", () => {
    const s = seuilSecondTaux({
      caParSecteur: [
        { secteur: "pension", ttc: 50000 },
        { secteur: "commerce", ttc: 50000 },
      ],
      secondTauxDejaSaisi: true,
    })!;
    expect(s.depasse).toBe(true);
    expect(s.message).toBeNull();
  });

  it("n’invente aucun taux — il avertit, c’est tout", () => {
    const s = seuilSecondTaux({
      caParSecteur: [
        { secteur: "pension", ttc: 80000 },
        { secteur: "commerce", ttc: 20000 },
      ],
    })!;
    expect(s.message).not.toMatch(/\d+([.,]\d+)? ?% de dette/);
    expect(s).not.toHaveProperty("tauxPropose");
  });

  it("ne dit rien sans chiffre d’affaires, ni sur un seul secteur", () => {
    expect(seuilSecondTaux({ caParSecteur: [] })).toBeNull();
    expect(seuilSecondTaux({ caParSecteur: [{ secteur: "pension", ttc: 1000 }] })).toBeNull();
  });

  it("place le seuil à 10 %", () => {
    expect(SEUIL_SECOND_TAUX).toBe(10);
    const juste = seuilSecondTaux({
      caParSecteur: [
        { secteur: "pension", ttc: 90000 },
        { secteur: "commerce", ttc: 10000 },
      ],
    })!;
    // Exactement 10 % ne dépasse pas 10 %.
    expect(juste.part).toBe(10);
    expect(juste.depasse).toBe(false);
  });
});
