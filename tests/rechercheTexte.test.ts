import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  saisieRecherchable,
  filtreRecherchePersonne,
} from "@/src/lib/rechercheTexte";

/**
 * C-11 : la saisie de l'utilisateur n'écrit plus le filtre (APP 29).
 *
 * Trois recherches assemblaient la saisie directement dans un `.or()` :
 *
 *   .or(`prenom.ilike.%${q}%,nom.ilike.%${q}%,email.ilike.%${q}%`)
 *
 * Une virgule y sépare les conditions. Taper « a,nom.eq.Dupont » ne cherchait
 * plus « a » : cela ajoutait une condition que personne n'avait demandée.
 *
 * ── CE QUE CE N'EST PAS, ET POURQUOI C'EST QUAND MÊME FERMÉ ───────────────
 *
 * Pas une injection SQL : PostgREST passe la valeur en paramètre. C'est une
 * injection de FILTRE — on choisit quelles lignes remontent. L'impact mesuré au
 * lot 21 était « personnel seulement », les trois recherches étant derrière une
 * garde. Mais un filtre qu'on n'a pas écrit est un filtre qu'on ne contrôle pas,
 * et la garde d'aujourd'hui n'est pas celle de demain.
 */

describe("ce qui est retiré d'une saisie", () => {
  it("la VIRGULE part : c'est elle qui séparait les conditions", () => {
    // Le cas du brief. Sans neutralisation, ceci ajoutait `nom.eq.x` au filtre.
    const filtre = filtreRecherchePersonne("a,nom.eq.x");
    expect(filtre).not.toBeNull();
    // Une seule virgule par colonne dans le filtre rendu : celles qui séparent
    // les trois conditions que NOUS écrivons, et pas une de plus.
    expect((filtre!.match(/,/g) ?? []).length, "trois conditions, deux virgules").toBe(2);
    expect(filtre).toBe("prenom.ilike.%a nom.eq.x%,nom.ilike.%a nom.eq.x%,email.ilike.%a nom.eq.x%");
  });

  it("les PARENTHÈSES partent : elles permettaient de grouper", () => {
    // `and(...)`, `or(...)`, `in.(...)` : de quoi construire un filtre entier.
    const filtre = filtreRecherchePersonne("a(and(b,c))");
    expect(filtre).not.toContain("(");
    expect(filtre).not.toContain(")");
  });

  it("les JOKERS partent : ils élargissaient la recherche à l'insu de qui tape", () => {
    // « %% » aurait ramené tout le fichier clients dans une liste faite pour
    // huit lignes. Ce n'est pas une injection, c'est une surprise.
    expect(saisieRecherchable("%%")).toBe("");
    expect(saisieRecherchable("a%b")).toBe("a b");
    expect(saisieRecherchable("a*b")).toBe("a b");
    // Et le filtre rendu ne porte que les jokers que NOUS ajoutons.
    const filtre = filtreRecherchePersonne("Mul%ler");
    expect((filtre!.match(/%/g) ?? []).length, "deux par colonne, six en tout").toBe(6);
  });

  it("les guillemets et l'antislash partent aussi", () => {
    // PostgREST cite une valeur avec des guillemets doubles ; l'antislash échappe
    // dans un motif `like`, donc change le sens du caractère suivant.
    expect(saisieRecherchable('a"b')).toBe("a b");
    expect(saisieRecherchable("a\\b")).toBe("a b");
  });

  it("ce qui est retiré devient une ESPACE, pas rien", () => {
    // « Müller,Anna » cherche « Müller Anna », ce qui est probablement voulu.
    // « MüllerAnna » ne trouverait personne.
    expect(saisieRecherchable("Müller,Anna")).toBe("Müller Anna");
  });
});

describe("ce qui reste, et c'est délibéré", () => {
  it("le POINT reste : sans lui, plus de recherche par adresse", () => {
    /**
     * Le brief citait le point parmi les caractères à neutraliser. Il ne l'est
     * pas, et cela se vérifie : le point ne sépare que le nom de colonne de
     * l'opérateur et de la valeur — `prenom.ilike.<valeur>`. Passé le second
     * point, tout appartient à la valeur jusqu'à la virgule suivante. Un point
     * DANS la valeur n'ouvre donc rien.
     *
     * Le retirer coûterait une fonction : « jean.dupont@example.ch » deviendrait
     * « jean dupont@example ch », et l'e-mail est l'une des trois colonnes que
     * ces recherches interrogent.
     */
    expect(saisieRecherchable("jean.dupont@example.ch")).toBe("jean.dupont@example.ch");
    expect(filtreRecherchePersonne("jean.dupont@example.ch"))
      .toContain("email.ilike.%jean.dupont@example.ch%");
  });

  it("l'APOSTROPHE reste : « d'Andrès » se cherche tel qu'il s'écrit", () => {
    // Le cas du brief. Elle n'est dangereuse qu'en SQL assemblé à la main, ce
    // qui n'arrive pas ici.
    expect(saisieRecherchable("d'Andrès")).toBe("d'Andrès");
    expect(filtreRecherchePersonne("d'Andrès"))
      .toBe("prenom.ilike.%d'Andrès%,nom.ilike.%d'Andrès%,email.ilike.%d'Andrès%");
  });

  it("les accents et le tréma passent intacts", () => {
    // Le cas du brief. Une pension valaisanne cherche des Müller et des Andrès.
    expect(filtreRecherchePersonne("Müller"))
      .toBe("prenom.ilike.%Müller%,nom.ilike.%Müller%,email.ilike.%Müller%");
  });

  it("le tiret et l'espace passent : « Marie-Claire Van Der Berg »", () => {
    expect(saisieRecherchable("Marie-Claire Van Der Berg")).toBe("Marie-Claire Van Der Berg");
  });
});

describe("quand il ne reste rien de cherchable", () => {
  it("rend null, pour qu'on n'interroge PAS la base", () => {
    /**
     * Un motif vide donnerait « %% » : tout le fichier clients. La règle des deux
     * caractères existait déjà ; ce qui est nouveau, c'est qu'elle s'applique
     * APRÈS neutralisation — « %,% » faisait trois caractères avant, et zéro
     * après.
     */
    expect(filtreRecherchePersonne("%,%")).toBeNull();
    expect(filtreRecherchePersonne("(),")).toBeNull();
    expect(filtreRecherchePersonne("a")).toBeNull();
    expect(filtreRecherchePersonne("")).toBeNull();
    expect(filtreRecherchePersonne(null)).toBeNull();
    expect(filtreRecherchePersonne(undefined)).toBeNull();
    expect(filtreRecherchePersonne("   ")).toBeNull();
  });

  it("deux caractères utiles suffisent, comme avant", () => {
    expect(filtreRecherchePersonne("Du")).not.toBeNull();
  });
});

describe("les trois recherches passent par la fonction unique", () => {
  const src = (c: string) => readFileSync(join(__dirname, "..", c), "utf8");
  const RECHERCHES = [
    "app/(admin)/boutique/caisse/actions.ts",
    "app/(admin)/boutique/caisse/sur-mesure/actions.ts",
    "src/lib/prestationsDb.ts",
  ];

  it("aucune n'assemble plus la saisie elle-même", () => {
    /**
     * LA MUTATION EN DUR. Si quelqu'un réécrit un `.or()` avec un gabarit, ce
     * test rougit — y compris dans un écran neuf, puisqu'il relit les fichiers.
     *
     * Le motif cherché est l'assemblage : `ilike.${...}` ou `ilike.%${...}`.
     */
    for (const chemin of RECHERCHES) {
      const s = src(chemin);
      expect(s, `${chemin} assemble encore la saisie`)
        .not.toMatch(/ilike\.\$\{|ilike\.%\$\{/);
      expect(s, `${chemin} doit passer par la fonction unique`)
        .toContain("filtreRecherchePersonne(");
    }
  });

  it("et chacune refuse d'interroger la base quand il ne reste rien", () => {
    // Sans ce retour, un motif vide ramènerait tout le fichier.
    for (const chemin of RECHERCHES) {
      expect(src(chemin), chemin).toMatch(/if \(!filtre\) return \[\];/);
    }
  });

  it("la neutralisation n'est écrite qu'à UN endroit", () => {
    /**
     * `prestationsDb` retirait déjà « % , ( ) » de son côté — mais pas les
     * guillemets ni l'antislash. Trois recherches, trois neutralisations
     * différentes : c'est ainsi qu'une règle cesse d'être la même selon l'écran.
     */
    for (const chemin of RECHERCHES) {
      expect(src(chemin), `${chemin} ne doit plus neutraliser de son côté`)
        .not.toMatch(/replace\(\/\[[%,()]+\]/);
    }
    // Et la liste des interdits vit dans le module partagé, une seule fois.
    const partage = src("src/lib/rechercheTexte.ts");
    expect((partage.match(/const INTERDITS/g) ?? []).length).toBe(1);
  });
});
