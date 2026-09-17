import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, it, expect } from "vitest";

/**
 * La facture d'acompte a été retirée le 17 septembre 2026.
 *
 * Sabrina encaisse l'acompte de la main à la main ; depuis APP 17k, cet
 * encaissement se rattache tout seul à la facture définitive. La facture
 * d'acompte, elle, n'avait jamais été terminée : son paiement restait au 2030
 * sans réduire la facture définitive, et le client se voyait réclamer deux
 * fois la même somme.
 *
 * Ce test garde la porte fermée — et vérifie que ce qui est derrière tient
 * toujours debout : les pièces d'acompte existantes s'affichent et s'impriment.
 */

const RACINE = join(__dirname, "..");

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

const SOURCES = ["app", "src"].flatMap((d) => fichiers(join(RACINE, d))).map((chemin) => {
  const rel = relative(RACINE, chemin).split("\\").join("/");
  const code = readFileSync(chemin, "utf8");
  return { rel, code, sf: ts.createSourceFile(rel, code, ts.ScriptTarget.Latest, true, rel.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS) };
});

/** Les écritures sur `factures` qui posent type: "acompte". */
export function creationsDAcompte(sf: ts.SourceFile): number[] {
  const out: number[] = [];
  const visiter = (n: ts.Node) => {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)
        && ["insert", "upsert", "update"].includes(n.expression.name.text)) {
      // Remonter la chaîne jusqu'au .from("factures").
      let x: ts.Expression = n.expression.expression;
      let table: string | null = null;
      while (ts.isCallExpression(x) || ts.isPropertyAccessExpression(x)) {
        if (ts.isCallExpression(x) && ts.isPropertyAccessExpression(x.expression)
            && x.expression.name.text === "from" && x.arguments[0] && ts.isStringLiteral(x.arguments[0])) {
          table = x.arguments[0].text;
          break;
        }
        x = x.expression;
      }
      if (table !== "factures") { ts.forEachChild(n, visiter); return; }

      const poseAcompte = (o: ts.Node): boolean => {
        if (ts.isArrayLiteralExpression(o)) return o.elements.some(poseAcompte);
        if (!ts.isObjectLiteralExpression(o)) return false;
        return o.properties.some((p) =>
          ts.isPropertyAssignment(p)
          && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) && p.name.text === "type"
          && ts.isStringLiteral(p.initializer) && p.initializer.text === "acompte");
      };
      const arg = n.arguments[0];
      if (arg && poseAcompte(arg)) out.push(sf.getLineAndCharacterOfPosition(n.getStart()).line + 1);
    }
    ts.forEachChild(n, visiter);
  };
  visiter(sf);
  return out;
}

describe("plus aucun chemin ne crée une facture d'acompte", () => {
  it("la règle attrape bien une création", () => {
    const sf = ts.createSourceFile("x.ts",
      `await supabaseAdmin.from("factures").insert({ client_id: c, type: "acompte", statut: "brouillon" });`,
      ts.ScriptTarget.Latest, true);
    expect(creationsDAcompte(sf)).toEqual([1]);
    // Une facture d'un autre type, ou une lecture, ne déclenchent rien.
    const autre = ts.createSourceFile("y.ts",
      `await supabaseAdmin.from("factures").insert({ type: "libre" });
       const x = await supabaseAdmin.from("factures").select("id").eq("type", "acompte");`,
      ts.ScriptTarget.Latest, true);
    expect(creationsDAcompte(autre)).toEqual([]);
  });

  it("aucune action serveur, aucune route du dépôt n'en crée", () => {
    expect(SOURCES.length).toBeGreaterThan(200);
    const fautes = SOURCES.flatMap((s) => creationsDAcompte(s.sf).map((ligne) => `${s.rel}:${ligne}`));
    expect(fautes).toEqual([]);
  });

  it("le point d'entrée a disparu : plus d'action ni de bouton", () => {
    expect(existsSync(join(RACINE, "app/(admin)/(espace-clients)/reservations/[id]/DemanderAcompte.tsx"))).toBe(false);
    const nomme = SOURCES.filter((s) => /creerFactureAcompte|DemanderAcompte/.test(s.code)).map((s) => s.rel);
    expect(nomme).toEqual([]);
    const bloc = SOURCES.find((s) => s.rel === "app/(admin)/(espace-clients)/reservations/[id]/BlocFacturation.tsx")!;
    expect(bloc.code).not.toMatch(/peutAcompte/);
    // Le bouton Encaisser, lui, reste : c'est par là que passe l'acompte.
    expect(bloc.code).toContain("<Encaisser");
  });
});

describe("les pièces d'acompte existantes s'affichent et s'impriment", () => {
  const source = (rel: string) => SOURCES.find((s) => s.rel === rel)!;

  it("le moteur comptable garde sa branche acompte", () => {
    const compta = source("src/lib/comptaFactureLogique.ts").code;
    expect(compta).toMatch(/f\.type === "acompte"/);
    expect(compta).toContain("COMPTE_ACOMPTES");
  });

  it("le PDF garde son titre « Facture d'acompte »", () => {
    expect(source("src/lib/facturePdf.tsx").code).toMatch(/type === "acompte"[\s\S]{0,120}FACTURE D/);
  });

  it("la fiche de réservation continue de lister les acomptes de la réservation", () => {
    const bloc = source("app/(admin)/(espace-clients)/reservations/[id]/BlocFacturation.tsx").code;
    expect(bloc).toContain(`const acomptes = factures.filter((f) => f.type === "acompte" && f.numero);`);
    expect(bloc).toMatch(/\{acomptes\.map\(\(a\) => \(/);
    expect(bloc).toMatch(/facture\.type === "acompte" \? "Acompte " : "Facture "/);
  });

  it("l'imputation des acomptes déjà encaissés reste en base", () => {
    const dossier = join(RACINE, "supabase", "migrations");
    const derniere = new Map<string, string>();
    for (const f of readdirSync(dossier).filter((x) => x.endsWith(".sql")).sort()) {
      const sql = readFileSync(join(dossier, f), "utf8");
      const re = /create\s+or\s+replace\s+function\s+(?:public\.)?(\w+)\s*\([\s\S]*?\$(\w*)\$([\s\S]*?)\$\2\$/gi;
      for (const m of sql.matchAll(re)) derniere.set(m[1], m[3]);
    }
    expect(derniere.get("acomptes_a_imputer")).toMatch(/fa\.type = 'acompte'/);
  });
});
