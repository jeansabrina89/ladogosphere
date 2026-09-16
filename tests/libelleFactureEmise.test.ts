import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { etatFacture, libelleEtatFacture } from "@/src/lib/factureStatut";

/**
 * Le statut `envoyee` s'affiche « Émise ».
 *
 * La valeur date du temps où émettre une facture, c'était l'envoyer. Depuis
 * qu'elle ne part plus à son émission, « Envoyée » ment : une facture peut être
 * émise sans que le client l'ait jamais reçue. L'envoi par e-mail est une autre
 * information, et elle s'écrit toujours en toutes lettres — « Envoyée par
 * e-mail le … », « Envoyée le … » — à côté de l'état, jamais à sa place.
 */

describe("le vocabulaire des factures", () => {
  it("le statut envoyee se lit « Émise »", () => {
    expect(libelleEtatFacture("envoyee")).toBe("Émise");
    const etat = etatFacture(
      { statut: "envoyee", numero: "FAC-2026-0001", date_echeance: "2099-01-01", montant_restant: 100 },
      "2026-09-16"
    );
    expect(libelleEtatFacture(etat)).toBe("Émise");
  });

  it("la valeur en base ne change pas", () => {
    expect(etatFacture(
      { statut: "envoyee", numero: "FAC-2026-0001", date_echeance: "2099-01-01", montant_restant: 100 },
      "2026-09-16"
    )).toBe("envoyee");
  });
});

// ── Le dépôt ───────────────────────────────────────────────────────────────

const RACINE = join(__dirname, "..");

function fichiers(dossier: string): string[] {
  const trouves: string[] = [];
  for (const entree of readdirSync(dossier)) {
    if (entree === "node_modules" || entree === ".next") continue;
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) trouves.push(...fichiers(chemin));
    else if (/[.]tsx?$/.test(entree)) trouves.push(chemin);
  }
  return trouves;
}

/** Le code sans ses commentaires : ils ont le droit de raconter l'histoire du mot. */
const sansCommentaires = (s: string) =>
  s
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const SOURCES = ["app", "src"]
  .flatMap((d) => fichiers(join(RACINE, d)))
  .map((chemin) => ({
    chemin: chemin.slice(RACINE.length + 1).split("\\").join("/"),
    code: sansCommentaires(readFileSync(chemin, "utf8")),
  }));

/**
 * « Envoyée » n'est permis qu'en tête de l'information d'envoi, jamais seul
 * comme un état. Ces suites-là disent un envoi ; toute autre fait un libellé.
 */
const SUITES_D_ENVOI = [" par e-mail", " le ", " sans pièce jointe"];

function libellesEnvoyee(code: string): string[] {
  const trouves: string[] = [];
  for (const m of code.matchAll(/Envoyées?/g)) {
    const suite = code.slice(m.index! + m[0].length, m.index! + m[0].length + 20);
    if (!SUITES_D_ENVOI.some((s) => suite.startsWith(s))) {
      trouves.push(code.slice(Math.max(0, m.index! - 40), m.index! + m[0].length + 20).replace(/\s+/g, " "));
    }
  }
  return trouves;
}

describe("aucun libellé visible n’associe encore le statut envoyee à « Envoyée »", () => {
  it("le dépôt est bien relu (garde-fou du garde-fou)", () => {
    expect(SOURCES.length).toBeGreaterThan(200);
    // Et la règle attrape bien les formes d'avant.
    expect(libellesEnvoyee(`envoyee: "Envoyée",`)).toHaveLength(1);
    expect(libellesEnvoyee(`{ val: "envoyee", label: "Envoyée" }`)).toHaveLength(1);
    expect(libellesEnvoyee(`<span style={pill("#E4E7F1", "#2A3B6B")}>Envoyée</span>`)).toHaveLength(1);
    // …sans refuser l'information d'envoi.
    expect(libellesEnvoyee("`Envoyée par e-mail le ${date}.`")).toEqual([]);
    expect(libellesEnvoyee("Envoyée le {date}")).toEqual([]);
  });

  it("« Envoyée » n’apparaît plus nulle part comme un état", () => {
    const fautifs = SOURCES.flatMap((f) => libellesEnvoyee(f.code).map((extrait) => `${f.chemin} : ${extrait}`));
    expect(fautifs).toEqual([]);
  });

  it("le filtre de la liste et la fiche client lisent le vocabulaire central", () => {
    const code = (chemin: string) => SOURCES.find((f) => f.chemin === chemin)!.code;
    expect(code("app/(admin)/(espace-comptabilite)/factures/FiltresFactures.tsx"))
      .toContain("libelleEtatFacture(e)");
    expect(code("app/(admin)/(espace-clients)/clients/[id]/page.tsx"))
      .toMatch(/<BadgeFacture facture={f}/);
  });
});

describe("l’état et l’envoi restent deux informations distinctes", () => {
  it("sur la fiche facture, le badge dit l’état ; la ligne d’envoi nomme l’e-mail", () => {
    const actions = SOURCES.find((f) => f.chemin.endsWith("factures/[id]/ActionsFacture.tsx"))!.code;
    expect(actions).toContain("Envoyée par e-mail le ${");
    expect(actions).toContain("Pas encore envoyée par e-mail.");
    const page = SOURCES.find((f) => f.chemin === "app/(admin)/(espace-comptabilite)/factures/[id]/page.tsx")!.code;
    expect(page).toContain("<BadgeFacture facture={facture}");
  });

  it("« Émise » et « Envoyée » ne se confondent pas", () => {
    expect(libelleEtatFacture("envoyee")).not.toMatch(/^Envoy/);
  });
});
