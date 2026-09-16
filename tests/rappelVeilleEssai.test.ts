import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  TYPES_RAPPEL_VEILLE,
  doitRecevoirRappelVeille,
  heureLisible,
  phrasesRappelVeilleEssai,
} from "@/src/lib/rappelVeilleLogique";

/**
 * Le rappel de la veille couvre désormais la journée d'essai, avec son propre
 * texte. La journée de garderie n'en reçoit toujours pas.
 */

const DEMAIN = "2026-09-17";

describe("qui reçoit le rappel", () => {
  it("un séjour validé qui commence demain → oui", () => {
    expect(doitRecevoirRappelVeille(
      { type_reservation: "sejour", statut: "validee", date_debut: DEMAIN }, DEMAIN
    )).toBe(true);
  });

  it("une journée d’essai validée demain → oui", () => {
    expect(doitRecevoirRappelVeille(
      { type_reservation: "essai", statut: "validee", date_debut: DEMAIN }, DEMAIN
    )).toBe(true);
  });

  it("une journée de garderie → jamais", () => {
    expect(doitRecevoirRappelVeille(
      { type_reservation: "journee", statut: "validee", date_debut: DEMAIN }, DEMAIN
    )).toBe(false);
    expect(TYPES_RAPPEL_VEILLE).not.toContain("journee");
  });

  it("une réservation non validée → jamais, séjour comme essai", () => {
    for (const statut of ["en_attente", "annulee", "refusee", "terminee", null]) {
      for (const type of ["sejour", "essai"]) {
        expect(doitRecevoirRappelVeille(
          { type_reservation: type, statut, date_debut: DEMAIN }, DEMAIN
        ), `${type} ${statut}`).toBe(false);
      }
    }
  });

  it("une réservation qui ne commence pas demain → non", () => {
    expect(doitRecevoirRappelVeille(
      { type_reservation: "essai", statut: "validee", date_debut: "2026-09-18" }, DEMAIN
    )).toBe(false);
  });
});

describe("le texte de l’essai", () => {
  it("dit le jour, l’heure et ce qu’il faut apporter", () => {
    expect(phrasesRappelVeilleEssai("Pixel", "10:00:00")).toEqual([
      "La journée d'essai de Pixel est demain, à 10 h.",
      "Merci d'apporter son carnet de vaccination et, si vous l'avez, ce qu'il mange d'habitude pour la journée.",
    ]);
  });

  it("sans heure enregistrée, c’est l’heure ordinaire : 10 h", () => {
    expect(phrasesRappelVeilleEssai("Pixel", null)[0]).toBe("La journée d'essai de Pixel est demain, à 10 h.");
    expect(phrasesRappelVeilleEssai("Pixel", undefined)[0]).toContain("à 10 h.");
  });

  it("une seconde journée à un autre créneau garde son heure", () => {
    expect(phrasesRappelVeilleEssai("Pixel", "10:30")[0]).toBe("La journée d'essai de Pixel est demain, à 10 h 30.");
    expect(heureLisible("09:30")).toBe("9 h 30");
    expect(heureLisible("11:00:00")).toBe("11 h");
  });

  it("ne reprend rien du séjour", () => {
    const texte = phrasesRappelVeilleEssai("Pixel", "10:00").join(" ");
    expect(texte).not.toMatch(/séjour|durée|médicament|couverture/i);
  });
});

// ── Le dépôt ───────────────────────────────────────────────────────────────

const RACINE = join(__dirname, "..");
const lire = (...m: string[]) => readFileSync(join(RACINE, ...m), "utf8");

describe("le cron et le modèle", () => {
  const route = lire("app", "api", "cron", "rappel-veille", "route.ts");

  it("la tâche 1 prend séjours et essais, par la règle testée ici", () => {
    const tache1 = route.slice(route.indexOf("Tâche 1"), route.indexOf("Tâche 2"));
    expect(tache1).toContain('.in("type_reservation", [...TYPES_RAPPEL_VEILLE])');
    expect(tache1).toContain('.eq("statut", "validee")');
    expect(tache1).toContain("doitRecevoirRappelVeille(r, dateDemain)");
  });

  it("la tâche 2 (demande de paiement à 14 jours) reste réservée aux séjours", () => {
    const tache2 = route.slice(route.indexOf("Tâche 2"));
    expect(tache2).toContain('.eq("type_reservation", "sejour")');
    expect(tache2).not.toContain("TYPES_RAPPEL_VEILLE");
  });

  it("le modèle bascule sur le texte de l’essai, et garde celui du séjour", () => {
    const email = lire("src", "lib", "email.ts");
    const debut = email.indexOf("export async function envoyerEmailRappelVeille");
    const corps = email.slice(debut, email.indexOf("\n}\n", debut));
    expect(corps).toContain('if (type === "essai")');
    expect(corps).toContain("phrasesRappelVeilleEssai(nom_chien, heure_arrivee)");
    // Le séjour garde sa liste et ses horaires, intacts.
    expect(corps).toContain("Sa nourriture habituelle (quantités pour toute la durée du séjour)");
    expect(corps).toContain("Séjour : 9h00 – 10h00 ou 17h00 – 18h00");
  });
});
