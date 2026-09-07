import { describe, it, expect } from "vitest";
import {
  etatFacture,
  libelleEtatFacture,
  statutApresPaiement,
  libelleMode,
  libelleCompteProduit,
  COMPTES_PRODUIT,
  MODES_ENCAISSEMENT,
} from "../src/lib/factureStatut";

const AUJ = "2026-09-07";

describe("état affiché d'une facture", () => {
  it("sans numéro : brouillon", () => {
    expect(etatFacture({ statut: "brouillon", numero: null }, AUJ)).toBe("brouillon");
  });

  it("émise, non échue : envoyée", () => {
    expect(etatFacture(
      { statut: "envoyee", numero: "FAC-2026-0001", date_echeance: "2026-10-01", montant_restant: 250 },
      AUJ,
    )).toBe("envoyee");
  });

  it("échéance dépassée et reste dû : en retard (calculé, jamais stocké)", () => {
    expect(etatFacture(
      { statut: "envoyee", numero: "FAC-2026-0001", date_echeance: "2026-09-06", montant_restant: 250 },
      AUJ,
    )).toBe("en_retard");
  });

  it("échéance dépassée mais soldée : payée", () => {
    expect(etatFacture(
      { statut: "acquittee", numero: "FAC-2026-0001", date_echeance: "2026-01-01", montant_restant: 0 },
      AUJ,
    )).toBe("payee");
  });

  it("le jour même de l'échéance n'est pas en retard", () => {
    expect(etatFacture(
      { statut: "envoyee", numero: "FAC-2026-0001", date_echeance: AUJ, montant_restant: 250 },
      AUJ,
    )).toBe("envoyee");
  });

  it("partiellement payée et pas échue", () => {
    expect(etatFacture(
      { statut: "partiellement_reglee", numero: "FAC-2026-0001", date_echeance: "2026-12-01", montant_restant: 100 },
      AUJ,
    )).toBe("partiellement_payee");
  });

  it("partiellement payée et échue : en retard l'emporte", () => {
    expect(etatFacture(
      { statut: "partiellement_reglee", numero: "FAC-2026-0001", date_echeance: "2026-01-01", montant_restant: 100 },
      AUJ,
    )).toBe("en_retard");
  });

  it("annulée par avoir : annulée", () => {
    expect(etatFacture({ statut: "annulee_par_avoir", numero: "FAC-2026-0001" }, AUJ)).toBe("annulee");
  });

  it("un avoir s'affiche comme avoir, quel que soit son statut", () => {
    expect(etatFacture({ type: "avoir", statut: "envoyee", numero: "AV-2026-0001" }, AUJ)).toBe("avoir");
  });

  it("sans échéance renseignée, jamais « en retard »", () => {
    expect(etatFacture(
      { statut: "envoyee", numero: "FAC-2026-0001", date_echeance: null, montant_restant: 250 },
      AUJ,
    )).toBe("envoyee");
  });
});

describe("vocabulaire à l'écran", () => {
  it("« Payée » — jamais « réglée » ni « acquittée »", () => {
    expect(libelleEtatFacture("payee")).toBe("Payée");
    const tous = (["brouillon", "envoyee", "en_retard", "partiellement_payee", "payee", "annulee", "avoir"] as const)
      .map(libelleEtatFacture)
      .join(" ");
    expect(tous).not.toMatch(/réglée|acquittée/i);
  });

  it("« Espèces » et « Virement », pas « cash » ni « iban »", () => {
    expect(libelleMode("cash")).toBe("Espèces");
    expect(libelleMode("virement")).toBe("Virement");
    expect(libelleMode("twint")).toBe("TWINT");
    expect(libelleMode("carte")).toBe("Carte");
    expect(libelleMode("avoir")).toBe("Avoir");
  });

  it("les modes proposés sont exactement les cinq du composant d'encaissement", () => {
    expect(MODES_ENCAISSEMENT.map((m) => m.valeur)).toEqual(["cash", "twint", "carte", "virement", "avoir"]);
  });

  it("« Adhésion », pas « Cotisation »", () => {
    expect(libelleCompteProduit("3005")).toBe("Adhésion");
    expect(COMPTES_PRODUIT.map((c) => c.libelle).join(" ")).not.toMatch(/cotisation/i);
  });

  it("chaque compte de produit proposé a un libellé français", () => {
    for (const c of COMPTES_PRODUIT) {
      expect(c.libelle).not.toBe(c.numero);
      expect(c.libelle.length).toBeGreaterThan(2);
    }
  });
});

describe("statut écrit en base après encaissement", () => {
  it("rien payé : la facture reste envoyée", () => {
    expect(statutApresPaiement(0, 250)).toBe("envoyee");
  });
  it("paiement partiel", () => {
    expect(statutApresPaiement(100, 250)).toBe("partiellement_reglee");
  });
  it("paiement complet", () => {
    expect(statutApresPaiement(250, 250)).toBe("acquittee");
  });
  it("trop-perçu compte comme payé", () => {
    expect(statutApresPaiement(260, 250)).toBe("acquittee");
  });
  it("facture à 0 : payée dès qu'un montant nul est constaté", () => {
    expect(statutApresPaiement(0, 0)).toBe("envoyee");
  });
});
