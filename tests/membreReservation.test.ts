import { describe, it, expect } from "vitest";
import { cotisationDonneAccesReservation } from "../src/lib/membre";

describe("cotisationDonneAccesReservation — droit à réserver", () => {
  it("payee → à jour", () => {
    expect(cotisationDonneAccesReservation({ statut: "payee", mode_paiement: "virement" })).toBe(true);
    expect(cotisationDonneAccesReservation({ statut: "payee", mode_paiement: null })).toBe(true);
  });

  it("en_attente + prochaine_resa → à jour (groupée / activée)", () => {
    expect(cotisationDonneAccesReservation({ statut: "en_attente", mode_paiement: "prochaine_resa" })).toBe(true);
  });

  it("en_attente + virement → PAS à jour (demande non payée)", () => {
    expect(cotisationDonneAccesReservation({ statut: "en_attente", mode_paiement: "virement" })).toBe(false);
  });

  it("en_attente + cash → PAS à jour", () => {
    expect(cotisationDonneAccesReservation({ statut: "en_attente", mode_paiement: "cash" })).toBe(false);
  });

  it("en_attente sans mode → PAS à jour", () => {
    expect(cotisationDonneAccesReservation({ statut: "en_attente", mode_paiement: null })).toBe(false);
  });

  it("statut inconnu / annulée → PAS à jour", () => {
    expect(cotisationDonneAccesReservation({ statut: "annulee", mode_paiement: "prochaine_resa" })).toBe(false);
    expect(cotisationDonneAccesReservation({})).toBe(false);
  });
});
