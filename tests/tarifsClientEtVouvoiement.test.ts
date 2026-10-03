import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it, expect } from "vitest";

/**
 * APP 72 — la page « Tarifs » de l'espace client, et le vouvoiement.
 */

const RACINE = join(__dirname, "..");
const lire = (f: string) => readFileSync(join(RACINE, f), "utf8");

/** Le code sans commentaires : une explication n'est pas un texte affiché. */
const codeSeul = (t: string) => t
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (_m, a) => a);

const PAGE = codeSeul(lire("app/(client)/mon-compte/tarifs/page.tsx"));

describe("la page Tarifs du client", () => {
  it("dans l'ordre de Sabrina : adhésion, essai et garderie, pension, privatif", () => {
    const positions = [
      "★ Adhésion membre",
      "☀️ Journée d&apos;essai et garderie",
      "🏠 Pension (par nuit)",
      "🚪 Hébergement privatif",
    ].map((titre) => PAGE.indexOf(titre));
    expect(positions.every((p) => p > 0), positions.join(",")).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("l'encadré de l'adhésion passe AVANT l'état de l'adhésion et le bouton « Devenir membre »", () => {
    expect(PAGE.indexOf("★ Adhésion membre")).toBeLessThan(PAGE.indexOf("{estMembre && ("));
    expect(PAGE.indexOf("★ Adhésion membre")).toBeLessThan(PAGE.indexOf("★ Devenir membre"));
    // La branche Devenir membre / Renouveler garde sa logique.
    expect(PAGE).toContain(`{estRenouvellement ? "★ Renouveler mon adhésion" : "★ Devenir membre"}`);
  });

  it("une seule carte pour l'essai et la garderie, avec la phrase de Sabrina", () => {
    expect(PAGE).not.toContain("☀️ Garderie (journée)");
    expect(PAGE).not.toContain("🧪 Journée d&apos;essai");
    expect(PAGE).toContain(
      "La journée d&apos;essai est obligatoire pour tout nouveau chien avant la première réservation. Elle coûte le même prix qu&apos;une journée de garderie.",
    );
    // Les prix de l'essai SONT ceux de la garderie : une seule grille.
    expect(PAGE.match(/getPrix\(tarifs, "journee_partage_[123]", true\)/g)).toHaveLength(3);
  });

  it("les prix sont ceux d'un GROUPE de chiens, pas « par chien »", () => {
    expect(PAGE).not.toMatch(/par chien/i);
    expect(PAGE).toContain("Prix pour la journée, selon le nombre de chiens.");
    expect(PAGE).toContain("Prix par nuit, selon le nombre de chiens.");
  });

  it("le privatif vouvoie", () => {
    expect(PAGE).toContain("Box réservé à votre chien seul (sur demande).");
    expect(PAGE).not.toContain("ton chien");
  });
});

describe("l'espace client vouvoie", () => {
  function fichiers(dossier: string): string[] {
    return readdirSync(dossier).flatMap((n) => {
      const p = join(dossier, n);
      return statSync(p).isDirectory() ? fichiers(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
    });
  }
  const FICHIERS = [
    ...fichiers(join(RACINE, "app/(client)")),
    join(RACINE, "app/components/BoutonDemanderAdhesion.tsx"),
    join(RACINE, "app/components/NavBarClient.tsx"),
  ];

  /** Les formes du tutoiement, dans un TEXTE (pas un nom de variable comme `ton:`). */
  const TUTOIEMENT = [
    /(^|[\s"'`>(«—–-])(tu|Tu|ton|Ton|ta|Ta|tes|Tes|toi|Toi|te|Te)(?=[\s.,;:!?)»—–]|$)/,
    /-tu\b/,
    /\b(Contacte-nous|Reviens|Ajoute |Choisis |Sélectionne |Vérifie |Réserve une|règle-la|Règle-la)/,
  ];

  it("aucun texte adressé au client ne le tutoie", () => {
    const fautes: string[] = [];
    for (const f of FICHIERS) {
      codeSeul(readFileSync(f, "utf8")).split("\n").forEach((ligne, i) => {
        if (!/["'`]|>[^<]*[A-Za-zÀ-ÿ]/.test(ligne)) return;
        if (/\bton\s*:|\.ton\b|TON_/.test(ligne)) return; // une propriété, pas un mot
        if (TUTOIEMENT.some((r) => r.test(ligne))) fautes.push(`${relative(RACINE, f)}:${i + 1} ${ligne.trim().slice(0, 90)}`);
      });
    }
    expect(fautes).toEqual([]);
  });
});
