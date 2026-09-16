import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

/**
 * Le journal des événements est en ajout seul.
 *
 * La vérification réelle s'est faite en base, en service role, à l'application
 * de la migration : UPDATE, DELETE et TRUNCATE sur journal_evenements lèvent
 * tous « journal_evenements est en ajout seul… ». Ce test garde la règle dans
 * le dépôt : la migration la porte entière, et aucune migration plus récente ne
 * la défait, et le code de l'application n'essaie jamais d'y toucher.
 */

const DOSSIER = join(process.cwd(), "supabase", "migrations");
const FICHIER = "20260916115637_journal_evenements_immuable.sql";

describe("journal_evenements : ni modification, ni suppression, ni vidage", () => {
  const sql = readFileSync(join(DOSSIER, FICHIER), "utf8");

  it("un trigger BEFORE UPDATE OR DELETE, pour chaque ligne, lève une exception", () => {
    expect(sql).toMatch(/create trigger trg_journal_evenements_append_only\s+before update or delete on public\.journal_evenements\s+for each row/i);
    expect(sql).toMatch(/raise exception\s+'journal_evenements est en ajout seul/i);
  });

  it("un trigger BEFORE TRUNCATE ferme le vidage de la table", () => {
    expect(sql).toMatch(/create trigger trg_journal_evenements_sans_vidage\s+before truncate on public\.journal_evenements\s+for each statement/i);
  });

  it("aucune migration plus récente ne retire ces triggers", () => {
    const plusRecentes = readdirSync(DOSSIER).filter((f) => f.endsWith(".sql") && f > FICHIER);
    for (const f of plusRecentes) {
      const contenu = readFileSync(join(DOSSIER, f), "utf8");
      expect(contenu, f).not.toMatch(/drop trigger[^;]*trg_journal_evenements_(append_only|sans_vidage)/i);
      expect(contenu, f).not.toMatch(/disable trigger[^;]*journal_evenements/i);
    }
  });

  it("le code de l'application n'écrit jamais dans le journal autrement qu'en ajout", () => {
    const racines = ["app", "src"].map((d) => join(process.cwd(), d));
    const fautes: string[] = [];
    const parcourir = (dossier: string) => {
      for (const e of readdirSync(dossier, { withFileTypes: true })) {
        const p = join(dossier, e.name);
        if (e.isDirectory()) parcourir(p);
        else if (/\.tsx?$/.test(e.name)) {
          const t = readFileSync(p, "utf8");
          if (/from\(\s*["']journal_evenements["']\s*\)\s*\.\s*(update|delete|upsert)\b/.test(t)) fautes.push(p);
        }
      }
    };
    racines.forEach(parcourir);
    expect(fautes).toEqual([]);
  });
});
