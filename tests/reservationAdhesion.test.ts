import { describe, it, expect } from "vitest";
import { reservationAutorisee, MESSAGE_ADHESION_REQUISE } from "../src/lib/membre";

describe("reservationAutorisee — adhésion obligatoire pour réserver", () => {
  it("non-membre normal (journée) → refusé", () => {
    expect(reservationAutorisee({
      estMembre: false, estExempte: false, typeReservation: "journee",
    })).toBe(false);
  });

  it("non-membre normal (séjour) → refusé", () => {
    expect(reservationAutorisee({
      estMembre: false, estExempte: false, typeReservation: "sejour",
    })).toBe(false);
  });

  it("non-membre mais journée d'essai → autorisé", () => {
    expect(reservationAutorisee({
      estMembre: false, estExempte: false, typeReservation: "essai",
    })).toBe(true);
  });

  it("client exempté de cotisation → autorisé (même en séjour)", () => {
    expect(reservationAutorisee({
      estMembre: false, estExempte: true, typeReservation: "sejour",
    })).toBe(true);
  });

  it("membre à jour → autorisé", () => {
    expect(reservationAutorisee({
      estMembre: true, estExempte: false, typeReservation: "journee",
    })).toBe(true);
  });

  it("le message de blocage cite la cotisation de 200.-", () => {
    expect(MESSAGE_ADHESION_REQUISE).toContain("200");
  });
});
