import { describe, it, expect } from "vitest";
import {
  decisionFicheClient,
  normaliserEmail,
  validerIdentiteInscription,
  MESSAGE_EMAIL_DEJA_UTILISE,
  type FicheClientExistante,
} from "../src/lib/inscriptionClient";

const IDENTITE = { prenom: "Camille", nom: "Rochat", telephone: "+41 79 111 22 33" };
const MOI = "11111111-1111-1111-1111-111111111111";
const AUTRE = "22222222-2222-2222-2222-222222222222";

const fiche = (p: Partial<FicheClientExistante> = {}): FicheClientExistante => ({
  id: "fiche-1",
  auth_user_id: null,
  prenom: null,
  nom: null,
  telephone: null,
  ...p,
});

describe("decisionFicheClient — aucune fiche", () => {
  it("crée une fiche", () => {
    expect(decisionFicheClient({ fiche: null, authUserId: MOI, identite: IDENTITE })).toEqual({
      action: "creer",
    });
  });
});

describe("decisionFicheClient — fiche libre", () => {
  it("lie la fiche et complète les champs vides", () => {
    expect(decisionFicheClient({ fiche: fiche(), authUserId: MOI, identite: IDENTITE })).toEqual({
      action: "lier",
      id: "fiche-1",
      champs: { prenom: "Camille", nom: "Rochat", telephone: "+41 79 111 22 33" },
    });
  });

  it("n'écrase JAMAIS les champs déjà renseignés par la pension", () => {
    const existante = fiche({ prenom: "Cam", nom: "Rochat-Dupuis", telephone: "021 000 00 00" });
    expect(decisionFicheClient({ fiche: existante, authUserId: MOI, identite: IDENTITE })).toEqual({
      action: "lier",
      id: "fiche-1",
      champs: {},
    });
  });

  it("ne complète que ce qui manque", () => {
    const existante = fiche({ prenom: "Cam", nom: null, telephone: null });
    const d = decisionFicheClient({ fiche: existante, authUserId: MOI, identite: IDENTITE });
    expect(d).toEqual({
      action: "lier",
      id: "fiche-1",
      champs: { nom: "Rochat", telephone: "+41 79 111 22 33" },
    });
  });

  it("traite une chaîne blanche comme un champ vide", () => {
    const existante = fiche({ prenom: "   ", nom: "" });
    const d = decisionFicheClient({ fiche: existante, authUserId: MOI, identite: IDENTITE });
    expect(d).toMatchObject({ action: "lier", champs: { prenom: "Camille", nom: "Rochat" } });
  });

  it("ne pose pas de téléphone si l'utilisateur n'en a pas donné", () => {
    const d = decisionFicheClient({
      fiche: fiche(),
      authUserId: MOI,
      identite: { prenom: "Camille", nom: "Rochat", telephone: "" },
    });
    expect(d).toEqual({ action: "lier", id: "fiche-1", champs: { prenom: "Camille", nom: "Rochat" } });
  });

  it("nettoie les espaces autour des valeurs complétées", () => {
    const d = decisionFicheClient({
      fiche: fiche(),
      authUserId: MOI,
      identite: { prenom: "  Camille  ", nom: "  Rochat ", telephone: " 079 " },
    });
    expect(d).toMatchObject({ champs: { prenom: "Camille", nom: "Rochat", telephone: "079" } });
  });
});

describe("decisionFicheClient — fiche déjà liée", () => {
  it("refuse si la fiche appartient à un AUTRE compte", () => {
    const d = decisionFicheClient({
      fiche: fiche({ auth_user_id: AUTRE }),
      authUserId: MOI,
      identite: IDENTITE,
    });
    expect(d).toEqual({ action: "refus", message: MESSAGE_EMAIL_DEJA_UTILISE });
    expect(MESSAGE_EMAIL_DEJA_UTILISE).toContain("Mot de passe oublié");
  });

  it("accepte (idempotent) si la fiche est DÉJÀ liée au MÊME compte", () => {
    const d = decisionFicheClient({
      fiche: fiche({ auth_user_id: MOI }),
      authUserId: MOI,
      identite: IDENTITE,
    });
    expect(d).toMatchObject({ action: "lier", id: "fiche-1" });
  });

  it("complète les champs vides d'une fiche déjà liée au même compte", () => {
    const d = decisionFicheClient({
      fiche: fiche({ auth_user_id: MOI, prenom: "Cam" }),
      authUserId: MOI,
      identite: IDENTITE,
    });
    expect(d).toMatchObject({ action: "lier", champs: { nom: "Rochat" } });
  });
});

describe("normaliserEmail", () => {
  it("met en minuscules et retire les espaces", () => {
    expect(normaliserEmail("  Camille.Rochat@Example.COM ")).toBe("camille.rochat@example.com");
  });
  it("tolère null et undefined", () => {
    expect(normaliserEmail(null)).toBe("");
    expect(normaliserEmail(undefined)).toBe("");
  });
  it("deux graphies du même e-mail se rejoignent", () => {
    expect(normaliserEmail("A@B.CH")).toBe(normaliserEmail("a@b.ch"));
  });
});

describe("validerIdentiteInscription", () => {
  it("accepte prénom + nom", () => {
    expect(validerIdentiteInscription({ prenom: "Camille", nom: "Rochat" })).toBeNull();
  });
  it("le téléphone est facultatif", () => {
    expect(validerIdentiteInscription({ prenom: "Camille", nom: "Rochat", telephone: "" })).toBeNull();
  });
  it("refuse un prénom vide ou blanc", () => {
    expect(validerIdentiteInscription({ prenom: "", nom: "Rochat" })).toBe("Le prénom est obligatoire.");
    expect(validerIdentiteInscription({ prenom: "  ", nom: "Rochat" })).toBe("Le prénom est obligatoire.");
  });
  it("refuse un nom vide", () => {
    expect(validerIdentiteInscription({ prenom: "Camille", nom: "" })).toBe("Le nom est obligatoire.");
  });
});
