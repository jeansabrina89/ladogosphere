import { describe, it, expect } from "vitest";
import { peutReserverPension, MESSAGE_ESSAI_REQUIS } from "../src/lib/adhesionReservation";

const base = {
  estMembreAJour: false,
  estExempte: false,
  essaiTermine: true,
  typeReservation: "sejour",
  estAdmin: false,
};

describe("peutReserverPension", () => {
  it("client, essai non terminé → bloqué (raison essai_non_termine)", () => {
    expect(peutReserverPension({ ...base, essaiTermine: false })).toEqual({
      autorise: false, bundlerAdhesion: false, raison: "essai_non_termine",
    });
  });

  it("client, essai terminé, non-membre non-exempté → autorisé + bundling", () => {
    expect(peutReserverPension({ ...base })).toEqual({
      autorise: true, bundlerAdhesion: true, raison: "ok",
    });
  });

  it("client exempté → autorisé sans bundling", () => {
    expect(peutReserverPension({ ...base, estExempte: true })).toEqual({
      autorise: true, bundlerAdhesion: false, raison: "ok",
    });
  });

  it("client membre à jour → autorisé sans re-bundling", () => {
    expect(peutReserverPension({ ...base, estMembreAJour: true })).toEqual({
      autorise: true, bundlerAdhesion: false, raison: "ok",
    });
  });

  it("admin → autorisé sans blocage ni bundling (même sans essai)", () => {
    expect(peutReserverPension({ ...base, estAdmin: true, essaiTermine: false })).toEqual({
      autorise: true, bundlerAdhesion: false, raison: "ok",
    });
  });

  it("journée d'essai → toujours autorisée sans bundling", () => {
    expect(peutReserverPension({ ...base, typeReservation: "essai", essaiTermine: false })).toEqual({
      autorise: true, bundlerAdhesion: false, raison: "ok",
    });
  });

  it("le message d'essai requis mentionne la journée d'essai", () => {
    expect(MESSAGE_ESSAI_REQUIS.toLowerCase()).toContain("essai");
  });
});
