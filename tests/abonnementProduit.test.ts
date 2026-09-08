import { describe, it, expect } from "vitest";
import {
  COMPTE_ABONNEMENTS_PREPAYES,
  COMPTE_GARDERIE,
  COMPTE_SEJOURS,
  categorieAmbigue,
  compteProduitCategorie,
  compteProduitReservation,
  joursConsommes,
  joursPayes,
  libelleLigneAbonnement,
  lignesExpiration,
  lignesJourConsomme,
  partExacteDuJour,
  tarifUnitaire,
  transfertsDeLaCarte,
  valeurConsommee,
  valeurRestante,
  type MouvementCarte,
} from "@/src/lib/abonnementProduitLogique";
import { cibleFacture } from "@/src/lib/comptaFactureLogique";

/**
 * La carte de contrôle : 11 journées dont 1 offerte, payée 400 francs.
 * C'est celle de la base, et le tarif unitaire attendu est 40,00 — 400 divisé
 * par les 10 journées PAYÉES, jamais par les 11.
 */
const CARTE = { prix_paye: 400, jours_total: 11, jours_offerts: 1 };

const somme = (v: number[]) => Math.round(v.reduce((s, x) => s + x, 0) * 100) / 100;

describe("le tarif unitaire", () => {
  it("divise le prix par les journées PAYÉES, pas par le total", () => {
    expect(joursPayes(CARTE)).toBe(10);
    expect(tarifUnitaire(CARTE)).toBe(40);
    // Le piège : diviser par 11 donnerait 36,36 et diluerait chaque journée.
    expect(tarifUnitaire(CARTE)).not.toBe(Math.round((400 / 11) * 100) / 100);
  });

  it("vaut le prix entier quand rien n’est offert", () => {
    expect(tarifUnitaire({ prix_paye: 400, jours_total: 10, jours_offerts: 0 })).toBe(40);
  });

  it("ne divise pas par zéro quand tout est offert", () => {
    expect(tarifUnitaire({ prix_paye: 0, jours_total: 3, jours_offerts: 3 })).toBe(0);
    expect(joursPayes({ prix_paye: 0, jours_total: 3, jours_offerts: 5 })).toBe(0);
  });
});

describe("la journée offerte ne porte aucun produit", () => {
  it("donne sa part aux dix premières, rien à la onzième", () => {
    for (let rang = 1; rang <= 10; rang++) {
      expect(partExacteDuJour(CARTE, rang)).toBe(40);
    }
    expect(partExacteDuJour(CARTE, 11)).toBe(0);
    expect(partExacteDuJour(CARTE, 12)).toBe(0);
    expect(partExacteDuJour(CARTE, 0)).toBe(0);
  });

  it("transfère en tout le prix payé, et pas un centime de plus", () => {
    const parts = Array.from({ length: 11 }, (_, i) => partExacteDuJour(CARTE, i + 1));
    expect(somme(parts)).toBe(400);
  });
});

describe("la somme des transferts vaut le prix payé, au centime", () => {
  /**
   * Le cas qui casse une division naïve : un prix qui ne tombe pas rond. La
   * dernière journée payée absorbe l'écart, sinon quelques centimes
   * resteraient coincés en 2031 pour toujours.
   */
  it("sur un prix indivisible", () => {
    const carte = { prix_paye: 100, jours_total: 4, jours_offerts: 1 }; // 3 payées
    expect(tarifUnitaire(carte)).toBe(33.33);
    const parts = [1, 2, 3, 4].map((r) => partExacteDuJour(carte, r));
    expect(parts).toEqual([33.33, 33.33, 33.34, 0]);
    expect(somme(parts)).toBe(100);
  });

  it("sur une brassée de cartes tirées au hasard", () => {
    let graine = 20260908;
    const tirage = () => {
      graine = (graine * 1103515245 + 12345) % 2147483648;
      return graine / 2147483648;
    };

    for (let essai = 0; essai < 300; essai++) {
      const payes = 1 + Math.floor(tirage() * 20);
      const offerts = Math.floor(tirage() * 3);
      const carte = {
        prix_paye: Math.round(tirage() * 200000) / 100,
        jours_total: payes + offerts,
        jours_offerts: offerts,
      };
      const parts = Array.from({ length: carte.jours_total }, (_, i) => partExacteDuJour(carte, i + 1));
      expect(somme(parts)).toBe(Math.round(Number(carte.prix_paye) * 100) / 100);
      // Les journées offertes ferment la marche et ne valent rien.
      for (let i = payes; i < carte.jours_total; i++) expect(parts[i]).toBe(0);
    }
  });
});

describe("le solde de 2031 : la valeur des journées non consommées", () => {
  it("descend d’une part à chaque journée, et s’arrête à zéro", () => {
    expect(valeurRestante(CARTE, 0)).toBe(400);
    expect(valeurRestante(CARTE, 1)).toBe(360);
    expect(valeurRestante(CARTE, 3)).toBe(280);
    expect(valeurRestante(CARTE, 10)).toBe(0);
    // La onzième est offerte : elle ne peut pas rendre le solde négatif.
    expect(valeurRestante(CARTE, 11)).toBe(0);
    expect(valeurRestante(CARTE, 99)).toBe(0);
  });

  it("consommé + restant = prix payé, toujours", () => {
    for (let n = 0; n <= 12; n++) {
      expect(somme([valeurConsommee(CARTE, n), valeurRestante(CARTE, n)])).toBe(400);
    }
  });
});

describe("les comptes de produit", () => {
  it("suivent la NATURE de la prestation, pas le mode de paiement", () => {
    expect(compteProduitReservation("sejour")).toBe(COMPTE_SEJOURS);
    expect(compteProduitReservation("journee")).toBe(COMPTE_GARDERIE);
    expect(compteProduitReservation("garderie")).toBe(COMPTE_GARDERIE);
    expect(compteProduitReservation(null)).toBe(COMPTE_GARDERIE);
  });

  it("à l’expiration, suivent le type que la carte couvre", () => {
    for (const c of ["journee_partage_1", "journee_partage_2", "journee_partage_3", "journee_privatif"]) {
      expect(compteProduitCategorie(c)).toBe(COMPTE_GARDERIE);
      expect(categorieAmbigue(c)).toBe(false);
    }
    expect(compteProduitCategorie("sejour_partage_1")).toBe(COMPTE_SEJOURS);
  });

  it("signale une catégorie qui couvrirait plusieurs natures", () => {
    // Le jour où une carte mêlerait séjours et journées, il faudra décider —
    // pas deviner. Ce drapeau est là pour qu'on s'en aperçoive.
    expect(categorieAmbigue("mixte_sejour_journee")).toBe(true);
  });
});

describe("les écritures", () => {
  it("transfèrent 2031 vers le produit, et s’équilibrent", () => {
    const lignes = lignesJourConsomme(40, COMPTE_GARDERIE);
    expect(lignes).toEqual([
      { compte: COMPTE_ABONNEMENTS_PREPAYES, debit: 40, credit: 0 },
      { compte: COMPTE_GARDERIE, debit: 0, credit: 40 },
    ]);
    expect(somme(lignes.map((l) => l.debit - l.credit))).toBe(0);
  });

  it("ne passent rien pour une journée offerte", () => {
    expect(lignesJourConsomme(0, COMPTE_GARDERIE)).toEqual([]);
  });

  it("s’inversent quand une journée est recréditée", () => {
    const lignes = lignesJourConsomme(-40, COMPTE_GARDERIE);
    expect(lignes[0]).toEqual({ compte: COMPTE_GARDERIE, debit: 40, credit: 0 });
    expect(lignes[1]).toEqual({ compte: COMPTE_ABONNEMENTS_PREPAYES, debit: 0, credit: 40 });
  });

  it("sortent le reste de 2031 à l’expiration", () => {
    const lignes = lignesExpiration(280, COMPTE_GARDERIE);
    expect(lignes[0]).toEqual({ compte: COMPTE_ABONNEMENTS_PREPAYES, debit: 280, credit: 0 });
    expect(lignes[1]).toEqual({ compte: COMPTE_GARDERIE, debit: 0, credit: 280 });
  });
});

describe("le déroulé des mouvements", () => {
  const mvt = (id: string, type: string, delta: number, reservation_id: string | null = null): MouvementCarte =>
    ({ id, type, delta, reservation_id });

  it("donne un transfert par journée, dans l’ordre", () => {
    const t = transfertsDeLaCarte(CARTE, [
      mvt("m0", "achat", 11),
      mvt("m1", "consommation", -1, "r1"),
      mvt("m2", "consommation", -1, "r2"),
      mvt("m3", "consommation", -1, "r3"),
    ]);
    expect(t.map((x) => x.rang)).toEqual([1, 2, 3]);
    expect(t.map((x) => x.part)).toEqual([40, 40, 40]);
    expect(t.map((x) => x.reservationId)).toEqual(["r1", "r2", "r3"]);
    expect(somme(t.map((x) => x.part))).toBe(120);
  });

  it("ignore l’achat, l’ajustement et l’expiration", () => {
    const t = transfertsDeLaCarte(CARTE, [
      mvt("m0", "achat", 11),
      mvt("m1", "ajustement", -2),
      mvt("m2", "expiration", -9),
    ]);
    expect(t).toEqual([]);
  });

  it("rend son rang à une journée recréditée", () => {
    const t = transfertsDeLaCarte(CARTE, [
      mvt("m1", "consommation", -1, "r1"),
      mvt("m2", "consommation", -1, "r2"),
      mvt("m3", "recredit", 1, "r2"),
      mvt("m4", "consommation", -1, "r3"),
    ]);
    expect(t.map((x) => x.part)).toEqual([40, 40, -40, 40]);
    // Net : deux journées consommées, 80 francs de produit.
    expect(somme(t.map((x) => x.part))).toBe(80);
    expect(joursConsommes([
      mvt("m1", "consommation", -1), mvt("m2", "consommation", -1),
      mvt("m3", "recredit", 1), mvt("m4", "consommation", -1),
    ])).toBe(2);
  });

  it("attache chaque transfert à SON mouvement — c’est ce qui rend l’opération idempotente", () => {
    const mouvements = [
      mvt("m1", "consommation", -1, "r1"),
      mvt("m2", "consommation", -1, "r2"),
    ];
    const premier = transfertsDeLaCarte(CARTE, mouvements);
    const second = transfertsDeLaCarte(CARTE, mouvements);
    // Rejouer donne exactement la même liste, avec les mêmes identifiants :
    // l'appelant saute ceux qui ont déjà une écriture, et rien ne double.
    expect(second).toEqual(premier);
    expect(new Set(premier.map((t) => t.mouvementId)).size).toBe(premier.length);
  });

  it("ne transfère plus rien passé la dixième journée", () => {
    const mouvements = Array.from({ length: 11 }, (_, i) => mvt(`m${i}`, "consommation", -1, `r${i}`));
    const t = transfertsDeLaCarte(CARTE, mouvements);
    expect(t).toHaveLength(11);
    expect(t[10].part).toBe(0); // la journée offerte
    expect(somme(t.map((x) => x.part))).toBe(400);
  });
});

describe("la facture de la carte", () => {
  it("crédite 2031 et débite 1100 — aucun produit ce jour-là", () => {
    const cible = cibleFacture({
      type: "libre",
      emise: true,
      statut: "emise",
      lignes: [{ compte_produit: "2031", montant: 400, taux_tva: 8.1 }],
    });
    expect(cible["1100"]).toBe(400);
    expect(cible["2031"]).toBe(-400);
    // Ni 3000 ni 3001 : la prestation n'est pas encore rendue.
    expect(cible["3000"]).toBeUndefined();
    expect(cible["3001"]).toBeUndefined();
  });

  it("l’encaissement solde 1100 par la trésorerie", () => {
    const cible = cibleFacture({
      type: "libre", emise: true, statut: "emise",
      lignes: [{ compte_produit: "2031", montant: 400 }],
      paiements: [{ mode: "virement", montant: 400 }],
    });
    expect(cible["1020"]).toBe(400);
    expect(cible["1100"]).toBeUndefined(); // soldé
    expect(cible["2031"]).toBe(-400);
  });

  it("un avoir défait EXACTEMENT ce que la facture a fait", () => {
    const facture = cibleFacture({
      type: "libre", emise: true, statut: "emise",
      lignes: [{ compte_produit: "2031", montant: 400 }],
    });
    const avoir = cibleFacture({
      type: "avoir", emise: true, statut: "emise",
      lignes: [{ compte_produit: "2031", montant: 400 }],
      montantCredite: 0,
    });
    // Somme des deux : tout retombe à zéro, compte par compte.
    for (const compte of new Set([...Object.keys(facture), ...Object.keys(avoir)])) {
      expect(Math.round(((facture[compte] ?? 0) + (avoir[compte] ?? 0)) * 100) / 100).toBe(0);
    }
  });

  it("nomme la carte pour ce qu’elle est", () => {
    expect(libelleLigneAbonnement(CARTE, "1 chien sociable"))
      .toBe("Abonnement 10 jours + 1 offert — 1 chien sociable");
    expect(libelleLigneAbonnement({ prix_paye: 400, jours_total: 10, jours_offerts: 0 }))
      .toBe("Abonnement 10 jours");
  });
});

describe("l’assertion du système", () => {
  /**
   * Le solde de 2031 vaut TOUJOURS la valeur des journées non encore
   * consommées. C'est le contrôle qui dit si la comptabilité des cartes est
   * juste — on le vérifie en rejouant toute la vie d'une carte.
   */
  it("tient à chaque étape de la vie d’une carte", () => {
    let solde = 0;

    // Émission : la facture crédite 2031 du prix payé.
    solde = 400;
    expect(solde).toBe(valeurRestante(CARTE, 0));

    // Trois journées consommées.
    const mouvements: MouvementCarte[] = [];
    for (let i = 1; i <= 3; i++) {
      mouvements.push({ id: `m${i}`, type: "consommation", delta: -1, reservation_id: `r${i}` });
    }
    for (const t of transfertsDeLaCarte(CARTE, mouvements)) solde = Math.round((solde - t.part) * 100) / 100;
    expect(solde).toBe(280);
    expect(solde).toBe(valeurRestante(CARTE, joursConsommes(mouvements)));

    // Expiration : ce qui reste sort de 2031.
    const reste = valeurRestante(CARTE, joursConsommes(mouvements));
    solde = Math.round((solde - reste) * 100) / 100;
    expect(solde).toBe(0);
  });

  it("tient aussi quand une journée est rendue", () => {
    const mouvements: MouvementCarte[] = [
      { id: "m1", type: "consommation", delta: -1, reservation_id: "r1" },
      { id: "m2", type: "consommation", delta: -1, reservation_id: "r2" },
      { id: "m3", type: "recredit", delta: 1, reservation_id: "r2" },
    ];
    let solde = 400;
    for (const t of transfertsDeLaCarte(CARTE, mouvements)) solde = Math.round((solde - t.part) * 100) / 100;
    expect(solde).toBe(360);
    expect(solde).toBe(valeurRestante(CARTE, joursConsommes(mouvements)));
  });
});
