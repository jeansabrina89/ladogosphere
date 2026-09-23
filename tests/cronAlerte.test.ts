import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { requetesSentry } from "./setup/sansSentry";

/**
 * Les trois sorties de la porte des crons, et le bruit qu'elles font.
 *
 * La trace d'un mauvais secret passe par une fonction SQL qui insère « sans
 * rien faire en cas de conflit » : un index unique partiel (tâche, jour)
 * garantit UNE ligne par tâche et par jour. C'est sa réponse — « je viens de
 * créer la ligne », ou non — qui décide de l'alerte Sentry.
 *
 * La base est simulée ici par une table en mémoire qui applique la MÊME règle
 * d'unicité que l'index : on éprouve le branchement, pas Postgres. La règle
 * SQL elle-même est vérifiée par le contenu de la migration, plus bas.
 */

const H = vi.hoisted(() => ({
  messages: [] as { message: string; contexte: unknown }[],
  /** Ce que la « table » contient : une clé « tâche|jour » par ligne. */
  lignes: [] as string[],
  jour: "2026-09-23",
  /** Pour éprouver le cas où l'écriture échoue. */
  erreur: null as string | null,
}));

vi.mock("@sentry/nextjs", () => ({
  captureMessage: (message: string, contexte: unknown) => {
    H.messages.push({ message, contexte });
  },
  captureException: () => {},
}));

vi.mock("@/src/lib/supabase-admin", () => ({
  supabaseAdmin: {
    rpc: async (nom: string, args: { p_tache: string }) => {
      if (nom !== "tracer_refus_cron") throw new Error(`fonction inattendue : ${nom}`);
      if (H.erreur) return { data: null, error: { message: H.erreur } };
      const cle = `${args.p_tache}|${H.jour}`;
      if (H.lignes.includes(cle)) return { data: false, error: null }; // conflit : rien créé
      H.lignes.push(cle);
      return { data: true, error: null };
    },
  },
}));

import { verifierCron } from "@/src/lib/cron";

const SECRET = "un-secret-de-cron-assez-long-0923";
const SECRET_FAUX = "le-mauvais-secret-que-personne-ne-doit-lire";

const requete = (entete?: string) =>
  new Request("http://localhost/api/cron/quotidien-matin", {
    headers: entete === undefined ? {} : { authorization: entete },
  });

const refuser = (tache = "quotidien-matin", entete = `Bearer ${SECRET_FAUX}`) =>
  verifierCron(requete(entete), tache);

beforeEach(() => {
  H.messages.length = 0;
  H.lignes.length = 0;
  H.jour = "2026-09-23";
  H.erreur = null;
  vi.stubEnv("CRON_SECRET", SECRET);
});

afterEach(() => vi.unstubAllEnvs());

describe("en-tête Authorization absent : silence complet", () => {
  it("401, aucune alerte, aucune écriture", async () => {
    const reponse = await verifierCron(requete(), "quotidien-matin");
    expect(reponse?.status).toBe(401);
    expect(await reponse!.json()).toEqual({ error: "Unauthorized" });
    expect(H.messages).toEqual([]);
    expect(H.lignes).toEqual([]);
  });

  it("dix passages de sonde ne laissent rien derrière eux", async () => {
    for (let i = 0; i < 10; i++) {
      expect((await verifierCron(requete(), "rappel-veille"))?.status).toBe(401);
    }
    expect(H.messages).toEqual([]);
    expect(H.lignes).toEqual([]);
  });
});

describe("mauvais secret : une trace et une alerte par tâche et par jour", () => {
  it("le premier refus : 401, une ligne, une alerte warning", async () => {
    const reponse = await refuser();
    expect(reponse?.status).toBe(401);
    expect(H.lignes).toEqual(["quotidien-matin|2026-09-23"]);
    expect(H.messages).toHaveLength(1);
    expect(H.messages[0].message).toBe("Cron « quotidien-matin » refusé : secret incorrect.");
    expect(H.messages[0].contexte).toMatchObject({
      level: "warning",
      tags: { tache: "quotidien-matin", raison: "secret_faux" },
    });
  });

  it("deux refus le même jour sur la même tâche : une seule ligne, une seule alerte", async () => {
    await refuser();
    await refuser();
    expect(H.lignes).toHaveLength(1);
    expect(H.messages).toHaveLength(1);
  });

  it("cinquante refus d'affilée : toujours une seule ligne, une seule alerte", async () => {
    for (let i = 0; i < 50; i++) expect((await refuser())?.status).toBe(401);
    expect(H.lignes).toHaveLength(1);
    expect(H.messages).toHaveLength(1);
  });

  it("le lendemain, la même tâche laisse une nouvelle trace et alerte à nouveau", async () => {
    await refuser();
    H.jour = "2026-09-24";
    await refuser();
    expect(H.lignes).toEqual(["quotidien-matin|2026-09-23", "quotidien-matin|2026-09-24"]);
    expect(H.messages).toHaveLength(2);
  });

  it("deux tâches le même jour : une ligne et une alerte chacune", async () => {
    await refuser("quotidien-matin");
    await refuser("rappel-veille");
    await refuser("quotidien-matin");
    await refuser("rappel-veille");
    expect(H.lignes).toEqual(["quotidien-matin|2026-09-23", "rappel-veille|2026-09-23"]);
    expect(H.messages.map((m) => m.contexte)).toMatchObject([
      { tags: { tache: "quotidien-matin" } },
      { tags: { tache: "rappel-veille" } },
    ]);
  });

  it("si l'écriture échoue, la tentative n'est pas muette pour autant", async () => {
    H.erreur = "base indisponible";
    await refuser();
    expect(H.messages).toHaveLength(1);
  });

  it("ni le secret, ni l'en-tête, ni sa longueur ne partent", async () => {
    await refuser();
    const charge = JSON.stringify({ sentry: H.messages, journal: H.lignes });
    expect(charge).not.toContain(SECRET);
    expect(charge).not.toContain(SECRET_FAUX);
    expect(charge.toLowerCase()).not.toContain("bearer");
    expect(charge).not.toContain("authorization");
    expect(charge).not.toMatch(/longueur|length|taille/i);
    expect(charge).not.toContain(String(`Bearer ${SECRET_FAUX}`.length));
  });

  it("un en-tête vide compte comme un secret faux, pas comme une absence", async () => {
    const reponse = await refuser("quotidien-matin", "");
    expect(reponse?.status).toBe(401);
    expect(H.lignes).toHaveLength(1);
    expect(H.messages).toHaveLength(1);
  });
});

describe("les deux autres sorties n'ont pas changé", () => {
  it("le bon secret passe, sans bruit", async () => {
    expect(await verifierCron(requete(`Bearer ${SECRET}`), "quotidien-matin")).toBeNull();
    expect(H.messages).toEqual([]);
    expect(H.lignes).toEqual([]);
  });

  it("secret absent : 500, alerte de niveau error, aucune écriture", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const reponse = await verifierCron(requete(`Bearer ${SECRET}`), "quotidien-matin");
    expect(reponse?.status).toBe(500);
    expect(await reponse!.json()).toEqual({ error: "Tâche planifiée non configurée." });
    expect(H.messages[0].contexte).toBe("error");
    expect(H.lignes).toEqual([]);
  });

  it("plus aucune limitation en mémoire dans le module", async () => {
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync(new URL("../src/lib/cron.ts", import.meta.url), "utf8"));
    expect(src).not.toContain("FENETRE_ALERTE_MS");
    expect(src).not.toContain("derniereAlerte");
    expect(src).not.toContain("new Map");
    // C'est l'écriture qui décide, et rien d'autre.
    expect(src).toContain('rpc("tracer_refus_cron"');
  });

  it("aucune requête réseau n'est partie vers Sentry pendant ces tests", () => {
    expect(requetesSentry()).toEqual([]);
  });
});

describe("la migration qui borne la trace", () => {
  const lire = async () => {
    const fs = await import("node:fs");
    const dossier = new URL("../supabase/migrations/", import.meta.url);
    const nom = fs.readdirSync(dossier).find((f) => f.endsWith("_cron_refus_un_par_jour.sql"));
    expect(nom).toMatch(/^\d{14}_cron_refus_un_par_jour\.sql$/);
    return fs.readFileSync(new URL(nom!, dossier), "utf8");
  };

  it("un index unique PARTIEL, limité aux refus de cron", async () => {
    const sql = await lire();
    expect(sql).toContain("create unique index if not exists journal_refus_cron_un_par_jour");
    expect(sql).toMatch(/on public\.journal_evenements \(\(apres->>'tache'\), \(apres->>'jour'\)\)/);
    // La clause qui met les refus de la garde applicative hors de l'index.
    expect(sql).toContain("where entite = 'acces'");
    expect(sql).toContain("and evenement = 'refus'");
    expect(sql).toContain("and apres->>'action' = 'cron'");
  });

  it("rejouable, et le jour est une date UTC écrite dans la trace", async () => {
    const sql = await lire();
    expect(sql).toContain("if not exists");
    expect(sql).toContain("create or replace function public.tracer_refus_cron");
    expect(sql).toContain("(now() at time zone 'UTC')::date");
    expect(sql).toContain("on conflict do nothing");
  });

  it("la fonction naît fermée", async () => {
    const sql = await lire();
    expect(sql).toContain("revoke execute on function public.tracer_refus_cron(text) from public, anon, authenticated;");
    expect(sql).toContain("grant execute on function public.tracer_refus_cron(text) to service_role;");
  });
});
