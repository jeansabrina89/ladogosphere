import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { decisionProfilPourFiche, estPersonnel } from "@/src/lib/profilPourFicheClient";

/**
 * Créer une fiche client ne rétrograde jamais un membre du personnel.
 *
 * Relevé pendant APP 17 : l'admin créait une fiche pour l'adresse d'un compte
 * existant, et `profiles.role` passait à « client » sans condition. Une
 * employée y perdait son espace de travail.
 */

describe("le rôle du profil décide", () => {
  it("un compte sans profil reçoit « client », fiche ordinaire", () => {
    expect(decisionProfilPourFiche(null)).toEqual({ roleAPoser: "client", ficheInterne: false });
    expect(decisionProfilPourFiche(undefined)).toEqual({ roleAPoser: "client", ficheInterne: false });
    expect(decisionProfilPourFiche("")).toEqual({ roleAPoser: "client", ficheInterne: false });
  });

  it("un client reste client", () => {
    expect(decisionProfilPourFiche("client")).toEqual({ roleAPoser: "client", ficheInterne: false });
  });

  it("une employée n’est JAMAIS rétrogradée, et sa fiche naît interne", () => {
    expect(decisionProfilPourFiche("employe")).toEqual({ roleAPoser: null, ficheInterne: true });
  });

  it("l’administratrice n’est JAMAIS rétrogradée, et sa fiche naît interne", () => {
    expect(decisionProfilPourFiche("admin")).toEqual({ roleAPoser: null, ficheInterne: true });
  });

  it("les espaces autour du rôle ne changent rien", () => {
    expect(decisionProfilPourFiche("  admin ")).toEqual({ roleAPoser: null, ficheInterne: true });
    expect(estPersonnel(" employe ")).toBe(true);
    expect(estPersonnel("cliente")).toBe(false);
  });
});

describe("l’action de création applique la décision", () => {
  const SOURCE = readFileSync(
    join(__dirname, "..", "app", "(admin)", "(espace-clients)", "clients", "nouveau", "actions.ts"),
    "utf8"
  );

  it("le rôle n’est plus écrit en dur", () => {
    // C'était la ligne fautive : `role: "client"` sans condition.
    expect(SOURCE).not.toMatch(/role:\s*"client"/);
    expect(SOURCE).toContain("decisionProfilPourFiche(");
  });

  it("le profil n’est touché que si un rôle est à poser", () => {
    expect(SOURCE).toContain("decision.roleAPoser");
    expect(SOURCE).toMatch(/if \(auth_user_id && decision\.roleAPoser\)/);
  });

  it("la fiche naît interne quand le compte est du personnel", () => {
    expect(SOURCE).toContain("interne: decision.ficheInterne");
  });
});
