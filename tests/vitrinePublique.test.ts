import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  COLONNES_INTERDITES_AU_PUBLIC,
  COLONNES_PUBLIQUES_VITRINE,
  COLONNES_VITRINE,
} from "@/src/lib/vitrineColonnes";

/**
 * `articles_vitrine` est PUBLIQUE (constat S-04).
 *
 * Elle est lue avec la clé anon, depuis un autre projet, et elle reste
 * SECURITY DEFINER parce que `articles` est en RLS : c'est donc sa LISTE DE
 * COLONNES qui tient lieu de garde. Ce test la compare, terme à terme, à la
 * liste écrite et justifiée dans la migration. Une colonne ajoutée d'un côté
 * seulement fait échouer le test — c'est tout l'intérêt : une colonne
 * publique se décide, elle ne s'ajoute pas au passage.
 */

const MIGRATIONS = join(__dirname, "..", "supabase", "migrations");
/**
 * La DERNIÈRE migration qui redéfinit la vue — c'est elle qui fait foi.
 *
 * Elle était nommée en dur, et pointait encore sur APP 24-filtres après que
 * APP 25-GOÛT eut ajouté une colonne : le test comparait la liste TS à une
 * définition périmée. On la cherche donc, au lieu de la nommer.
 */
const FICHIER = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith(".sql"))
  .filter((f) => /create\s+(or\s+replace\s+)?view\s+public\.articles_vitrine/i
    .test(readFileSync(join(MIGRATIONS, f), "utf8")))
  .sort()
  .at(-1)!;
const sql = () => readFileSync(join(MIGRATIONS, FICHIER), "utf8");

/** Les colonnes RENDUES par la vue, lues dans son `create view`. */
function colonnesDeLaVue(): string[] {
  const texte = sql();
  const entete = /create\s+(?:or\s+replace\s+)?view\s+public\.articles_vitrine[\s\S]*?\bas\s*select/i
    .exec(texte);
  expect(entete, `aucun create view dans ${FICHIER}`).not.toBeNull();
  const debut = entete!.index;
  const fin = texte.indexOf("from public.articles a", debut);
  expect(fin).toBeGreaterThan(debut);
  const corps = texte
    .slice(debut, fin)
    .replace(entete![0], "")
    // Les commentaires du SQL ne sont pas des colonnes.
    .replace(/--[^\n]*/g, "");

  const colonnes: string[] = [];
  let profondeur = 0;
  let courant = "";
  for (const c of corps) {
    if (c === "(" || c === "[") profondeur++;
    else if (c === ")" || c === "]") profondeur--;
    if (c === "," && profondeur === 0) {
      colonnes.push(courant);
      courant = "";
    } else courant += c;
  }
  colonnes.push(courant);

  return colonnes
    .map((c) => c.replace(/\s+/g, " ").trim())
    .filter((c) => c.length > 0)
    .map((c) => {
      // « … as en_stock » : c'est l'alias qui sort. Sinon « a.nom » → « nom ».
      const alias = / as (\w+)$/i.exec(c);
      if (alias) return alias[1];
      return c.replace(/^a\./, "");
    });
}

describe("la vue de la vitrine", () => {
  it("est dans le dépôt, sous la version enregistrée en base", () => {
    expect(readdirSync(MIGRATIONS)).toContain(FICHIER);
  });

  it("n'expose AUCUNE colonne hors de la liste publique, ni dans un sens ni dans l'autre", () => {
    expect(colonnesDeLaVue()).toEqual([...COLONNES_PUBLIQUES_VITRINE]);
  });

  it("porte bien les étiquettes des filtres", () => {
    const rendues = colonnesDeLaVue();
    for (const colonne of [
      "ages", "besoins", "tailles_chien", "proteines", "sans_cereales",
      "monoproteine", "taille_article", "couleurs", "matieres", "usages_jouet",
      // Le goût annoncé, ajouté au lot APP 25-GOÛT. Distinct de `proteines` :
      // un pâté « avec agneau » peut contenir plus de poulet que d'agneau.
      "gouts",
      // Demandées par le lot, déjà présentes avant lui.
      "marque", "expediable", "en_stock",
    ]) {
      expect(rendues).toContain(colonne);
    }
  });

  it("ne porte rien de ce qui est interdit au public — stock chiffré compris", () => {
    const rendues = colonnesDeLaVue();
    for (const interdite of COLONNES_INTERDITES_AU_PUBLIC) {
      expect(rendues).not.toContain(interdite);
      expect(COLONNES_VITRINE).not.toContain(interdite);
    }
    // `stock_disponible` était dans la vue avant ce lot : elle en sort.
    expect(rendues).not.toContain("stock_disponible");
    expect(sql()).not.toMatch(/as stock_disponible/);
  });

  it("dit pourquoi chaque colonne publique l'est", () => {
    /**
     * La justification vit dans la migration QUI AJOUTE la colonne, et il y en
     * a maintenant plusieurs : APP 24-filtres a posé la vue et justifié ses
     * colonnes, APP 25-GOÛT en a ajouté une et justifié celle-là. On cherche
     * donc dans l'ensemble des migrations qui touchent à la vue.
     *
     * Ce que le test garde reste le même : une colonne publique se décide et
     * s'explique, elle ne s'ajoute pas au passage. Une colonne nouvelle sans un
     * mot dans sa migration fait rougir.
     */
    const justifications = readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => readFileSync(join(MIGRATIONS, f), "utf8"))
      .filter((t) => /create\s+(or\s+replace\s+)?view\s+public\.articles_vitrine/i.test(t))
      .map((t) => {
        // L'en-tête : tout ce qui précède le premier ordre SQL exécutable.
        const i = t.search(/^\s*(drop|create|alter)\b/im);
        return i > 0 ? t.slice(0, i) : t;
      })
      .join("\n");

    for (const colonne of COLONNES_PUBLIQUES_VITRINE) {
      expect(justifications, `la colonne « ${colonne} » n'est expliquée nulle part`)
        .toContain(colonne);
    }
    expect(justifications).toContain("CETTE VUE EST PUBLIQUE");
    expect(justifications).toContain("S-04");
  });

  it("ne garde que la lecture pour anon et authenticated", () => {
    const texte = sql();
    expect(texte).toMatch(/revoke all on public\.articles_vitrine from anon, authenticated;/);
    expect(texte).toMatch(/grant select on public\.articles_vitrine to anon, authenticated;/);
    // Aucun droit d'écriture redonné après la révocation.
    expect(texte).not.toMatch(/grant (insert|update|delete|all)[^;]*articles_vitrine[^;]*to anon/i);
  });

  it("garde le filtre de publication : un brouillon ne se sert pas", () => {
    const texte = sql();
    expect(texte).toContain("a.actif = true");
    expect(texte).toContain("a.vendable_en_ligne = true");
    expect(texte).toContain("a.composant = false");
    expect(texte).toContain("a.statut_vitrine = 'publie'");
    expect(texte).toContain("a.date_publication is null or a.date_publication <= now()");
  });

  it("demande à PostgREST des colonnes nommées, jamais une étoile", () => {
    expect(COLONNES_VITRINE).not.toContain("*");
    expect(COLONNES_VITRINE.split(", ")).toEqual([...COLONNES_PUBLIQUES_VITRINE]);
  });
});

describe("le vocabulaire de gouts (APP 25-GOÛT)", () => {
  /**
   * « Goût » et « Contient » doivent parler la même langue.
   *
   * Si les deux vocabulaires divergeaient — un « agneau » ici, un « Agneau »
   * là, ou une valeur de plus d'un côté — les deux filtres deviendraient
   * incomparables, et un article étiqueté au goût d'agneau ne se retrouverait
   * plus parmi ceux qui en contiennent. Le test relit les deux contraintes dans
   * le dépôt et les compare, plutôt que de faire confiance à une relecture.
   */
  const valeursDeLaContrainte = (colonne: string): string[] => {
    const fichiers = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
    let derniere: string[] | null = null;
    for (const f of fichiers) {
      const t = readFileSync(join(MIGRATIONS, f), "utf8");
      const m = new RegExp(
        String.raw`check\s*\(\s*${colonne}\s*<@\s*array\s*\[([^\]]*)\]`, "i",
      ).exec(t);
      if (m) {
        derniere = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]).sort();
      }
    }
    return derniere ?? [];
  };

  it("est exactement celui de proteines", () => {
    const gouts = valeursDeLaContrainte("gouts");
    const proteines = valeursDeLaContrainte("proteines");

    expect(gouts.length, "la contrainte sur gouts est introuvable").toBeGreaterThan(0);
    expect(proteines.length, "la contrainte sur proteines est introuvable").toBeGreaterThan(0);
    expect(
      gouts,
      "les deux vocabulaires ont divergé : un goût ne retrouvera plus ce qu'il contient",
    ).toEqual(proteines);
  });

  it("compte les seize valeurs relevées en base", () => {
    expect(valeursDeLaContrainte("gouts")).toEqual([
      "agneau", "boeuf", "canard", "cerf", "dinde", "elan", "gibier", "insecte",
      "poisson", "porc", "poulet", "renne", "sanglier", "saumon", "veau", "vegetal",
    ]);
  });
});

describe("APP 26 : les deux chemins disent la MÊME chose", () => {
  const source = (chemin: string) => readFileSync(join(__dirname, "..", chemin), "utf8");
  const TROIS = ["sur_commande", "delai_commande_min_jours", "delai_commande_max_jours"] as const;

  it("le visiteur les reçoit par la vue", () => {
    for (const c of TROIS) expect(COLONNES_PUBLIQUES_VITRINE).toContain(c);
  });

  it("le client connecté les relit dans la MÊME vue, jamais recalculés", () => {
    // `venteEnLigne` lit la table `articles`, où vivent la case et l'exception
    // d'article — mais PAS le délai effectif, qui dépend du fournisseur.
    // Recopier `coalesce(article, fournisseur)` en TypeScript serait s'exposer
    // au jour où les deux versions divergeraient : le client lirait un délai
    // sur la fiche, et sa commande en figerait un autre.
    const src = source("src/lib/venteEnLigne.ts");
    expect(src).toContain('.from("articles_vitrine")');
    expect(src, "le délai effectif ne se recalcule pas ici")
      .not.toMatch(/delai_commande_\w+\s*\?\?\s*\w+\.delai_commande/);
  });

  it("la page du catalogue transmet les trois, aux deux publics", () => {
    // Sans cette recopie, la même page dirait « Épuisé » au client connecté et
    // « Sur commande » au visiteur, pour le même article.
    const page = source("app/(public)/catalogue/page.tsx");
    for (const c of TROIS) expect(page).toContain(`${c}:`);
  });

  it("la fiche et le panier lisent le délai par la fonction unique", () => {
    for (const f of [
      "app/(public)/catalogue/CatalogueBoutique.tsx",
      "app/(public)/catalogue/[id]/page.tsx",
      "app/(public)/catalogue/PanierVisiteur.tsx",
    ]) {
      expect(source(f), `${f} doit annoncer le délai`).toContain("phraseDelaiCommande");
    }
  });
});

describe("APP 27 : le délai ne sort que s'il est promis", () => {
  const sqlVue = () => {
    const fichiers = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
    const dernier = fichiers
      .filter((f) => /create\s+(or\s+replace\s+)?view\s+public\.articles_vitrine/i
        .test(readFileSync(join(MIGRATIONS, f), "utf8")))
      .at(-1);
    if (!dernier) throw new Error("aucune migration ne définit la vue");
    return readFileSync(join(MIGRATIONS, dernier), "utf8");
  };

  it("les deux colonnes de délai passent par la MÊME condition que `sur_commande`", () => {
    /**
     * Le reliquat d'APP 26, constaté à l'essai du 26.09.2026 : la vue publiait
     * le délai du fournisseur pour des articles NON commandables. Aucun écran ne
     * l'affichait, mais une vue publique ne porte pas de donnée inutile — et
     * deux articles du même fournisseur laissaient deviner leur source commune.
     *
     * Ce que ce test empêche : qu'on revienne à `d.min_jours` tout nu. La
     * condition doit être celle de `sur_commande`, mot pour mot — une condition
     * voisine mais différente rouvrirait la fuite en silence.
     */
    const sql = sqlVue();
    const condition = "a.disponible_sur_commande and d.max_jours is not null";

    // `sur_commande` la porte, et les deux délais aussi.
    expect(sql).toContain(`${condition} as sur_commande`);
    for (const colonne of ["delai_commande_min_jours", "delai_commande_max_jours"]) {
      const champ = colonne.replace("delai_commande_", "").replace("_jours", "");
      expect(sql, `${colonne} doit être conditionnée`).toContain(
        `case when ${condition}\n       then d.${champ}_jours end as ${colonne}`,
      );
    }

    // Et surtout : plus aucune publication nue du délai.
    expect(sql, "un délai nu rouvrirait la fuite")
      .not.toMatch(/d\.(min|max)_jours as delai_commande_(min|max)_jours/);
  });

  it("les trois colonnes d'APP 27 sont dans la vue ET dans la liste publique", () => {
    const sql = sqlVue();
    for (const colonne of ["animaux", "especes", "types_soin"]) {
      expect(sql).toContain(`a.${colonne}`);
      expect(COLONNES_PUBLIQUES_VITRINE).toContain(colonne);
    }
  });

  it("le fournisseur ne sort toujours pas, sous aucune forme", () => {
    // La donnée commerciale reste dedans : le délai sort, sa source jamais.
    const rendues = colonnesDeLaVue();
    for (const interdite of ["fournisseur_id", "fournisseur", "prix_achat", "cout_moyen"]) {
      expect(rendues).not.toContain(interdite);
    }
  });
});
