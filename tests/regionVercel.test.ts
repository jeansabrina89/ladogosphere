import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it, expect } from "vitest";

/**
 * APP 70 — le serveur tourne à Francfort, à côté de la base.
 *
 * Constat du 3 octobre 2026 : les fonctions de production tournaient à
 * Washington (iad1), la base Supabase est à Zurich (eu-central-2). Chaque
 * lecture traversait l'Atlantique, aller et retour, et un écran en faisait
 * jusqu'à seize l'une après l'autre. Sabrina trouvait l'app « extrêmement
 * lente » sur son téléphone, et c'était la première raison.
 *
 * `regions` au niveau du projet est LA clé de vercel.json qui fixe la région
 * d'exécution de toutes les fonctions (documentation Vercel, « Configuring
 * regions for Vercel Functions »). fra1 est la région Vercel la plus proche de
 * Zurich.
 */

const RACINE = join(__dirname, "..");
const vercel = JSON.parse(readFileSync(join(RACINE, "vercel.json"), "utf8"));

describe("vercel.json", () => {
  it("fait tourner les fonctions à Francfort, et nulle part ailleurs", () => {
    expect(vercel.regions).toEqual(["fra1"]);
  });

  it("garde les deux crons, à leurs heures UTC d'avant", () => {
    expect(vercel.crons).toEqual([
      { path: "/api/cron/rappel-veille", schedule: "0 10 * * *" },
      { path: "/api/cron/quotidien-matin", schedule: "0 7 * * *" },
    ]);
  });

  it("ne porte rien d'autre qui changerait l'exécution", () => {
    expect(Object.keys(vercel).sort()).toEqual(["crons", "regions"]);
  });
});

describe("rien dans le code ne contredit la région", () => {
  function fichiers(dossier: string): string[] {
    return readdirSync(dossier).flatMap((n) => {
      const chemin = join(dossier, n);
      if (statSync(chemin).isDirectory()) return fichiers(chemin);
      return /\.(ts|tsx)$/.test(n) ? [chemin] : [];
    });
  }
  const code = [...fichiers(join(RACINE, "app")), ...fichiers(join(RACINE, "src"))]
    .concat([join(RACINE, "proxy.ts")])
    .map((f) => ({ f: relative(RACINE, f), texte: readFileSync(f, "utf8") }));

  it("aucune route ne choisit sa région (preferredRegion, déprécié depuis Next 16)", () => {
    expect(code.filter((c) => /export\s+const\s+preferredRegion/.test(c.texte)).map((c) => c.f)).toEqual([]);
  });

  it("aucune route en runtime « edge » : elle tournerait près du visiteur, donc loin de la base", () => {
    expect(code.filter((c) => /export\s+const\s+runtime\s*=\s*["']edge["']/.test(c.texte)).map((c) => c.f)).toEqual([]);
  });
});
