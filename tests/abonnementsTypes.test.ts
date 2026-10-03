import { describe, it, expect } from "vitest";
import {
  CARTES_EN_VENTE,
  LIBELLES_CARTES,
  MENTION_JOURNEE_OFFERTE,
  REFUS_TROIS_CHIENS,
  cartesEligibles,
  categorieCarteJournee,
  estEnVente,
  labelAbonnement,
  prixCarte,
  refusCarte,
} from "../src/lib/abonnementsTypes";
import { calculerMontant, cleTarif } from "../src/lib/calculTarif";

/**
 * APP 72 — les cartes de garderie (décisions de Sabrina, 03.10.2026).
 *
 * En vente, dans cet ordre : « 1 chien sociable », « 2 chiens ensemble »,
 * « 1 chien seul ». « 3 chiens ensemble » ne se vend plus, mais une carte déjà
 * vendue garde son nom et se consomme jusqu'au bout.
 */

const SOCIABLE = { doit_etre_isole: false };
const ISOLE = { doit_etre_isole: true };

/** Les tarifs 2026 et 2027, relus en base le 3 octobre 2026. */
const TARIFS = [
  { categorie: "journee_partage_1", membre: true, prix: "35" },
  { categorie: "journee_partage_2", membre: true, prix: "68" },
  { categorie: "journee_partage_3", membre: true, prix: "101" },
  { categorie: "journee_privatif", membre: true, prix: "70" },
];
const tarif = (c: string) => Number(TARIFS.find((t) => t.categorie === c)!.prix);

describe("les cartes en vente", () => {
  it("sont trois, dans l'ordre de Sabrina", () => {
    expect(CARTES_EN_VENTE).toEqual([
      { categorie: "journee_partage_1", label: "1 chien sociable" },
      { categorie: "journee_partage_2", label: "2 chiens ensemble" },
      { categorie: "journee_privatif", label: "1 chien seul" },
    ]);
  });

  it("« 3 chiens ensemble » n'est plus en vente (la mutation qui la remettrait fait rougir ce test)", () => {
    expect(CARTES_EN_VENTE.map((c) => c.categorie)).not.toContain("journee_partage_3");
    expect(estEnVente("journee_partage_3")).toBe(false);
  });

  it("« 1 chien seul », et non plus « 1 chien box prive »", () => {
    expect(labelAbonnement("journee_privatif")).toBe("1 chien seul");
    expect(Object.values(LIBELLES_CARTES)).not.toContain("1 chien box prive");
  });
});

describe("les anciennes cartes", () => {
  it("une carte « 3 chiens ensemble » déjà vendue garde son nom", () => {
    expect(labelAbonnement("journee_partage_3")).toBe("3 chiens ensemble");
  });

  it("une catégorie inconnue s'affiche telle quelle, et rien ne s'affiche « Carte » à tort", () => {
    expect(labelAbonnement("autre_chose")).toBe("autre_chose");
    expect(labelAbonnement(null)).toBe("Carte");
  });
});

describe("cartesEligibles — ce qu'un client peut acheter selon ses chiens", () => {
  it.each([
    ["1 chien sociable", [SOCIABLE], ["journee_partage_1", "journee_privatif"]],
    ["2 sociables", [SOCIABLE, SOCIABLE], ["journee_partage_1", "journee_partage_2", "journee_privatif"]],
    ["3 sociables (sans « 3 ensemble »)", [SOCIABLE, SOCIABLE, SOCIABLE], ["journee_partage_1", "journee_partage_2", "journee_privatif"]],
    ["1 chien isolé", [ISOLE], ["journee_privatif"]],
    ["1 isolé + 1 sociable", [ISOLE, SOCIABLE], ["journee_partage_2", "journee_privatif"]],
    ["2 isolés", [ISOLE, ISOLE], ["journee_partage_2", "journee_privatif"]],
  ])("%s", (_cas, chiens, attendu) => {
    expect(cartesEligibles(chiens)).toEqual(attendu);
  });

  it("aucun chien actif : aucune carte", () => {
    expect(cartesEligibles([])).toEqual([]);
    expect(cartesEligibles([{ doit_etre_isole: false, actif: false }])).toEqual([]);
  });

  it("un chien retiré ne compte pas", () => {
    expect(cartesEligibles([{ ...SOCIABLE, actif: false }, { ...SOCIABLE, actif: true }]))
      .toEqual(["journee_partage_1", "journee_privatif"]);
    expect(cartesEligibles([{ ...ISOLE, actif: false }, SOCIABLE]))
      .toEqual(["journee_partage_1", "journee_privatif"]);
  });

  it("jamais « 3 chiens ensemble », quel que soit le nombre de chiens", () => {
    const cinq = Array.from({ length: 5 }, () => SOCIABLE);
    expect(cartesEligibles(cinq)).not.toContain("journee_partage_3");
  });
});

describe("refusCarte — la même phrase à l'achat et à la confirmation", () => {
  it("« 3 chiens ensemble » est refusée, même à trois chiens sociables", () => {
    expect(refusCarte("journee_partage_3", [SOCIABLE, SOCIABLE, SOCIABLE])).toBe(REFUS_TROIS_CHIENS);
  });

  it("une carte qui ne correspond pas aux chiens est refusée", () => {
    expect(refusCarte("journee_partage_1", [ISOLE])).toBe("Cette formule ne correspond pas au profil de vos chiens.");
    expect(refusCarte("journee_partage_2", [SOCIABLE])).toBe("Cette formule ne correspond pas au profil de vos chiens.");
  });

  it("une carte permise passe", () => {
    expect(refusCarte("journee_privatif", [SOCIABLE])).toBeNull();
    expect(refusCarte("journee_partage_2", [ISOLE, SOCIABLE])).toBeNull();
  });

  it("une catégorie inventée est refusée", () => {
    expect(refusCarte("journee_n_importe", [SOCIABLE])).toBe("Formule invalide.");
  });
});

describe("le prix d'une carte = tarif du jour × 10 (la 11e offerte)", () => {
  it("350.–, 680.–, 700.– avec les tarifs actuels", () => {
    expect(CARTES_EN_VENTE.map((c) => prixCarte(tarif(c.categorie)))).toEqual([350, 680, 700]);
  });

  it("suit le tarif : si le tarif change, la carte change", () => {
    expect(prixCarte("36.50")).toBe(365);
  });

  it("la mention de la journée offerte", () => {
    expect(MENTION_JOURNEE_OFFERTE).toBe("10 journées payées, la 11e journée offerte");
  });
});

describe("categorieCarteJournee — la carte du TARIF appliqué", () => {
  it("box seul → « 1 chien seul », même pour un chien qui n'est pas « doit être isolé »", () => {
    expect(categorieCarteJournee({ nb_chiens: 1, est_privatif: true })).toBe("journee_privatif");
  });

  it("partagé : 1 chien → sociable, 2 chiens → 2 ensemble", () => {
    expect(categorieCarteJournee({ nb_chiens: 1, est_privatif: false })).toBe("journee_partage_1");
    expect(categorieCarteJournee({ nb_chiens: 2, est_privatif: false })).toBe("journee_partage_2");
  });

  it("3 chiens partagés → la catégorie d'une ANCIENNE carte, que plus rien ne vend", () => {
    expect(categorieCarteJournee({ nb_chiens: 3, est_privatif: false })).toBe("journee_partage_3");
    expect(estEnVente("journee_partage_3")).toBe(false);
  });

  it("plus de 3 chiens partagés : aucune carte (comme avant) ; un box seul reste un box seul", () => {
    expect(categorieCarteJournee({ nb_chiens: 4, est_privatif: false })).toBeNull();
    expect(categorieCarteJournee({ nb_chiens: 4, est_privatif: true })).toBe("journee_privatif");
    expect(categorieCarteJournee({ nb_chiens: 0, est_privatif: false })).toBeNull();
  });

  it("c'est EXACTEMENT la catégorie du prix : même fonction que calculTarif", () => {
    for (const nb_chiens of [1, 2, 3]) {
      for (const est_privatif of [false, true]) {
        expect(categorieCarteJournee({ nb_chiens, est_privatif }))
          .toBe(cleTarif({ type_reservation: "journee", nb_chiens, est_urgence: false, est_privatif }));
      }
    }
  });

  it("3 chiens sans carte : la journée se paie au tarif normal, 101.–", () => {
    expect(calculerMontant({
      tarifs: TARIFS, type_reservation: "journee", nb_chiens: 3, est_membre: true,
      est_urgence: false, est_privatif: false, date_debut: "2026-10-05", date_fin: "2026-10-05",
    })).toBe(101);
  });
});
