import { describe, it, expect } from "vitest";
import { etatAdhesion } from "../src/lib/cotisation";

describe("etatAdhesion — état d'adhésion pour l'affichage admin", () => {
  it("aucune cotisation → aucune", () => {
    expect(etatAdhesion(null)).toBe("aucune");
    expect(etatAdhesion(undefined)).toBe("aucune");
  });

  it("cotisation payée → payee (affichage verrouillé)", () => {
    expect(etatAdhesion({ statut: "payee" })).toBe("payee");
  });

  it("cotisation en attente → en_attente (encaissable, pas verrouillée)", () => {
    expect(etatAdhesion({ statut: "en_attente" })).toBe("en_attente");
  });

  it("tout statut non 'payee' sur une ligne existante → en_attente", () => {
    expect(etatAdhesion({ statut: "autre" })).toBe("en_attente");
    expect(etatAdhesion({ statut: null })).toBe("en_attente");
  });
});
