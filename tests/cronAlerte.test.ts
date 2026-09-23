import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { requetesSentry } from "./setup/sansSentry";

/**
 * Le refus d'un cron (401) laisse une alerte, et une seule par tâche et par
 * fenêtre de dix minutes.
 *
 * Sentry est moqué : on regarde ce qui LUI est remis — le niveau, le nom de la
 * tâche, la raison — et surtout ce qui ne l'est pas : ni le secret attendu, ni
 * celui reçu, ni l'en-tête brut.
 */

const H = vi.hoisted(() => ({ messages: [] as { message: string; contexte: unknown }[] }));

vi.mock("@sentry/nextjs", () => ({
  captureMessage: (message: string, contexte: unknown) => {
    H.messages.push({ message, contexte });
  },
  captureException: () => {},
}));

import { verifierCron, reinitialiserAlertesCron, FENETRE_ALERTE_MS } from "@/src/lib/cron";

const SECRET = "un-secret-de-cron-assez-long-0923";
const SECRET_FAUX = "le-mauvais-secret-que-personne-ne-doit-lire";

const requete = (entete?: string) =>
  new Request("http://localhost/api/cron/quotidien-matin", {
    headers: entete === undefined ? {} : { authorization: entete },
  });

beforeEach(() => {
  H.messages.length = 0;
  reinitialiserAlertesCron();
  vi.stubEnv("CRON_SECRET", SECRET);
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-23T08:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("l'alerte d'un refus de cron", () => {
  it("un mauvais secret : 401, et une alerte de niveau warning", () => {
    const reponse = verifierCron(requete(`Bearer ${SECRET_FAUX}`), "quotidien-matin");
    expect(reponse?.status).toBe(401);
    expect(H.messages).toHaveLength(1);
    expect(H.messages[0].message).toBe("Cron « quotidien-matin » refusé : secret incorrect.");
    expect(H.messages[0].contexte).toMatchObject({
      level: "warning",
      tags: { tache: "quotidien-matin", raison: "secret_faux" },
    });
  });

  it("un en-tête absent : même refus, raison nommée", () => {
    expect(verifierCron(requete(), "rappel-veille")?.status).toBe(401);
    expect(H.messages[0].message).toBe("Cron « rappel-veille » refusé : en-tête Authorization absent.");
    expect(H.messages[0].contexte).toMatchObject({ tags: { raison: "entete_absent" } });
  });

  it("ni le secret attendu, ni le secret reçu, ni l'en-tête ne partent", () => {
    verifierCron(requete(`Bearer ${SECRET_FAUX}`), "quotidien-matin");
    const charge = JSON.stringify(H.messages);
    expect(charge).not.toContain(SECRET);
    expect(charge).not.toContain(SECRET_FAUX);
    expect(charge.toLowerCase()).not.toContain("bearer");
    expect(charge).not.toContain("authorization");
  });

  it("un deuxième refus dans la même fenêtre n'alerte pas", () => {
    verifierCron(requete("Bearer faux"), "quotidien-matin");
    expect(H.messages).toHaveLength(1);

    const depart = Date.now();
    for (const minutes of [1, 5, 9]) {
      vi.setSystemTime(new Date(depart + minutes * 60_000));
      expect(verifierCron(requete("Bearer faux"), "quotidien-matin")?.status).toBe(401);
    }
    expect(H.messages).toHaveLength(1);
  });

  it("passé dix minutes, une nouvelle alerte part", () => {
    verifierCron(requete("Bearer faux"), "quotidien-matin");
    vi.setSystemTime(new Date(Date.now() + FENETRE_ALERTE_MS + 1_000));
    verifierCron(requete("Bearer faux"), "quotidien-matin");
    expect(H.messages).toHaveLength(2);
  });

  it("la fenêtre est par TÂCHE : l'autre cron garde son alerte", () => {
    verifierCron(requete("Bearer faux"), "quotidien-matin");
    verifierCron(requete("Bearer faux"), "rappel-veille");
    expect(H.messages.map((m) => m.contexte)).toMatchObject([
      { tags: { tache: "quotidien-matin" } },
      { tags: { tache: "rappel-veille" } },
    ]);
  });

  it("le bon secret ne déclenche rien, et la tâche passe", () => {
    expect(verifierCron(requete(`Bearer ${SECRET}`), "quotidien-matin")).toBeNull();
    expect(H.messages).toEqual([]);
  });

  it("le secret absent reste un 500 de niveau error, comme avant", () => {
    vi.stubEnv("CRON_SECRET", "");
    const reponse = verifierCron(requete(`Bearer ${SECRET}`), "quotidien-matin");
    expect(reponse?.status).toBe(500);
    expect(H.messages[0].contexte).toBe("error");
  });

  it("la réponse HTTP n'a pas changé : un 401 sobre", async () => {
    const reponse = verifierCron(requete("Bearer faux"), "quotidien-matin");
    expect(await reponse!.json()).toEqual({ error: "Unauthorized" });
  });

  it("rien n'est écrit au journal métier depuis cette porte", async () => {
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync(new URL("../src/lib/cron.ts", import.meta.url), "utf8"));
    // Aucune écriture : ni trace métier, ni client de base. Le mot peut
    // apparaître dans un commentaire, c'est l'APPEL qu'on interdit.
    expect(src).not.toContain("tracerEvenement(");
    expect(src).not.toContain('from("journal_evenements")');
    expect(src).not.toContain("supabase-admin");
    expect(src).not.toContain("supabaseAdmin");
  });

  it("aucune requête réseau n'est partie vers Sentry pendant ces tests", () => {
    expect(requetesSentry()).toEqual([]);
  });
});
