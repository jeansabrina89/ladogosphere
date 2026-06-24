import { describe, it, expect } from "vitest";
import { montantDuReservation, resteAPayer } from "../src/lib/montants";

describe("montantDuReservation", () => {
  it("retourne montant_final quand renseigné", () => {
    expect(montantDuReservation({ montant_final: 150 })).toBe(150);
  });

  it("retourne 0 quand montant_final vaut 0 (valeur explicite)", () => {
    expect(montantDuReservation({ montant_final: 0, montant_calcule: 100 })).toBe(0);
  });

  it("repli sur montant_calcule + ajustement si montant_final est null", () => {
    expect(montantDuReservation({ montant_final: null, montant_calcule: 80, ajustement_manuel: 20 })).toBe(100);
  });

  it("repli si montant_final est undefined", () => {
    expect(montantDuReservation({ montant_calcule: 60 })).toBe(60);
  });

  it("repli si montant_final est chaîne vide", () => {
    expect(montantDuReservation({ montant_final: "", montant_calcule: 60, ajustement_manuel: 5 })).toBe(65);
  });

  it("ajustement_manuel absent = 0", () => {
    expect(montantDuReservation({ montant_calcule: 70 })).toBe(70);
  });
});

describe("resteAPayer", () => {
  it("montant_final - montant_paye", () => {
    expect(resteAPayer({ montant_final: 100, montant_paye: 40 })).toBe(60);
  });

  it("zéro quand tout est payé", () => {
    expect(resteAPayer({ montant_final: null, montant_calcule: 80, montant_paye: 80 })).toBe(0);
  });

  it("valeur négative si trop-perçu", () => {
    expect(resteAPayer({ montant_final: 50, montant_paye: 60 })).toBe(-10);
  });
});
