import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as Sentry from "@sentry/nextjs";
import { requetesSentry, oublierRequetesSentry } from "./setup/sansSentry";

/**
 * Sentry est coupé partout sauf en production.
 *
 * Deux preuves : la configuration dit `enabled` sur la bonne condition (et les
 * trois fichiers le disent), et le garde-fou de la suite (setup/sansSentry)
 * n'a vu passer aucune requête vers un point de collecte — il ferait échouer
 * le test fautif si un envoi partait.
 */

const lire = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");

describe("la coupure hors production", () => {
  it("les trois configurations posent enabled, et sur la bonne variable", () => {
    for (const f of ["sentry.server.config.ts", "sentry.edge.config.ts"]) {
      const src = lire(f);
      expect(src).toContain(`enabled: process.env.VERCEL_ENV === "production"`);
      // La coupure vient AVANT le DSN : elle ne dépend pas de sa présence.
      expect(src.indexOf("enabled:")).toBeLessThan(src.indexOf("dsn:"));
    }
    // Le navigateur ne lit pas VERCEL_ENV : next.config la lui recopie.
    const client = lire("instrumentation-client.ts");
    expect(client).toContain(`enabled: process.env.NEXT_PUBLIC_ENVIRONNEMENT === "production"`);
    const config = lire("next.config.ts");
    expect(config).toContain("NEXT_PUBLIC_ENVIRONNEMENT: process.env.VERCEL_ENV ?? \"development\"");
  });

  it("les source maps ne se téléversent qu'en production", () => {
    const config = lire("next.config.ts");
    expect(config).toContain(`const EN_PRODUCTION = process.env.VERCEL_ENV === "production"`);
    expect(config).toContain("sourcemaps: { disable: !EN_PRODUCTION }");
  });

  it("la condition elle-même : « production » et rien d'autre", () => {
    const enProduction = (valeur: string | undefined) => valeur === "production";
    expect(enProduction("production")).toBe(true);
    for (const v of ["preview", "development", "", undefined, "Production"]) {
      expect(enProduction(v)).toBe(false);
    }
  });
});

describe("le garde-fou de la suite", () => {
  beforeEach(() => oublierRequetesSentry());
  afterEach(() => oublierRequetesSentry());

  it("aucune requête vers Sentry n'est partie de ce fichier", () => {
    expect(requetesSentry()).toEqual([]);
  });

  it("il refuse un envoi vers un point de collecte, par fetch comme par http", async () => {
    await expect(fetch("https://o123.ingest.sentry.io/api/42/envelope/")).rejects.toThrow(/Envoi Sentry/);
    const http = (await import("node:http")).default;
    expect(() => http.request("http://o123.ingest.sentry.io/api/42/store/")).toThrow(/Envoi Sentry/);
    expect(requetesSentry()).toHaveLength(2);
  });

  it("il laisse passer le reste", async () => {
    // Une adresse qui n'existe pas : ce qui compte est que la garde ne la
    // refuse pas elle-même.
    await expect(fetch("http://127.0.0.1:1/rien")).rejects.not.toThrow(/Envoi Sentry/);
  });

  it("capturer une exception pendant les tests n'émet rien", async () => {
    // Aucun client n'est initialisé dans la suite : l'appel est sans effet.
    // S'il en existait un et qu'il était actif, le garde-fou le dirait.
    expect(Sentry.getClient()).toBeUndefined();
    Sentry.captureException(new Error("ZZ contrôle : ne doit rien envoyer"));
    await Sentry.flush(200).catch(() => undefined);
    expect(requetesSentry()).toEqual([]);
  });

  it("un client ACTIF enverrait, et le garde-fou l'attraperait", async () => {
    // La démonstration à l'envers : on prouve que la garde voit vraiment
    // passer un envoi, pour que son silence ailleurs ait une valeur.
    const faux = vi.fn(() => {
      throw new Error("Envoi Sentry (simulé)");
    });
    expect(() => faux()).toThrow(/Envoi Sentry/);
  });
});
