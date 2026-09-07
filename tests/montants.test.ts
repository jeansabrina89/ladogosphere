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

  // Le piège du CA facturé : la carte de comptabilité rajoutait l'ajustement
  // manuel APRÈS le helper, alors que celui-ci l'a déjà appliqué.
  it("l'ajustement manuel n'est compté qu'une fois, jamais deux", () => {
    const resa = { montant_final: null, montant_calcule: 100, ajustement_manuel: -30 };
    const parLeHelper = montantDuReservation(resa);
    const ancienCalculFautif =
      Number(resa.montant_final ?? resa.montant_calcule ?? 0) + Number(resa.ajustement_manuel ?? 0);

    expect(parLeHelper).toBe(70);
    expect(ancienCalculFautif).toBe(70); // par hasard identique tant que montant_final est nul…
  });

  it("dès que montant_final est figé, l'ancien calcul comptait le geste deux fois", () => {
    // montant_final = 100 - 30 : le geste commercial est DÉJÀ dedans.
    const resa = { montant_final: 70, montant_calcule: 100, ajustement_manuel: -30 };
    const ancienCalculFautif =
      Number(resa.montant_final ?? resa.montant_calcule ?? 0) + Number(resa.ajustement_manuel ?? 0);

    expect(montantDuReservation(resa)).toBe(70);
    expect(ancienCalculFautif).toBe(40);
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
