import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  CASES,
  GROUPES,
  TAILLES_ARTICLE,
  champsDeCategorie,
  concerne,
  etiquettesRemplies,
  libelleTailleArticle,
  libelleValeur,
  nettoyerTailleArticle,
  nettoyerValeurs,
  normaliserCouleur,
  sansEtiquettes,
  type GroupeEtiquette,
} from "@/src/lib/etiquettesArticles";

/**
 * Les étiquettes des articles (APP 24-FILTRES).
 *
 * Deux gardes qui disent la même chose à deux endroits : la contrainte CHECK
 * en base, et `nettoyerValeurs` à la saisie. Ce fichier vérifie surtout
 * qu'elles ne peuvent pas DIVERGER — une valeur ajoutée au module sans l'être
 * à la migration serait acceptée par l'écran et refusée par la base, au pire
 * moment : à l'enregistrement d'une fiche qu'on vient de remplir.
 */

const MIGRATIONS = join(__dirname, "..", "supabase", "migrations");

/* La migration d'APP 24 elle-même : son existence, ses commentaires et ses
 * index sont éprouvés en tant que tels. Le VOCABULAIRE, lui, se cherche dans la
 * migration la plus récente qui le pose — voir vocabulaireDeLaMigration. */
const FICHIER = "20260926100404_app24_etiquettes_articles.sql";
const sql = () => readFileSync(join(MIGRATIONS, FICHIER), "utf8");

/**
 * Les valeurs d'un `check (colonne <@ array[...]::text[])`, prises dans la
 * migration LA PLUS RÉCENTE qui pose cette contrainte.
 *
 * Le nom du fichier était figé ici jusqu'à APP 27, et c'était le piège qu'APP 25
 * avait déjà rencontré sur la vue : le test comparait le module à une définition
 * périmée. Il a rougi quand « chaton » est entré — donc il a fait son travail —
 * mais il aurait pu tout aussi bien rester vert en comparant deux choses fausses
 * l'une comme l'autre. On cherche donc la définition qui FAIT FOI, celle que la
 * base porte réellement.
 */
function vocabulaireDeLaMigration(colonne: string): string[] {
  const motif = new RegExp(
    `check\\s*\\(\\s*${colonne}\\s*<@\\s*array\\[([\\s\\S]*?)\\]::text\\[\\]`,
    "i"
  );
  const trouve = readdirSync(MIGRATIONS)
    .filter((x) => x.endsWith(".sql")).sort()
    .map((x) => readFileSync(join(MIGRATIONS, x), "utf8"))
    .filter((texte) => motif.test(texte))
    .at(-1);
  const bloc = trouve ? motif.exec(trouve) : null;
  if (!bloc) return [];
  return [...bloc[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

describe("la migration des étiquettes", () => {
  it("est bien dans le dépôt, sous la version enregistrée en base", () => {
    expect(readdirSync(MIGRATIONS)).toContain(FICHIER);
  });

  it("ferme le vocabulaire de chaque liste fermée, avec <@", () => {
    const fermees: GroupeEtiquette[] = [
      "ages", "besoins", "tailles_chien", "proteines", "matieres", "usages_jouet",
    ];
    for (const groupe of fermees) {
      expect(vocabulaireDeLaMigration(groupe)).toEqual(
        GROUPES[groupe].valeurs.map((v) => v.valeur)
      );
    }
  });

  it("laisse les couleurs libres : aucune contrainte de vocabulaire", () => {
    expect(vocabulaireDeLaMigration("couleurs")).toEqual([]);
    expect(GROUPES.couleurs.valeurs).toEqual([]);
  });

  it("n'accepte qu'une taille d'article connue", () => {
    const clause = /check \(taille_article is null or taille_article in \(([^)]*)\)\)/.exec(sql());
    expect(clause).not.toBeNull();
    const valeurs = [...clause![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(valeurs).toEqual(TAILLES_ARTICLE.map((t) => t.valeur));
  });

  it("commente chaque colonne, en français, et indexe les quatre filtres d'emblée", () => {
    const texte = sql();
    for (const colonne of [
      "ages", "besoins", "tailles_chien", "proteines", "sans_cereales",
      "monoproteine", "taille_article", "couleurs", "matieres", "usages_jouet",
    ]) {
      expect(texte).toContain(`comment on column public.articles.${colonne} is`);
    }
    for (const colonne of ["ages", "besoins", "tailles_chien", "proteines"]) {
      expect(texte).toMatch(
        new RegExp(`create index if not exists articles_${colonne}_gin\\s+on public\\.articles using gin \\(${colonne}\\)`)
      );
    }
  });

  it("ne rend rien obligatoire : tableau vide, booléen faux, taille nulle", () => {
    const texte = sql();
    for (const colonne of ["ages", "besoins", "tailles_chien", "proteines", "couleurs", "matieres", "usages_jouet"]) {
      expect(texte).toMatch(new RegExp(`${colonne}\\s+text\\[\\]\\s+not null default '\\{\\}'`));
    }
    for (const colonne of ["sans_cereales", "monoproteine"]) {
      expect(texte).toMatch(new RegExp(`${colonne}\\s+boolean not null default false`));
    }
    expect(texte).toMatch(/taille_article\s+text,/);
  });
});

describe("ce qui entre en base", () => {
  it("refuse une valeur hors vocabulaire, même accompagnée d'une valeur juste", () => {
    expect(nettoyerValeurs("ages", ["chiot", "vieux"])).toEqual(["chiot"]);
    expect(nettoyerValeurs("proteines", ["licorne"])).toEqual([]);
    expect(nettoyerValeurs("tailles_chien", ["Géant"])).toEqual([]);
    expect(nettoyerValeurs("usages_jouet", ["macher", "manger"])).toEqual(["macher"]);
  });

  it("range dans l'ordre du vocabulaire, jamais dans celui des clics", () => {
    expect(nettoyerValeurs("ages", ["senior", "chiot", "adulte"]))
      .toEqual(["chiot", "adulte", "senior"]);
    // Deux fois la même pastille ne fait pas deux étiquettes.
    expect(nettoyerValeurs("besoins", ["light", "light"])).toEqual(["light"]);
  });

  it("ne se laisse pas donner autre chose qu'un tableau de chaînes", () => {
    expect(nettoyerValeurs("ages", "chiot")).toEqual([]);
    expect(nettoyerValeurs("ages", null)).toEqual([]);
    expect(nettoyerValeurs("ages", [1, { valeur: "chiot" }])).toEqual([]);
  });

  it("normalise une couleur libre, et refuse le vide comme le trop long", () => {
    expect(normaliserCouleur("  Bleu   Marine ")).toBe("bleu marine");
    expect(nettoyerValeurs("couleurs", ["ROUGE", "rouge", "  ", "vert"]))
      .toEqual(["rouge", "vert"]);
    expect(nettoyerValeurs("couleurs", ["x".repeat(31)])).toEqual([]);
  });

  it("n'accepte qu'une taille d'article connue", () => {
    expect(nettoyerTailleArticle("M")).toBe("M");
    expect(nettoyerTailleArticle("unique")).toBe("unique");
    expect(nettoyerTailleArticle("XXL")).toBeNull();
    expect(nettoyerTailleArticle("")).toBeNull();
    expect(nettoyerTailleArticle(42)).toBeNull();
  });
});

describe("ce que la catégorie demande", () => {
  it("l'alimentation parle composition, jamais couleur", () => {
    for (const categorie of ["alimentation_seche", "alimentation_humide", "friandises", "mastication"]) {
      expect(champsDeCategorie(categorie)).toEqual([
        // << gouts >> avant << proteines >> : ce que l emballage annonce,
        // puis tout ce que la recette contient (APP 25-GOUT).
        "ages", "besoins", "tailles_chien", "gouts", "proteines", "sans_cereales", "monoproteine",
      ]);
      expect(concerne(categorie, "couleurs")).toBe(false);
    }
  });

  it("l'équipement parle taille, couleur et matière, jamais protéine", () => {
    for (const categorie of ["colliers", "laisses", "harnais", "muselieres", "longes", "couchages"]) {
      expect(champsDeCategorie(categorie)).toEqual([
        "tailles_chien", "taille_article", "couleurs", "matieres",
      ]);
      expect(concerne(categorie, "proteines")).toBe(false);
    }
  });

  it("un jouet parle usage", () => {
    for (const categorie of ["jouets", "peluches"]) {
      expect(champsDeCategorie(categorie)).toEqual(["tailles_chien", "matieres", "usages_jouet"]);
    }
  });

  it("le reste ne demande que la taille du chien — y compris sans catégorie", () => {
    // APP 27 a sorti « litiere » et « soins » du défaut : voir plus bas.
    for (const categorie of ["medaillons_accessoires", "divers", "", null, undefined]) {
      expect(champsDeCategorie(categorie)).toEqual(["tailles_chien"]);
    }
  });

  it("APP 27 : une litière ne se choisit QUE par l'animal", () => {
    // Elle recevait « Taille du chien » par le défaut, ce qui ne servait
    // personne : on ne choisit pas une litière à la taille du chien.
    expect(champsDeCategorie("litiere")).toEqual([]);
  });

  it("APP 27 : « Type de soin » n'apparaît QUE dans le rayon des soins", () => {
    expect(champsDeCategorie("soins")).toEqual(["types_soin", "ages"]);
    const ailleurs = ["alimentation_seche", "alimentation_complete", "colliers",
                      "jouets", "griffoirs", "cages_enclos", "litiere", "divers"];
    for (const categorie of ailleurs) {
      expect(champsDeCategorie(categorie), categorie).not.toContain("types_soin");
    }
  });

  it("APP 27 : les trois rayons neufs demandent ce qu'il faut", () => {
    // L'alimentation complète est un aliment : mêmes étiquettes. Le croisement
    // avec l'animal retirera la taille du chien pour un foin de lapin.
    expect(champsDeCategorie("alimentation_complete"))
      .toEqual(champsDeCategorie("alimentation_seche"));
    // Un griffoir, une cage : un objet. Pas d'usage de jouet — on ne lance
    // pas une cage — et pas de taille de chien.
    for (const categorie of ["griffoirs", "cages_enclos"]) {
      expect(champsDeCategorie(categorie)).toEqual(["taille_article", "couleurs", "matieres"]);
    }
  });
});

describe("les libellés", () => {
  it("traduisent la valeur technique, accents compris", () => {
    expect(libelleValeur("tailles_chien", "geant")).toBe("Géant");
    expect(libelleValeur("proteines", "elan")).toBe("Élan");
    expect(libelleValeur("proteines", "boeuf")).toBe("Bœuf");
    expect(libelleValeur("usages_jouet", "macher")).toBe("À mâcher");
    expect(libelleTailleArticle("unique")).toBe("Taille unique");
  });

  it("montrent une couleur libre avec une majuscule, sans la connaître", () => {
    expect(libelleValeur("couleurs", "bordeaux")).toBe("Bordeaux");
  });

  it("ne laissent aucune valeur sans libellé", () => {
    for (const groupe of Object.keys(GROUPES) as GroupeEtiquette[]) {
      for (const v of GROUPES[groupe].valeurs) {
        expect(v.libelle.trim().length).toBeGreaterThan(0);
        // La valeur technique reste sobre : ni accent, ni majuscule, ni espace.
        expect(v.valeur).toMatch(/^[a-z_]+$/);
      }
    }
    expect(CASES.map((c) => c.champ)).toEqual(["sans_cereales", "monoproteine"]);
  });
});

describe("ce qui reste à compléter", () => {
  it("un article sans aucune étiquette utile est signalé", () => {
    expect(sansEtiquettes({ categorie: "colliers" })).toBe(true);
    expect(sansEtiquettes({ categorie: "colliers", ages: ["chiot"] })).toBe(true);
  });

  it("une case décochée ne compte pas pour une réponse", () => {
    expect(sansEtiquettes({ categorie: "friandises", sans_cereales: false })).toBe(true);
    expect(sansEtiquettes({ categorie: "friandises", sans_cereales: true })).toBe(false);
  });

  it("une seule étiquette utile suffit à ne plus l'être", () => {
    expect(sansEtiquettes({ categorie: "colliers", taille_article: "M" })).toBe(false);
    expect(sansEtiquettes({ categorie: "jouets", matieres: ["corde"] })).toBe(false);
  });
});

describe("la fiche en lecture", () => {
  it("n'affiche que ce qui est rempli, en libellés et dans l'ordre", () => {
    expect(
      etiquettesRemplies({
        categorie: "alimentation_seche",
        proteines: ["saumon", "poulet"],
        ages: ["senior"],
        sans_cereales: true,
        monoproteine: false,
        // Masquée par la catégorie : elle est gardée en base, pas montrée ici.
        couleurs: ["rouge"],
      })
    ).toEqual([
      { libelle: "Âge", valeurs: ["Senior"] },
      // << Proteines >> est devenu << Contient >> au lot APP 25-GOUT : la
      // colonne n a pas bouge, seul son nom a l ecran.
      { libelle: "Contient", valeurs: ["Saumon", "Poulet"] },
      { libelle: "Sans céréales", valeurs: ["Oui"] },
    ]);
  });

  it("ne rend rien quand rien n'est rempli", () => {
    expect(etiquettesRemplies({ categorie: "divers" })).toEqual([]);
  });
});
