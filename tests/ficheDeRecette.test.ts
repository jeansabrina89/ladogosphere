import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  MESSAGE_FICHE_DE_RECETTE,
  estAdresseDeTest,
  estFicheDeRecette,
  refusRattachementFiche,
} from "@/src/lib/ficheDeRecette";

/**
 * Une fiche de recette ne reçoit jamais le compte d'une vraie personne.
 *
 * C'est arrivé le 7 septembre 2026 : le compte admin s'est retrouvé sur
 * « Recette ZZ Contrôle recette boutique », et pendant huit jours l'espace
 * client a montré les factures de la recette.
 */

const COMPTE = "09058120-fcde-4af0-979b-9811e52d1ebe";
const REELLE = "ladogosphere@gmail.com";

describe("reconnaître une fiche de recette", () => {
  it("une adresse en .test ou .invalid la désigne", () => {
    expect(estFicheDeRecette({ email: "recette15-mtruqfj2@exemple.test" })).toBe(true);
    expect(estFicheDeRecette({ email: "zz-app17@ladogosphere.invalid" })).toBe(true);
    expect(estFicheDeRecette({ email: "  RECETTE@EXEMPLE.TEST " })).toBe(true);
  });

  it("un nom ou un prénom commençant par ZZ la désigne aussi", () => {
    expect(estFicheDeRecette({ nom: "ZZ Contrôle recette boutique" })).toBe(true);
    expect(estFicheDeRecette({ prenom: "ZZ17 Client" })).toBe(true);
    expect(estFicheDeRecette({ nom: "  zz minuscule " })).toBe(true);
  });

  it("une vraie fiche n’est jamais désignée", () => {
    expect(estFicheDeRecette({ email: REELLE, prenom: "Sabrina", nom: "Jean" })).toBe(false);
    expect(estFicheDeRecette({ email: "camille@example.com", nom: "Dupont" })).toBe(false);
    expect(estFicheDeRecette(null)).toBe(false);
    expect(estFicheDeRecette({})).toBe(false);
  });

  it("« .test » doit terminer l’adresse, pas y apparaître", () => {
    expect(estAdresseDeTest("essai.test@example.com")).toBe(false);
    expect(estAdresseDeTest("client@test.example.com")).toBe(false);
    expect(estAdresseDeTest(null)).toBe(false);
  });
});

describe("le rattachement d’un compte à une fiche", () => {
  it("REFUSE un compte réel sur une fiche de recette", () => {
    // Le défaut exact qui a été reproduit.
    const refus = refusRattachementFiche({
      fiche: { email: "recette15-mtruqfj2@exemple.test", prenom: "Recette", nom: "ZZ Contrôle recette boutique" },
      authUserId: COMPTE,
      emailCompte: REELLE,
    });
    expect(refus).toBe(MESSAGE_FICHE_DE_RECETTE);
  });

  it("refuse aussi sur le seul nom en ZZ, adresse réelle", () => {
    expect(refusRattachementFiche({
      fiche: { email: "essai@example.com", nom: "ZZ Fiche de contrôle" },
      authUserId: COMPTE,
      emailCompte: REELLE,
    })).toBe(MESSAGE_FICHE_DE_RECETTE);
  });

  it("laisse passer un compte de recette sur une fiche de recette", () => {
    // Sans cela, le garde-fou casserait la recette au lieu de la protéger.
    expect(refusRattachementFiche({
      fiche: { email: "zz-app17-pension@ladogosphere.invalid", prenom: "ZZ17 Client" },
      authUserId: "e13a72bd-018b-4563-8891-f45bef106e9b",
      emailCompte: "zz-app17-pension@ladogosphere.invalid",
    })).toBeNull();
  });

  it("laisse passer une vraie fiche pour un vrai compte", () => {
    expect(refusRattachementFiche({
      fiche: { email: REELLE, prenom: "Sabrina", nom: "Jean" },
      authUserId: COMPTE,
      emailCompte: REELLE,
    })).toBeNull();
  });

  it("DÉTACHER n’est jamais refusé : c’est le geste de réparation", () => {
    for (const authUserId of [null, undefined, ""]) {
      expect(refusRattachementFiche({
        fiche: { email: "recette@exemple.test", nom: "ZZ Contrôle" },
        authUserId,
        emailCompte: REELLE,
      })).toBeNull();
    }
  });
});

// ── Le dépôt : aucune voie d'écriture n'échappe au garde-fou ───────────────

const RACINE = join(__dirname, "..");

function fichiers(dossier: string): string[] {
  const trouves: string[] = [];
  for (const entree of readdirSync(dossier)) {
    if (entree === "node_modules" || entree === ".next") continue;
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) trouves.push(...fichiers(chemin));
    else if (/[.]tsx?$/.test(entree)) trouves.push(chemin);
  }
  return trouves;
}

const SOURCES = ["app", "src"]
  .flatMap((d) => fichiers(join(RACINE, d)))
  .map((chemin) => ({
    chemin: chemin.slice(RACINE.length + 1).split("\\").join("/"),
    contenu: readFileSync(chemin, "utf8"),
  }));

describe("toutes les voies d’écriture passent par le garde-fou", () => {
  it("le dépôt est bien relu (garde-fou du garde-fou)", () => {
    expect(SOURCES.length).toBeGreaterThan(200);
    expect(SOURCES.some((f) => f.chemin === "src/lib/ficheDeRecette.ts")).toBe(true);
  });

  it("tout fichier qui ÉCRIT un auth_user_id appelle refusRattachementFiche", () => {
    // Écrire, c'est poser la colonne dans l'objet d'un insert ou d'un update :
    // « auth_user_id: valeur, » ou la forme abrégée « auth_user_id, ». Ni un
    // `.eq()`, ni un `.select()`, ni un membre de type — qui finit par « ; ».
    const ECRITURE = /auth_user_id:\s*[^;\n]*,/;
    const ABREGE = /^\s*auth_user_id,\s*$/m;
    const ecrivains = SOURCES.filter(
      (f) =>
        (ECRITURE.test(f.contenu) || ABREGE.test(f.contenu)) &&
        f.chemin !== "src/lib/ficheDeRecette.ts"
    );
    // Au moins les trois voies connues, sinon le test ne prouve rien.
    expect(ecrivains.length).toBeGreaterThanOrEqual(3);

    const sansGardeFou = ecrivains
      .filter((f) => !f.contenu.includes("refusRattachementFiche("))
      .map((f) => f.chemin);
    expect(sansGardeFou).toEqual([]);
  });

  it("la migration qui pose le garde-fou en base est dans le dépôt", () => {
    // Le rattachement fautif venait d'un harnais en service_role, hors dépôt :
    // seul le contrôle en base l'aurait arrêté.
    const dossier = join(RACINE, "supabase", "migrations");
    const migration = readdirSync(dossier).find((n) =>
      n.endsWith("_clients_refuser_compte_reel_sur_fiche_de_recette.sql")
    );
    expect(migration).toBeDefined();

    const sql = readFileSync(join(dossier, migration!), "utf8");
    expect(sql).toContain("before insert or update of auth_user_id on public.clients");
    expect(sql).toContain("'%.test'");
    expect(sql).toContain("'%.invalid'");
    expect(sql).toContain("'ZZ%'");
  });
});
