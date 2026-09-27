import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it, expect } from "vitest";
import { formatPrixClient, formatPrixFacture } from "@/src/lib/prixClient";

/**
 * Les deux écritures d'un montant, et la frontière entre elles.
 *
 * Ces tests ont suivi `formatPrixClient` quand elle a quitté
 * `venteEnLigneLogique` : ils appartiennent au module, pas à la boutique. Ce
 * qui reste dans `tests/prixClientBoutique.test.ts` garde les ÉCRANS de la
 * boutique ; ici on garde les deux FONCTIONS.
 *
 * Le dernier describe est celui qui compte le plus : il compare
 * `formatPrixFacture` au formateur local de `mon-compte/factures`, caractère
 * par caractère. Ces deux-là doivent rendre la même chose, et rien ne le
 * garantit à part ce test — la page des factures est volontairement restée
 * autonome, et deux écritures d'un même format finissent toujours par diverger.
 */

describe("le prix comme la cliente le lit", () => {
  it("un montant rond prend le tiret, pas « .00 »", () => {
    // Le tiret demi-cadratin (U+2013), celui des prix suisses. Pas le trait
    // d'union du clavier, qui est plus court et qu'on reconnaît à l'œil.
    expect(formatPrixClient(35)).toBe("35.–");
    expect(formatPrixClient(0)).toBe("0.–");
    expect(formatPrixClient(35)).not.toContain("-");
  });

  it("des centimes : toujours DEUX décimales", () => {
    // « 12.5 » se lirait comme un prix tronqué, et « 12.05 » ne doit surtout
    // pas devenir « 12.5 » : cinq centimes contre cinquante.
    expect(formatPrixClient(12.5)).toBe("12.50");
    expect(formatPrixClient(12.05)).toBe("12.05");
    expect(formatPrixClient(99.95)).toBe("99.95");
  });

  it("les milliers prennent l'apostrophe suisse", () => {
    expect(formatPrixClient(1250)).toBe("1'250.–");
    expect(formatPrixClient(1250.5)).toBe("1'250.50");
    // Deux groupes : la coupure se pose devant CHAQUE groupe de trois.
    expect(formatPrixClient(1234567)).toBe("1'234'567.–");
    expect(formatPrixClient(999)).toBe("999.–");
  });

  it("un montant négatif prend le SIGNE MOINS, pas un trait d'union", () => {
    // U+2212. C'est le caractère que les remises du panier utilisaient déjà :
    // la fonction reprend la convention au lieu d'en inventer une seconde.
    expect(formatPrixClient(-9.5)).toBe("−9.50");
    expect(formatPrixClient(-1250)).toBe("−1'250.–");
    expect(formatPrixClient(-9.5).charCodeAt(0)).toBe(0x2212);
  });

  it("un zéro venu d'une soustraction ne s'écrit pas « −0 »", () => {
    // `0 - 0` donne -0 en flottant, et `-0 < 0` est faux : c'est pour cela que
    // le signe se décide sur le nombre arrondi, jamais sur son écriture.
    expect(formatPrixClient(-0)).toBe("0.–");
    expect(formatPrixClient(-0.001)).toBe("0.–");
  });

  it("l'arrondi du flottant est fait AVANT de choisir la forme", () => {
    // 0.1 + 0.2 vaut 0.30000000000000004. Sans arrondi préalable, le test
    // « est-ce un entier ? » et la troncature porteraient sur ce nombre-là.
    expect(formatPrixClient(0.1 + 0.2)).toBe("0.30");
    expect(formatPrixClient(0.1 + 0.7)).toBe("0.80");
    // 35.004 est 35 au centime : la forme ronde est la bonne.
    expect(formatPrixClient(35.004)).toBe("35.–");
  });

  it("aucun « CHF » : la page entière est en francs", () => {
    for (const montant of [0, 35, 12.5, 1250, -9.5]) {
      expect(formatPrixClient(montant)).not.toContain("CHF");
    }
  });
});

describe("le montant d'une pièce : ce qui se compare à une facture", () => {
  it("garde toujours ses DEUX décimales, et son « CHF »", () => {
    expect(formatPrixFacture(226.5)).toBe("226.50 CHF");
    expect(formatPrixFacture(89)).toBe("89.00 CHF");
    expect(formatPrixFacture(0)).toBe("0.00 CHF");
  });

  it("un montant rond ne prend JAMAIS le tiret", () => {
    // C'est le cas qui distingue les deux formats à coup sûr : un montant à
    // centimes s'écrit pareil des deux côtés, un montant rond non.
    expect(formatPrixFacture(200)).toBe("200.00 CHF");
    expect(formatPrixFacture(200)).not.toContain("–");
    expect(formatPrixClient(200)).toBe("200.–");
  });

  it("accepte ce que Postgres renvoie pour un « numeric » : une chaîne", () => {
    // `montant_restant` arrive en chaîne. La page des factures fait déjà ce
    // `Number(n) || 0`, et cette fonction doit se comporter pareil.
    expect(formatPrixFacture("226.5")).toBe("226.50 CHF");
    expect(formatPrixFacture(null)).toBe("0.00 CHF");
    expect(formatPrixFacture(undefined)).toBe("0.00 CHF");
    expect(formatPrixFacture("pas un nombre")).toBe("0.00 CHF");
  });

  it("un avoir négatif garde le trait d'union de toFixed", () => {
    /**
     * Et c'est voulu : ce format-là imite la pièce comptable, qui écrit
     * « -12.05 ». Le signe moins typographique (U+2212) appartient à la
     * vitrine, où il se lit mieux ; une pièce s'écrit comme elle s'additionne.
     */
    expect(formatPrixFacture(-12.05)).toBe("-12.05 CHF");
    expect(formatPrixClient(-12.05)).toBe("−12.05");
  });

  it("pas de séparateur de milliers : la page des factures n'en met pas", () => {
    expect(formatPrixFacture(1250.5)).toBe("1250.50 CHF");
    expect(formatPrixFacture(1250.5)).not.toContain("'");
    // La vitrine, elle, groupe.
    expect(formatPrixClient(1250.5)).toBe("1'250.50");
  });
});

describe("LA GARANTIE : formatPrixFacture rend EXACTEMENT ce que la page des factures rend", () => {
  /**
   * `app/(client)/mon-compte/factures/page.tsx` garde son formateur local, sur
   * décision explicite : c'est l'écran de référence, celui que la cliente lit
   * avec son PDF ouvert. Mais deux écritures d'un même format finissent
   * toujours par diverger, et celle-là divergerait en silence.
   *
   * Ce test relit la ligne dans le dépôt, en reconstruit la fonction, et compare
   * les deux sorties. Il n'impose pas laquelle a raison — il impose qu'elles
   * soient d'accord.
   */
  const LIGNE = "const chf = (n: number) => `${(Number(n) || 0).toFixed(2)} CHF`;";

  it("la page des factures définit encore son formateur, mot pour mot", () => {
    const source = readFileSync(
      join(__dirname, "..", "app/(client)/mon-compte/factures/page.tsx"),
      "utf8",
    );
    expect(source, "si cette ligne change, le test suivant ne prouve plus rien").toContain(LIGNE);
  });

  it("les deux rendent la même chaîne, sur tous les cas qui comptent", () => {
    // La fonction de la page, reconstruite depuis sa propre définition.
    const chfPage = (n: number | string | null | undefined) =>
      `${(Number(n) || 0).toFixed(2)} CHF`;
    for (const montant of [0, 89, 200, 226.5, 12.05, 99.95, 1250.5, -12.05, "226.5", null, undefined]) {
      expect(formatPrixFacture(montant as number), String(montant)).toBe(chfPage(montant as number));
    }
  });
});

describe("UN SEUL CHEMIN D'IMPORT", () => {
  it("venteEnLigneLogique ne réexporte pas la fonction qu'elle a laissée partir", () => {
    /**
     * Un réexport de compatibilité aurait évité de toucher vingt-et-un fichiers,
     * et c'est précisément pour cela qu'il est interdit : les deux chemins
     * coexisteraient, le module quitté ne se viderait jamais, et le lot suivant
     * en ajouterait un troisième. Le déplacement n'est fini que quand l'ancien
     * chemin ne répond plus.
     */
    const source = readFileSync(join(__dirname, "..", "src/lib/venteEnLigneLogique.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split(/\r?\n/)
      .filter((l) => !l.trimStart().startsWith("//"))
      .join("\n");
    expect(source).not.toContain("formatPrixClient");
    expect(source).not.toContain("prixClient");
    // Et elle garde ce qui lui appartient vraiment.
    expect(source).toContain("export const TEXTE_NON_EXPEDIABLE");
  });

  it("personne n'importe formatPrixClient depuis l'ancien module", () => {
    const fichiers: string[] = [];
    const parcourir = (dossier: string) => {
      for (const entree of readdirSync(dossier)) {
        if (entree === "node_modules" || entree === ".next") continue;
        const complet = join(dossier, entree);
        if (statSync(complet).isDirectory()) parcourir(complet);
        else if (/\.tsx?$/.test(entree)) {
          const texte = readFileSync(complet, "utf8");
          // Un import qui nomme la fonction ET l'ancien module.
          for (const bloc of texte.match(/import\s*\{[^}]*\}\s*from\s*"[^"]+"/g) ?? []) {
            if (bloc.includes("formatPrixClient") && bloc.includes("venteEnLigneLogique")) {
              fichiers.push(relative(join(__dirname, ".."), complet).replace(/\\/g, "/"));
            }
          }
        }
      }
    };
    for (const racine of ["app", "src", "tests"]) parcourir(join(__dirname, "..", racine));
    expect(fichiers).toEqual([]);
  });
});
