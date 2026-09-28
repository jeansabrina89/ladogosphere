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

/**
 * `scripts` a été ajouté le 28.09.2026 (APP 35 bis).
 *
 * Le balayage s'arrêtait à `app` et `src` : un script d'import déposait donc
 * dans le bucket sans que ce test le voie. Un garde-fou qui ne regarde pas
 * partout où l'on écrit donne surtout l'impression d'être gardé.
 */
const RACINES = ["app", "src", "scripts"];

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
  /**
   * APP 35 — import des photos Eric Schweizer, script à USAGE UNIQUE.
   *
   * Il ne pouvait pas emprunter le passage obligé : `deposerImage()` importe
   * `@/src/lib/supabase-admin`, et l'alias `@/` n'existe qu'au build — node ne
   * le résout pas. Il a donc son propre envoi.
   *
   * Ce que le passage obligé protège tient quand même : les octets déposés
   * sortent de `convertirEnWebp(…, FORMAT_ARTICLE)` de `src/lib/imageBoutique`,
   * importé tel quel, qui redimensionne ET jette les métadonnées. Rien de brut
   * ne part. Vérifié par le test ci-dessous, qui relit le script.
   *
   * Cette ligne se retire le jour où le script n'a plus de raison d'exister.
   */
  "scripts/import-photos-schweizer.mjs":
    "Script à usage unique — convertit par convertirEnWebp() avant de déposer",
};

function fichiersSources(dossier: string, trouves: string[] = []): string[] {
  for (const entree of readdirSync(dossier)) {
    if (entree === "node_modules" || entree === ".next") continue;
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) fichiersSources(chemin, trouves);
    // `.mjs` et `.js` aussi : les scripts du dépôt n'ont pas d'autre forme, et
    // c'est justement là que le balayage ne regardait pas.
    else if (/\.(ts|tsx|mjs|js)$/.test(entree)) trouves.push(chemin);
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

  it("la liste des exceptions est CELLE-CI, et elle ne grandit pas toute seule", () => {
    /**
     * Elle avait été vidée le 23.09.2026 et tenait à une seule ligne. La
     * seconde est un script d'usage unique (APP 35) qui ne peut pas importer
     * le passage obligé. Figer la liste ici oblige à écrire la raison dans le
     * même geste qu'on l'allonge.
     */
    expect(Object.keys(ENVOIS_CONNUS).sort()).toEqual([
      "scripts/import-photos-schweizer.mjs",
      "src/lib/depotImage.ts",
    ]);
  });

  it("le script qui dépose lui-même convertit AVANT, par la fonction de l'app", () => {
    /**
     * C'est la raison écrite de son exception, et une raison qui ne se vérifie
     * pas est une raison qu'on finit par recopier ailleurs. S'il déposait les
     * octets reçus du fournisseur, il publierait ce que l'app refuse.
     */
    const source = readFileSync(
      join(process.cwd(), "scripts/import-photos-schweizer.mjs"),
      "utf8",
    );
    expect(source, "il importe la conversion de l'app").toMatch(
      /import\s*\{[\s\S]*?convertirEnWebp[\s\S]*?\}\s*from\s*["'][^"']*imageBoutique\.ts["']/,
    );
    // Ce qui part au bucket est le produit de la conversion, jamais les octets reçus.
    expect(source).toMatch(/\.upload\(\s*chemin,\s*conversion\.octets/);
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
