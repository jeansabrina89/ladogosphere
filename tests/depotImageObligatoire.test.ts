import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Le passage obligé se garde tout seul, sinon il ne tient pas.
 *
 * Une règle que chaque auteur de route doit se rappeler est une règle que le
 * prochain oubliera — c'est exactement ce qui est arrivé : quatre routes
 * convertissaient, trois déposaient les octets bruts, et personne ne s'en
 * était aperçu avant qu'on aille regarder.
 *
 * Ce test relit les sources et refuse tout envoi vers le stockage écrit
 * ailleurs qu'au dépôt commun. Il échouera en nommant le fichier fautif.
 */

const RACINES = ["app", "src"];

/**
 * Les envois autorisés. **Un seul**, et c'est le but : la liste des exceptions
 * a été vidée le 23 septembre 2026, photos de chiens, boutique, options,
 * justificatifs et PDF de factures compris.
 *
 * N'ajouter une ligne ici qu'avec la raison écrite, et en sachant que chaque
 * ligne ajoutée est un endroit où une photo peut sortir avec l'adresse d'un
 * client dedans.
 */
const ENVOIS_CONNUS: Record<string, string> = {
  "src/lib/depotImage.ts": "LE passage obligé — deposerImage() et deposerDocument()",
};

function fichiersSources(dossier: string, trouves: string[] = []): string[] {
  for (const entree of readdirSync(dossier)) {
    if (entree === "node_modules" || entree === ".next") continue;
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) fichiersSources(chemin, trouves);
    else if (/\.(ts|tsx)$/.test(entree)) trouves.push(chemin);
  }
  return trouves;
}

describe("le dépôt d'image est un passage obligé", () => {
  const sources = RACINES.flatMap((r) => fichiersSources(join(process.cwd(), r)));

  it("aucune source ne dépose au stockage en dehors des envois connus", () => {
    const fautifs: string[] = [];
    for (const chemin of sources) {
      const texte = readFileSync(chemin, "utf8");
      // `.upload(` précédé, de près ou de loin, d'un `.storage`.
      if (!/\.storage[\s\S]{0,200}?\.upload\s*\(/.test(texte)) continue;
      const relatif = chemin
        .slice(process.cwd().length + 1)
        .split(String.fromCharCode(92))
        .join("/");
      if (!(relatif in ENVOIS_CONNUS)) fautifs.push(relatif);
    }
    expect(
      fautifs,
      `Ces fichiers envoient au stockage sans passer par src/lib/depotImage.ts. ` +
        `Une image déposée telle quelle garde ses métadonnées, et une photo qui circule les emporte. ` +
        `Passez par deposerImage(), ou inscrivez ici la raison écrite de ne pas le faire : ${fautifs.join(", ")}`,
    ).toEqual([]);
  });

  it("la liste des envois connus ne contient pas de mort : chaque fichier existe et dépose vraiment", () => {
    for (const relatif of Object.keys(ENVOIS_CONNUS)) {
      const texte = readFileSync(join(process.cwd(), relatif), "utf8");
      expect(/\.storage[\s\S]{0,200}?\.upload\s*\(/.test(texte), relatif).toBe(true);
    }
  });

  it("le garde-fou ne tolère plus aucune exception", () => {
    expect(Object.keys(ENVOIS_CONNUS)).toEqual(["src/lib/depotImage.ts"]);
  });

  it("chaque chemin d'entrée passe par le dépôt commun", () => {
    const chemins = [
      "app/api/chiens/[id]/photo/route.ts",
      "app/api/articles/[id]/photo/route.ts",
      "app/api/options/groupes/[id]/couleurs/route.ts",
      "app/api/options/groupes/[id]/guide/route.ts",
      "app/api/options/valeurs/[id]/photo/route.ts",
      "src/lib/pieces.ts",
      "src/lib/factureDocument.ts",
    ];
    for (const relatif of chemins) {
      const texte = readFileSync(join(process.cwd(), relatif), "utf8");
      expect(/deposer(Image|Document)\(/.test(texte), relatif).toBe(true);
      // Et aucun ne fabrique plus son propre envoi.
      expect(/\.storage[\s\S]{0,200}?\.upload\s*\(/.test(texte), relatif).toBe(false);
    }
  });
});
