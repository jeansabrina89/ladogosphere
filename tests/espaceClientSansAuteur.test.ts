import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, it, expect } from "vitest";

/**
 * Le client ne voit RIEN de qui, dans l'équipe, a fait quoi : ni historique,
 * ni initiales, ni nom d'employée. Ni dans son espace, ni dans un e-mail, ni
 * dans un PDF qu'on lui envoie.
 *
 * Ce test relit le dépôt, commentaires retirés : un commentaire qui en parle
 * n'est pas une fuite.
 */

function fichiers(dossier: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dossier)) {
    const p = join(dossier, e);
    if (statSync(p).isDirectory()) out.push(...fichiers(p));
    else if (/\.tsx?$/.test(e)) out.push(p);
  }
  return out;
}

/** Le code sans ses commentaires, via le scanner de TypeScript. */
function sansCommentaires(texte: string): string {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.JSX, texte);
  let out = "";
  for (let t = scanner.scan(); t !== ts.SyntaxKind.EndOfFileToken; t = scanner.scan()) {
    if (t === ts.SyntaxKind.SingleLineCommentTrivia || t === ts.SyntaxKind.MultiLineCommentTrivia) continue;
    out += scanner.getTokenText();
  }
  return out;
}

/** Ce qui ne doit jamais apparaître dans ce que le client reçoit. */
const INTERDITS: [RegExp, string][] = [
  [/\blireHistorique\w*\b/, "lecture de l'historique"],
  [/\blireGestesCheckin\b/, "auteurs des pointages"],
  [/\binitialesDe\b/, "initiales d'un auteur"],
  [/\bnomCompletDe\b/, "nom d'un auteur"],
  [/\bauteurAffiche\b/, "auteur affiché"],
  [/\blireAuteurs\b/, "lecture des auteurs"],
  [/\binitiales\b/, "lecture de profiles.initiales"],
  [/@\/src\/lib\/(auteur|auteursDb)["']/, "import du module des auteurs"],
  [/components\/(AuteurGeste|HistoriqueGestes|PointageFait|ResultatEssaiSaisi)["']/, "composant d'auteur"],
];

function fuites(chemins: string[]): string[] {
  const racine = process.cwd();
  const out: string[] = [];
  for (const chemin of chemins) {
    const code = sansCommentaires(readFileSync(chemin, "utf8"));
    for (const [motif, quoi] of INTERDITS) {
      if (motif.test(code)) out.push(`${relative(racine, chemin).split("\\").join("/")} : ${quoi}`);
    }
  }
  return out;
}

describe("l'espace client ne montre aucun auteur", () => {
  it("aucune page ni action de app/(client)/ ne lit l'historique ou des initiales", () => {
    const chemins = fichiers(join(process.cwd(), "app", "(client)"));
    expect(chemins.length).toBeGreaterThan(10);
    expect(fuites(chemins)).toEqual([]);
  });

  it("les e-mails et les PDF envoyés au client non plus", () => {
    const lib = join(process.cwd(), "src", "lib");
    const chemins = readdirSync(lib)
      .filter((f) => /^(email|ticket|facturePdf|factureDocument|abonnementFacture)/i.test(f) && /\.tsx?$/.test(f))
      .map((f) => join(lib, f));
    expect(chemins.length).toBeGreaterThan(2);
    expect(fuites(chemins)).toEqual([]);
  });

  it("le ticket de caisse ne nomme plus la personne qui a servi", () => {
    const pdf = sansCommentaires(readFileSync(join(process.cwd(), "src/lib/ticketPdf.tsx"), "utf8"));
    const doc = sansCommentaires(readFileSync(join(process.cwd(), "src/lib/ticketDocument.ts"), "utf8"));
    expect(pdf).not.toMatch(/Servi par/);
    expect(doc).not.toMatch(/vendu_par/);
  });

  it("le scanner retire bien les commentaires (le test ne se trompe pas de cible)", () => {
    expect(sansCommentaires("// initialesDe\nconst a = 1; /* lireHistorique */")).not.toMatch(/initialesDe|lireHistorique/);
    expect(fuites([join(process.cwd(), "app/components/AuteurGeste.tsx")])).not.toEqual([]);
  });
});
