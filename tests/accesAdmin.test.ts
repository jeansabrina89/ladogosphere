import { describe, it, expect } from "vitest";
import { deciderAccesAdmin, PERMISSIONS_PERSONNEL } from "@/src/lib/accesAdmin";

/** Toutes les permissions à true — l'état qu'avaient les profils clients. */
const TOUTES_VRAIES = Object.fromEntries(PERMISSIONS_PERSONNEL.map((p) => [p, true]));

describe("deciderAccesAdmin", () => {
  it("sans session, renvoie vers /login", () => {
    expect(deciderAccesAdmin({ connecte: false })).toMatchObject({
      autorise: false,
      redirection: "/login",
    });
  });

  it("refuse un client, même avec toutes les permissions à true", () => {
    const d = deciderAccesAdmin({ connecte: true, role: "client", permissions: TOUTES_VRAIES });
    expect(d).toMatchObject({ autorise: false, redirection: "/mon-compte" });
  });

  it("refuse un client sur un écran à permission, même avec la permission à true", () => {
    const d = deciderAccesAdmin(
      { connecte: true, role: "client", permissions: { perm_encaissements: true } },
      { permission: "perm_encaissements" }
    );
    expect(d).toMatchObject({ autorise: false, redirection: "/mon-compte" });
  });

  it("renvoie un client vers son espace, jamais vers « / » (qui est le tableau de bord admin)", () => {
    const d = deciderAccesAdmin({ connecte: true, role: "client" });
    expect(d).toMatchObject({ redirection: "/mon-compte" });
  });

  it("refuse un profil sans rôle", () => {
    expect(deciderAccesAdmin({ connecte: true, role: null })).toMatchObject({ autorise: false });
    expect(deciderAccesAdmin({ connecte: true })).toMatchObject({ autorise: false });
  });

  it("accepte l'admin sans permission demandée", () => {
    expect(deciderAccesAdmin({ connecte: true, role: "admin" })).toEqual({ autorise: true });
  });

  it("accepte l'admin quelle que soit la permission demandée, même à false", () => {
    const d = deciderAccesAdmin(
      { connecte: true, role: "admin", permissions: { perm_encaissements: false } },
      { permission: "perm_encaissements" }
    );
    expect(d).toEqual({ autorise: true });
  });

  it("accepte un employé sur un écran sans permission particulière", () => {
    expect(deciderAccesAdmin({ connecte: true, role: "employe", permissions: {} })).toEqual({
      autorise: true,
    });
  });

  it("accepte un employé qui a la permission", () => {
    const d = deciderAccesAdmin(
      { connecte: true, role: "employe", permissions: { perm_encaissements: true } },
      { permission: "perm_encaissements" }
    );
    expect(d).toEqual({ autorise: true });
  });

  it("refuse un employé qui n'a pas la permission", () => {
    const d = deciderAccesAdmin(
      { connecte: true, role: "employe", permissions: { perm_encaissements: false } },
      { permission: "perm_encaissements" }
    );
    expect(d).toMatchObject({ autorise: false, redirection: "/" });
  });

  it("refuse un employé quand la permission est absente du profil", () => {
    const d = deciderAccesAdmin(
      { connecte: true, role: "employe", permissions: {} },
      { permission: "perm_box" }
    );
    expect(d).toMatchObject({ autorise: false, redirection: "/" });
  });

  it("ne prend une permission pour vraie que si elle vaut exactement true", () => {
    for (const valeur of ["true", 1, {}, "oui"]) {
      const d = deciderAccesAdmin(
        { connecte: true, role: "employe", permissions: { perm_checkin: valeur } },
        { permission: "perm_checkin" }
      );
      expect(d).toMatchObject({ autorise: false });
    }
  });

  it("refuse tout employé sur un écran réservé à l'admin", () => {
    const d = deciderAccesAdmin(
      { connecte: true, role: "employe", permissions: TOUTES_VRAIES },
      { adminSeul: true }
    );
    expect(d).toMatchObject({ autorise: false, redirection: "/" });
  });

  it("laisse passer l'admin sur un écran réservé à l'admin", () => {
    expect(deciderAccesAdmin({ connecte: true, role: "admin" }, { adminSeul: true })).toEqual({
      autorise: true,
    });
  });
});
