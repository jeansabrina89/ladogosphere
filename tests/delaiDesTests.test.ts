import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

/**
 * Le délai d'un test : une valeur, un endroit.
 *
 * Il a vécu deux ans dans `tests/setup/attenteJsdom.ts`, que seuls les fichiers
 * jsdom importent. Les fichiers en environnement node gardaient donc les cinq
 * secondes par défaut de vitest — et l'un d'eux a expiré au lot APP 27 sur une
 * machine chargée, en entraînant deux autres tests du même fichier avec lui.
 *
 * Le symptôme était « Test timed out in 5000ms », qui ne nomme rien : ni ce que
 * le test attendait, ni ce qu'il a vu à la place. Ce n'est donc pas de la
 * tolérance qu'on a ajoutée, c'est du diagnostic.
 *
 * Ce fichier garde les deux choses qui rendent ce diagnostic possible : la
 * valeur est dans la configuration, et personne ne la redéfinit ailleurs.
 */

const RACINE = join(__dirname, "..");
const config = () => readFileSync(join(RACINE, "vitest.config.ts"), "utf8");

/** Tous les fichiers de tests et leurs fixtures, à plat. */
function fichiersDeTest(dossier = join(RACINE, "tests")): string[] {
  return readdirSync(dossier, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? fichiersDeTest(join(dossier, e.name))
      : [join(dossier, e.name)]
  );
}

describe("le délai d'un test", () => {
  it("vaut quinze secondes, et c'est la configuration qui le dit", () => {
    // Pour TOUS les fichiers, node comme jsdom : c'est tout l'objet du
    // déplacement. La valeur est lue telle qu'elle est écrite, séparateur
    // de milliers compris.
    const t = config();
    const trouve = /testTimeout:\s*([0-9_]+)/.exec(t);
    expect(trouve, "vitest.config.ts doit porter testTimeout").toBeTruthy();
    expect(Number((trouve?.[1] ?? "0").replace(/_/g, ""))).toBe(15000);
  });

  it("la configuration DIT pourquoi, pas seulement combien", () => {
    // Un chiffre sans raison se fait raboter par le premier qui trouve la suite
    // lente. La raison est le diagnostic, et elle est écrite.
    const t = config();
    expect(t).toMatch(/diagnostic/i);
    expect(t, "la trace de l'échec qui l'a motivé").toContain("2026-09-26T20-25-05");
  });

  it("AUCUN fichier de test ne le redéfinit de son côté", () => {
    /**
     * Ce que ce test empêche : qu'on reprenne l'habitude de poser le délai
     * fichier par fichier. C'est précisément ainsi que les tests node s'étaient
     * retrouvés avec cinq secondes quand les jsdom en avaient quinze — sans que
     * personne ne l'ait décidé.
     *
     * Un `it(..., { timeout })` local reste possible pour un test qui dure
     * vraiment longtemps ; ce qui est interdit, c'est de changer le délai de
     * TOUT un fichier en douce.
     */
    const fautifs = fichiersDeTest()
      .filter((f) => /\.tsx?$/.test(f))
      .filter((f) => /vi\.setConfig\(\s*\{[^}]*testTimeout/.test(readFileSync(f, "utf8")))
      .map((f) => f.replace(RACINE, "").replace(/\\/g, "/"));
    expect(fautifs).toEqual([]);
  });

  it("l'attente de RENDU reste distincte, et plus courte", () => {
    /**
     * Les deux ne se confondent pas : l'attente abandonne la première et dit
     * QUEL élément elle n'a pas trouvé ; le test, lui, a le temps de rapporter
     * cet échec. Les mettre à la même valeur ferait revenir le message qui ne
     * nomme rien.
     */
    const jsdom = readFileSync(join(RACINE, "tests/setup/attenteJsdom.ts"), "utf8");
    const attente = /asyncUtilTimeout:\s*([0-9_]+)/.exec(jsdom);
    expect(attente, "l'attente de rendu doit être réglée").toBeTruthy();
    const valeurAttente = Number((attente?.[1] ?? "0").replace(/_/g, ""));
    const valeurTest = Number(
      (/testTimeout:\s*([0-9_]+)/.exec(config())?.[1] ?? "0").replace(/_/g, "")
    );
    expect(valeurAttente).toBe(4000);
    expect(valeurTest, "le test doit survivre confortablement à son attente")
      .toBeGreaterThan(valeurAttente * 2);
  });
});
