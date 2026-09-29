import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi } from "vitest";

/**
 * APP 60 — la preuve que rendre les textes modifiables ne change RIEN.
 *
 * ── POURQUOI CE TEST EXISTE, ET POURQUOI IL EST LE PREMIER ────────────────
 *
 * Le lot déplace des dizaines de phrases du code vers un réglage. Un
 * remaniement de cette taille casse toujours au même endroit : un espace de
 * plus, une balise fermée ailleurs, un accent perdu — et les vingt-et-un
 * e-mails de la maison partent différents sans que personne l'ait demandé.
 *
 * La référence a donc été capturée AVANT d'écrire une ligne du lot
 * (`tests/fixtures/emailsAvantApp60.json`), en rendant les vingt-et-un e-mails
 * de test avec leur vrai contexte, à une date figée. Ce test les rend à
 * nouveau, base VIDE, et compare au caractère près.
 *
 * Si ce fichier est vert, le déploiement ne change rien pour personne.
 */

const H = vi.hoisted(() => ({ html: [] as string[] }));

vi.mock("resend", () => ({
  Resend: class {
    emails = {
      send: async (p: { html: string }) => { H.html.push(p.html); return { data: { id: "x" }, error: null }; },
    };
  },
}));

vi.mock("@/src/lib/supabase-admin", async () => {
  const { donneesTable, lignesTable } = await import("./helpers/doublureEmails");
  function from(table: string) {
    const c = {
      select: () => c, eq: () => c, order: () => c, limit: () => c,
      insert: () => Promise.resolve({ error: null }),
      // La base est VIDE de personnalisation : `modeles_email` ne rend rien.
      maybeSingle: async () => ({ data: donneesTable(table), error: null }),
      single: async () => ({ data: donneesTable(table), error: null }),
      in: () => ({
        then: <T,>(f: (v: { data: unknown[]; error: null }) => T) =>
          Promise.resolve({ data: [] as unknown[], error: null }).then(f),
      }),
      then: <T,>(f: (v: { data: unknown[]; error: null }) => T) =>
        Promise.resolve({ data: lignesTable(table), error: null }).then(f),
    };
    return c;
  }
  return {
    supabaseAdmin: {
      from,
      storage: { from: () => ({ download: async () => ({ data: null, error: null }) }) },
    },
  };
});

vi.mock("@/src/lib/entiteJuridique", () => ({ entiteA: async () => ({}) }));
vi.mock("@/src/lib/entiteJuridiqueLogique", () => ({ raisonSocialeAffichee: () => "La Dogosphère Sàrl" }));
vi.mock("@sentry/nextjs", () => ({ captureException: () => {} }));

import * as email from "@/src/lib/email";
import { CLES_EMAILS, rendreTousLesEmails } from "./helpers/rendreTousLesEmails";
import type { FonctionsEnvoi } from "@/src/lib/emailsDeTestEnvoi";

const AVANT: Record<string, string> = JSON.parse(
  readFileSync(join(__dirname, "fixtures", "emailsAvantApp60.json"), "utf8"),
);

describe("base vide : les vingt-et-un e-mails sont IDENTIQUES à ceux d’avant le lot", () => {
  it("aucun ne manque, aucun n’est en trop", async () => {
    // Le garde-fou du garde-fou : une comparaison sur zéro e-mail serait verte.
    expect(Object.keys(AVANT).sort()).toEqual([...CLES_EMAILS].sort());
    expect(CLES_EMAILS.length).toBeGreaterThanOrEqual(21);
  });

  it("chacun, au caractère près", async () => {
    const apres = await rendreTousLesEmails(
      email as unknown as FonctionsEnvoi,
      () => H.html,
      () => { H.html = []; },
    );

    for (const cle of CLES_EMAILS) {
      // Comparé un par un : un échec nomme l'e-mail, pas « les e-mails ».
      expect(apres[cle], `e-mail « ${cle} »`).toBe(AVANT[cle]);
    }
  }, 60_000);

  it("et aucun ne s’est vidé en chemin", async () => {
    /**
     * Sans cela, une fonction qui cesserait d'envoyer rendrait « (aucun
     * envoi) » des deux côtés, et la comparaison resterait verte.
     */
    for (const cle of CLES_EMAILS) {
      expect(AVANT[cle], `e-mail « ${cle} »`).not.toBe("(aucun envoi)");
      expect(AVANT[cle].length, `e-mail « ${cle} »`).toBeGreaterThan(2000);
    }
  });
});
