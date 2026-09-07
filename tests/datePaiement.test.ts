import { describe, it, expect } from "vitest";
import { verifierDatePaiement } from "../src/lib/datePaiement";

const bornes = {
  datePiece: "2026-03-10",
  aujourdhui: "2026-09-06",
  exercicesOuverts: [2025, 2026],
};

describe("bornes de date de paiement", () => {
  it("une date entre la pièce et aujourd'hui passe", () => {
    expect(verifierDatePaiement("2026-04-01", bornes)).toEqual({ ok: true });
  });

  it("le jour même de la réservation passe", () => {
    expect(verifierDatePaiement("2026-03-10", bornes)).toEqual({ ok: true });
  });

  it("aujourd'hui passe", () => {
    expect(verifierDatePaiement("2026-09-06", bornes)).toEqual({ ok: true });
  });

  it("avant la réservation : refusé", () => {
    const v = verifierDatePaiement("2026-03-09", bornes);
    expect(v.ok).toBe(false);
    expect(v.ok === false && v.message).toContain("antérieure");
    expect(v.ok === false && v.message).toContain("10.03.2026");
  });

  it("dans le futur : refusé", () => {
    const v = verifierDatePaiement("2026-09-07", bornes);
    expect(v.ok).toBe(false);
    expect(v.ok === false && v.message).toContain("futur");
  });

  it("exercice clôturé : refusé", () => {
    const v = verifierDatePaiement("2024-12-31", {
      ...bornes,
      datePiece: "2024-01-01",
    });
    expect(v.ok).toBe(false);
    expect(v.ok === false && v.message).toContain("2024");
    expect(v.ok === false && v.message).toContain("clôturé");
  });

  it("exercice ouvert antérieur : accepté", () => {
    expect(
      verifierDatePaiement("2025-06-01", { ...bornes, datePiece: "2025-05-01" }),
    ).toEqual({ ok: true });
  });

  it("date absente ou mal formée : refusé", () => {
    for (const d of [null, undefined, "", "01.04.2026", "2026-4-1", "n'importe quoi"]) {
      const v = verifierDatePaiement(d as string | null, bornes);
      expect(v.ok).toBe(false);
      expect(v.ok === false && v.message).toBe("Date de paiement invalide.");
    }
  });

  it("un horodatage complet est accepté (on ne garde que le jour)", () => {
    expect(verifierDatePaiement("2026-04-01T14:32:00Z", bornes)).toEqual({ ok: true });
  });

  it("sans date de pièce, seules les bornes haute et d'exercice s'appliquent", () => {
    const sansPiece = { ...bornes, datePiece: null };
    expect(verifierDatePaiement("2025-01-01", sansPiece)).toEqual({ ok: true });
    expect(verifierDatePaiement("2027-01-01", sansPiece).ok).toBe(false);
  });

  it("aucun exercice ouvert : tout est refusé", () => {
    const v = verifierDatePaiement("2026-04-01", { ...bornes, exercicesOuverts: [] });
    expect(v.ok).toBe(false);
  });
});
