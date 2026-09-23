import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { requetesSentry } from "./setup/sansSentry";

/**
 * Les trois sorties de la porte des crons, et le bruit qu'elles font.
 *
 * Sentry et le journal sont moqués : on regarde ce qui leur est remis — et
 * surtout ce qui ne l'est pas, ni le secret attendu, ni celui reçu, ni
 * l'en-tête brut, ni sa longueur.
 *
 * La limitation en mémoire du 18c-ter a été retirée (elle comptait par
 * instance serverless, donc pas du tout) : ses deux tests de fenêtre partent
 * avec elle.
 */

const H = vi.hoisted(() => ({
  messages: [] as { message: string; contexte: unknown }[],
  journal: [] as Record<string, unknown>[],
}));

vi.mock("@sentry/nextjs", () => ({
  captureMessage: (message: string, contexte: unknown) => {
    H.messages.push({ message, contexte });
  },
  captureException: () => {},
}));

vi.mock("@/src/lib/journalEvenements", () => ({
  tracerEvenement: async (e: Record<string, unknown>) => {
    H.journal.push(e);
  },
}));

import { verifierCron } from "@/src/lib/cron";

const SECRET = "un-secret-de-cron-assez-long-0923";
const SECRET_FAUX = "le-mauvais-secret-que-personne-ne-doit-lire";

const requete = (entete?: string) =>
  new Request("http://localhost/api/cron/quotidien-matin", {
    headers: entete === undefined ? {} : { authorization: entete },
  });

beforeEach(() => {
  H.messages.length = 0;
  H.journal.length = 0;
  vi.stubEnv("CRON_SECRET", SECRET);
});

afterEach(() => vi.unstubAllEnvs());

describe("en-tête Authorization absent : silence complet", () => {
  it("401, aucune alerte, aucune écriture", async () => {
    const reponse = await verifierCron(requete(), "quotidien-matin");
    expect(reponse?.status).toBe(401);
    expect(await reponse!.json()).toEqual({ error: "Unauthorized" });
    expect(H.messages).toEqual([]);
    expect(H.journal).toEqual([]);
  });

  it("dix passages de sonde ne laissent rien derrière eux", async () => {
    for (let i = 0; i < 10; i++) {
      expect((await verifierCron(requete(), "rappel-veille"))?.status).toBe(401);
    }
    expect(H.messages).toEqual([]);
    expect(H.journal).toEqual([]);
  });
});

describe("en-tête présent, secret faux : alerte et trace", () => {
  it("401, une alerte warning nommant la tâche et la raison", async () => {
    const reponse = await verifierCron(requete(`Bearer ${SECRET_FAUX}`), "quotidien-matin");
    expect(reponse?.status).toBe(401);
    expect(H.messages).toHaveLength(1);
    expect(H.messages[0].message).toBe("Cron « quotidien-matin » refusé : secret incorrect.");
    expect(H.messages[0].contexte).toMatchObject({
      level: "warning",
      tags: { tache: "quotidien-matin", raison: "secret_faux" },
    });
  });

  it("exactement une ligne de journal, entité « acces », sans auteur", async () => {
    await verifierCron(requete(`Bearer ${SECRET_FAUX}`), "quotidien-matin");
    expect(H.journal).toHaveLength(1);
    expect(H.journal[0]).toMatchObject({
      entite: "acces",
      evenement: "refus",
      userId: null,
      apres: { action: "cron", tache: "quotidien-matin", motif: "secret_faux" },
    });
  });

  it("chaque tentative laisse sa trace : il n'y a plus de fenêtre", async () => {
    await verifierCron(requete("Bearer faux"), "quotidien-matin");
    await verifierCron(requete("Bearer faux"), "quotidien-matin");
    expect(H.messages).toHaveLength(2);
    expect(H.journal).toHaveLength(2);
  });

  it("ni le secret, ni l'en-tête, ni sa longueur ne partent", async () => {
    await verifierCron(requete(`Bearer ${SECRET_FAUX}`), "quotidien-matin");
    const charge = JSON.stringify({ sentry: H.messages, journal: H.journal });
    expect(charge).not.toContain(SECRET);
    expect(charge).not.toContain(SECRET_FAUX);
    expect(charge.toLowerCase()).not.toContain("bearer");
    expect(charge).not.toContain("authorization");
    // Une longueur trahirait déjà quelque chose du secret essayé.
    expect(charge).not.toMatch(/longueur|length|taille/i);
    expect(charge).not.toContain(String(`Bearer ${SECRET_FAUX}`.length));
  });

  it("un en-tête vide compte comme un secret faux, pas comme une absence", async () => {
    const reponse = await verifierCron(requete(""), "quotidien-matin");
    expect(reponse?.status).toBe(401);
    expect(H.messages).toHaveLength(1);
    expect(H.journal).toHaveLength(1);
  });
});

describe("les deux autres sorties n'ont pas changé", () => {
  it("le bon secret passe, sans bruit", async () => {
    expect(await verifierCron(requete(`Bearer ${SECRET}`), "quotidien-matin")).toBeNull();
    expect(H.messages).toEqual([]);
    expect(H.journal).toEqual([]);
  });

  it("secret absent : 500, alerte de niveau error, aucune écriture", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const reponse = await verifierCron(requete(`Bearer ${SECRET}`), "quotidien-matin");
    expect(reponse?.status).toBe(500);
    expect(await reponse!.json()).toEqual({ error: "Tâche planifiée non configurée." });
    expect(H.messages[0].contexte).toBe("error");
    expect(H.journal).toEqual([]);
  });

  it("plus aucune limitation en mémoire dans le module", async () => {
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync(new URL("../src/lib/cron.ts", import.meta.url), "utf8"));
    expect(src).not.toContain("FENETRE_ALERTE_MS");
    expect(src).not.toContain("derniereAlerte");
    expect(src).not.toContain("reinitialiserAlertesCron");
    expect(src).not.toContain("new Map");
  });

  it("aucune requête réseau n'est partie vers Sentry pendant ces tests", () => {
    expect(requetesSentry()).toEqual([]);
  });
});
