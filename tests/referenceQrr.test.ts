import { describe, it, expect } from "vitest";
import { referenceQrrDepuisNumero } from "../src/lib/referenceQrr";

describe("referenceQrrDepuisNumero", () => {
  it("retourne exactement 27 chiffres", () => {
    expect(referenceQrrDepuisNumero("F2024-001")).toMatch(/^\d{27}$/);
  });

  it("est déterministe", () => {
    expect(referenceQrrDepuisNumero("F2024-001")).toBe(referenceQrrDepuisNumero("F2024-001"));
  });

  it("les lettres et tirets sont ignorés, seuls les chiffres comptent", () => {
    expect(referenceQrrDepuisNumero("F2024-001")).toBe(referenceQrrDepuisNumero("2024001"));
  });

  it("les 26 premiers caractères sont le numéro padé à gauche par des zéros", () => {
    const ref = referenceQrrDepuisNumero("1");
    expect(ref.slice(0, 26)).toBe("00000000000000000000000001");
    expect(ref).toHaveLength(27);
  });

  it("cas connu : '1' → checksum 1 (Mod10 récursif)", () => {
    expect(referenceQrrDepuisNumero("1")).toBe("000000000000000000000000011");
  });

  it("numéro vide : base de 26 zéros, checksum 0", () => {
    expect(referenceQrrDepuisNumero("")).toBe("000000000000000000000000000");
  });
});
