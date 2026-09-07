import { describe, it, expect } from "vitest";
import {
  CATEGORIES_DEPENSE,
  COMPTE_BANQUE,
  COMPTE_CAISSE,
  COMPTE_CREANCIERS,
  MESSAGE_JUSTIFICATIF_REQUIS,
  compteContrepartie,
  libelleCategorie,
  lignesEcritureDepense,
  lignesEcritureReglement,
  peutValiderDepense,
  refusFichierPiece,
  extensionPiece,
  TAILLE_MAX_PIECE,
} from "@/src/lib/depensesLogique";

const equilibre = (lignes: { debit: number; credit: number }[]) =>
  Math.round((lignes.reduce((s, l) => s + l.debit - l.credit, 0) + Number.EPSILON) * 100) / 100;

describe("catégories de dépense", () => {
  it("reprend la fiche de compta quotidienne, dans l'ordre", () => {
    expect(CATEGORIES_DEPENSE.map((c) => `${c.libelle} → ${c.compte}`)).toEqual([
      "Loyer des box → 6000",
      "Assurances → 6300",
      "Vétérinaire et soins → 4410",
      "Alimentation des pensionnaires → 4400",
      "Petit matériel et nettoyage → 6100",
      "Téléphone et internet → 6510",
      "Logiciels et hébergement → 6570",
      "Frais bancaires et commissions → 6940",
      "Marchandises à revendre (boutique) → 4200",
      "Frais de véhicule → 6200",
      "Autre charge → 6700",
    ]);
  });

  it("aucun compte en double", () => {
    const comptes = CATEGORIES_DEPENSE.map((c) => c.compte);
    expect(new Set(comptes).size).toBe(comptes.length);
  });

  it("retrouve le libellé d'un compte, et rend le numéro seul s'il est inconnu", () => {
    expect(libelleCategorie("6000")).toBe("Loyer des box");
    expect(libelleCategorie("9999")).toBe("9999");
    expect(libelleCategorie(null)).toBe("—");
  });
});

describe("compteContrepartie", () => {
  it("banque, carte et TWINT passent par le compte courant", () => {
    expect(compteContrepartie("banque")).toBe(COMPTE_BANQUE);
    expect(compteContrepartie("carte")).toBe(COMPTE_BANQUE);
    expect(compteContrepartie("twint")).toBe(COMPTE_BANQUE);
  });
  it("les espèces passent par la caisse", () => {
    expect(compteContrepartie("caisse")).toBe(COMPTE_CAISSE);
  });
  it("« à payer » crée une dette fournisseur", () => {
    expect(compteContrepartie("a_payer")).toBe(COMPTE_CREANCIERS);
  });
});

describe("lignesEcritureDepense", () => {
  it("payée par banque : D 6000 / C 1020", () => {
    expect(
      lignesEcritureDepense({ compte_charge: "6000", montant: 1200, mode_paiement: "banque" })
    ).toEqual([
      { compte: "6000", debit: 1200, credit: 0 },
      { compte: "1020", debit: 0, credit: 1200 },
    ]);
  });

  it("payée en espèces : D 6100 / C 1000", () => {
    expect(
      lignesEcritureDepense({ compte_charge: "6100", montant: 42.5, mode_paiement: "caisse" })
    ).toEqual([
      { compte: "6100", debit: 42.5, credit: 0 },
      { compte: "1000", debit: 0, credit: 42.5 },
    ]);
  });

  it("à payer : D 4400 / C 2000", () => {
    expect(
      lignesEcritureDepense({ compte_charge: "4400", montant: 310, mode_paiement: "a_payer" })
    ).toEqual([
      { compte: "4400", debit: 310, credit: 0 },
      { compte: "2000", debit: 0, credit: 310 },
    ]);
  });

  it("carte et TWINT débitent la banque", () => {
    expect(
      lignesEcritureDepense({ compte_charge: "6570", montant: 19.9, mode_paiement: "carte" })[1]
    ).toEqual({ compte: "1020", debit: 0, credit: 19.9 });
    expect(
      lignesEcritureDepense({ compte_charge: "6570", montant: 19.9, mode_paiement: "twint" })[1]
    ).toEqual({ compte: "1020", debit: 0, credit: 19.9 });
  });

  it("toute écriture est équilibrée", () => {
    for (const mode of ["banque", "caisse", "carte", "twint", "a_payer"] as const) {
      for (const montant of [0.05, 42.5, 1200, 9999.99]) {
        const l = lignesEcritureDepense({ compte_charge: "6700", montant, mode_paiement: mode });
        expect(equilibre(l)).toBe(0);
      }
    }
  });

  it("arrondit au centime", () => {
    const l = lignesEcritureDepense({
      compte_charge: "6700",
      montant: 10.005,
      mode_paiement: "banque",
    });
    expect(l[0].debit).toBe(10.01);
    expect(equilibre(l)).toBe(0);
  });

  it("refuse un montant nul ou négatif", () => {
    expect(() =>
      lignesEcritureDepense({ compte_charge: "6700", montant: 0, mode_paiement: "banque" })
    ).toThrow(/strictement positif/);
    expect(() =>
      lignesEcritureDepense({ compte_charge: "6700", montant: -5, mode_paiement: "banque" })
    ).toThrow(/strictement positif/);
  });

  it("refuse une dépense sans compte de charge", () => {
    expect(() =>
      lignesEcritureDepense({ compte_charge: "", montant: 10, mode_paiement: "banque" })
    ).toThrow(/Compte de charge/);
  });
});

describe("lignesEcritureReglement — « à payer » puis payé", () => {
  it("règlement par banque : D 2000 / C 1020", () => {
    expect(lignesEcritureReglement({ montant: 310, mode: "banque" })).toEqual([
      { compte: "2000", debit: 310, credit: 0 },
      { compte: "1020", debit: 0, credit: 310 },
    ]);
  });

  it("règlement en espèces : D 2000 / C 1000", () => {
    expect(lignesEcritureReglement({ montant: 310, mode: "caisse" })).toEqual([
      { compte: "2000", debit: 310, credit: 0 },
      { compte: "1000", debit: 0, credit: 310 },
    ]);
  });

  it("le cycle complet laisse 2000 à zéro et la charge portée par la liquidité", () => {
    const dette = lignesEcritureDepense({
      compte_charge: "4400",
      montant: 310,
      mode_paiement: "a_payer",
    });
    const reglement = lignesEcritureReglement({ montant: 310, mode: "banque" });
    const toutes = [...dette, ...reglement];

    const solde = (compte: string) =>
      toutes
        .filter((l) => l.compte === compte)
        .reduce((s, l) => s + l.debit - l.credit, 0);

    expect(solde("2000")).toBe(0);
    expect(solde("4400")).toBe(310);
    expect(solde("1020")).toBe(-310);
    expect(equilibre(toutes)).toBe(0);
  });
});

describe("peutValiderDepense", () => {
  const base = { statut: "brouillon", montant: 100, compte_charge: "6000" };

  it("refuse sans pièce, avec le message affiché sous le bouton", () => {
    const d = peutValiderDepense({ ...base, nbPieces: 0 });
    expect(d.autorise).toBe(false);
    expect(!d.autorise && d.message).toBe(MESSAGE_JUSTIFICATIF_REQUIS);
  });

  it("accepte dès qu'une pièce est là", () => {
    expect(peutValiderDepense({ ...base, nbPieces: 1 })).toEqual({ autorise: true });
    expect(peutValiderDepense({ ...base, nbPieces: 3 })).toEqual({ autorise: true });
  });

  it("refuse ce qui n'est plus un brouillon", () => {
    for (const statut of ["validee", "payee", "annulee"]) {
      expect(peutValiderDepense({ ...base, statut, nbPieces: 1 }).autorise).toBe(false);
    }
  });

  it("refuse sans catégorie ni montant", () => {
    expect(peutValiderDepense({ ...base, compte_charge: null, nbPieces: 1 }).autorise).toBe(false);
    expect(peutValiderDepense({ ...base, montant: 0, nbPieces: 1 }).autorise).toBe(false);
  });
});

describe("refusFichierPiece", () => {
  it("accepte photo et PDF", () => {
    for (const type of ["image/jpeg", "image/png", "image/heic", "application/pdf"]) {
      expect(refusFichierPiece({ type, size: 1024 })).toBeNull();
    }
  });

  it("refuse un format non prévu", () => {
    expect(refusFichierPiece({ type: "text/csv", size: 10 })).toMatch(/Format accepté/);
  });

  it("refuse au-delà de 10 Mo", () => {
    expect(refusFichierPiece({ type: "image/jpeg", size: TAILLE_MAX_PIECE + 1 })).toMatch(/trop lourd/);
    expect(refusFichierPiece({ type: "image/jpeg", size: TAILLE_MAX_PIECE })).toBeNull();
  });

  it("refuse un fichier vide", () => {
    expect(refusFichierPiece({ type: "image/jpeg", size: 0 })).toBe("Fichier vide.");
  });

  it("donne l'extension du dépôt", () => {
    expect(extensionPiece("image/jpeg")).toBe("jpg");
    expect(extensionPiece("application/pdf")).toBe("pdf");
    expect(extensionPiece("image/gif")).toBe("bin");
  });
});
