import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, it, expect } from "vitest";
import { ETATS_FACTURE, etatFacture, libelleEtatFacture } from "@/src/lib/factureStatut";

/**
 * Le statut d'une facture ne se lit qu'avec les mots de src/lib/factureStatut.ts.
 *
 * Une copie locale finit toujours par diverger : la fiche client disait
 * « Réglée » quand tout le reste disait « Payée ». Ce test relit le dépôt et
 * refuse tout libellé de statut de facture écrit en dur ailleurs.
 */

const RACINE = join(__dirname, "..");
const CENTRAL = "src/lib/factureStatut.ts";

function fichiers(dossier: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dossier)) {
    if (e === "node_modules" || e === ".next") continue;
    const p = join(dossier, e);
    if (statSync(p).isDirectory()) out.push(...fichiers(p));
    else if (/\.tsx?$/.test(e)) out.push(p);
  }
  return out;
}

/** Les textes d'un fichier : chaînes littérales et texte JSX, commentaires exclus. */
function textes(code: string, jsx: boolean): string[] {
  const sf = ts.createSourceFile("f.tsx", code, ts.ScriptTarget.Latest, true, jsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: string[] = [];
  const visiter = (n: ts.Node) => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) out.push(n.text);
    else if (ts.isJsxText(n)) out.push(n.text);
    ts.forEachChild(n, visiter);
  };
  visiter(sf);
  return out.map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean);
}

/** Les anciens mots, interdits partout : ils ne désignent qu'un statut de facture. */
const ANCIENS = ["Réglée", "Acquittée", "Partiellement réglée"];
/** Les mots du vocabulaire central, interdits en dur là où l'on parle de factures. */
const CENTRAUX = ETATS_FACTURE.map((e) => libelleEtatFacture(e));

const SOURCES = ["app", "src"].flatMap((d) => fichiers(join(RACINE, d))).map((chemin) => {
  const rel = chemin.slice(RACINE.length + 1).split("\\").join("/");
  const code = readFileSync(chemin, "utf8");
  return { rel, code, textes: textes(code, rel.endsWith("x")) };
});

/**
 * Mots qui coïncident avec un état sans en être un, avec leur raison.
 * Clé : « fichier » ; valeur : les mots permis et pourquoi.
 */
const EXCEPTIONS: Record<string, { mots: string[]; raison: string }> = {
  "app/(admin)/(espace-comptabilite)/factures/page.tsx": {
    mots: ["Avoir"],
    raison: "Type de pièce (facture, acompte, avoir) dans la colonne Type, pas le statut.",
  },
};

/** Un fichier parle de factures s'il lit la table, ses statuts, ou vit sous /factures/. */
const parleDeFactures = (rel: string, code: string) =>
  rel.includes("/factures/") ||
  /from\(\s*["']factures["']\s*\)/.test(code) ||
  /["'](acquittee|partiellement_reglee|annulee_par_avoir)["']|\b(acquittee|partiellement_reglee)\s*:/.test(code);

describe("le vocabulaire central des factures", () => {
  it("dit « Payée », « Émise », et connaît tous les états", () => {
    expect(libelleEtatFacture("payee")).toBe("Payée");
    expect(libelleEtatFacture("envoyee")).toBe("Émise");
    expect(ETATS_FACTURE).toEqual(["brouillon", "envoyee", "en_retard", "partiellement_payee", "payee", "avoir", "annulee"]);
    expect(libelleEtatFacture(etatFacture({ statut: "acquittee", numero: "FAC-1" }, "2026-09-16"))).toBe("Payée");
  });
});

describe("aucun libellé de statut de facture en dur hors de factureStatut.ts", () => {
  it("le dépôt est bien relu, et la règle attrape les formes d'avant", () => {
    expect(SOURCES.length).toBeGreaterThan(200);
    expect(textes(`const b = <span style={pill("#F4EAC9", "#6E5410")}>Réglée</span>;`, true)).toContain("Réglée");
    expect(textes(`// Réglée\nconst x = 1;`, false)).not.toContain("Réglée");
    expect(parleDeFactures("app/x.tsx", `if (s === "acquittee") return 1;`)).toBe(true);
  });

  it("« Réglée », « Acquittée », « Partiellement réglée » n'apparaissent nulle part comme libellé", () => {
    const fautes = SOURCES.filter((f) => f.rel !== CENTRAL)
      .flatMap((f) => f.textes.filter((t) => ANCIENS.includes(t)).map((t) => `${f.rel} : « ${t} »`));
    expect(fautes).toEqual([]);
  });

  it("là où l'on parle de factures, les états se lisent dans factureStatut.ts", () => {
    const fautes = SOURCES.filter((f) => f.rel !== CENTRAL && parleDeFactures(f.rel, f.code))
      .flatMap((f) => f.textes
        .filter((t) => CENTRAUX.includes(t) && !EXCEPTIONS[f.rel]?.mots.includes(t))
        .map((t) => `${f.rel} : « ${t} »`));
    expect(fautes).toEqual([]);
  });

  it("la fiche client passe par la pastille centrale", () => {
    const fiche = SOURCES.find((f) => f.rel === "app/(admin)/(espace-clients)/clients/[id]/page.tsx")!;
    expect(fiche.code).toMatch(/<BadgeFacture\s/);
    expect(fiche.code).not.toMatch(/factureBadge/);
  });
});
