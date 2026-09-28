import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  CATEGORIES_ARTICLE,
  libelleCategorieArticle,
  ordreCategorie,
  tauxPropose,
  estPerissable,
  expediableParDefaut,
  TAUX_REDUIT,
  TAUX_NORMAL,
} from "@/src/lib/boutiqueLogique";
import { champsDeCategorie, champsDeCategorieEtAnimaux } from "@/src/lib/etiquettesArticles";
import {
  FILTRES_VIDES,
  filtresAffiches,
  type ArticleFiltrable,
} from "@/src/lib/filtresCatalogueLogique";

/**
 * APP 34 — deux rayons de plus : « Compléments alimentaires » et « Gamelles ».
 *
 * ── LE VOISIN DONT IL FAUT SE MÉFIER ──────────────────────────────────────
 *
 * « Alimentation complète » est un repas ENTIER : granulés, foin des NAC. Un
 * complément est ce qu'on ajoute PAR-DESSUS — herbes, huiles, levure. Les deux
 * sont à 2,6 %, donc rien ne sonnerait si on les confondait : la faute se
 * verrait seulement quand une cliente chercherait de la spiruline dans un rayon
 * de foin. C'est pour cela que les compléments se rangent après la mastication
 * et non collés à l'alimentation complète.
 *
 * ── CE QUI SE VÉRIFIE ICI, ET CE QUI S'EST VÉRIFIÉ EN BASE ────────────────
 *
 * La contrainte elle-même a été éprouvée contre la vraie base, transaction
 * annulée : `complements` et `gamelles` acceptés, `chapeaux` refusé, ordre 6 et
 * 17, deux lignes de remise d'adhésion, vitrine toujours lisible par `anon`.
 * Résultats dans le message de commit. Ce fichier garde ce que le SQL ne peut
 * pas garder tout seul.
 */

const MIGRATIONS = join(__dirname, "..", "supabase", "migrations");

/** La migration la plus récente qui pose la contrainte des catégories. */
function migrationDeLaContrainte(): string {
  const f = readdirSync(MIGRATIONS)
    .filter((x) => x.endsWith(".sql"))
    .filter((x) => readFileSync(join(MIGRATIONS, x), "utf8").includes("add constraint articles_categorie_check"))
    .sort()
    .at(-1);
  if (!f) throw new Error("aucune migration ne pose articles_categorie_check");
  return readFileSync(join(MIGRATIONS, f), "utf8");
}

const NEUFS = ["complements", "gamelles"] as const;

// ── La contrainte ──────────────────────────────────────────────────────────

describe("la contrainte accepte les deux rayons, et rien d'autre", () => {
  it("les deux sont dans la liste", () => {
    const sql = migrationDeLaContrainte();
    const bloc = sql.match(
      /articles_categorie_check\s+check\s*\(\s*categorie = any \(array\[([\s\S]*?)\]::text\[\]\)/,
    )?.[1] ?? "";
    // Commentaires retirés : une apostrophe française y passerait pour un
    // délimiteur de chaîne et décalerait toute la liste.
    const valeurs = (bloc.replace(/--[^\n]*/g, "").match(/'([^']+)'/g) ?? [])
      .map((v) => v.replace(/'/g, ""));

    expect(valeurs).toHaveLength(22);
    for (const c of NEUFS) expect(valeurs, c).toContain(c);
  });

  it("une valeur inconnue n'y est pas — et la base la refuse", () => {
    /**
     * Le refus lui-même est le fait de Postgres, éprouvé en base (« chapeaux »
     * rejeté par check_violation). Ici on garde qu'aucune valeur ne s'est
     * glissée dans la liste sans passer par ce fichier et par le module.
     */
    const valeurs = CATEGORIES_ARTICLE.map((c) => c.valeur);
    expect(valeurs).not.toContain("chapeaux");
    expect(valeurs).not.toContain("complements_alimentaires");
    expect(valeurs).not.toContain("ecuelles");
  });

  it("AUCUN article n'est déplacé par la migration", () => {
    /**
     * Le reclassement des articles se fait à la main, après ce lot. Une
     * migration qui devinerait le rayon d'après le nom se tromperait sur les cas
     * limites — et personne ne saurait lesquels.
     */
    const sql = migrationDeLaContrainte();
    expect(sql).not.toMatch(/update\s+public\.articles/i);
    expect(sql).not.toMatch(/set\s+categorie\s*=/i);
  });
});

// ── Les libellés et l'ordre ────────────────────────────────────────────────

describe("les libellés et la place de chacun", () => {
  it("les deux libellés, mot pour mot", () => {
    expect(libelleCategorieArticle("complements")).toBe("Compléments alimentaires");
    expect(libelleCategorieArticle("gamelles")).toBe("Gamelles");
  });

  it("Compléments juste après Mastication, Gamelles juste après Couchages", () => {
    expect(ordreCategorie("complements")).toBe(ordreCategorie("mastication") + 1);
    expect(ordreCategorie("gamelles")).toBe(ordreCategorie("couchages") + 1);
  });

  it("les compléments ne touchent PAS l'alimentation complète", () => {
    // C'est la confusion que ce rayon vient lever : les coller aurait entretenu
    // exactement ce qu'on cherche à séparer.
    const ecart = ordreCategorie("complements") - ordreCategorie("alimentation_complete");
    expect(ecart, "au moins deux rangs les séparent").toBeGreaterThan(1);
  });

  it("aucun libellé n'est écrit en dur ailleurs", () => {
    /**
     * Les écrans lisent tous `CATEGORIES_ARTICLE`. Un libellé recopié dans un
     * menu vivrait sa vie et finirait par dire autre chose que la fiche.
     */
    for (const f of [
      "app/(admin)/boutique/articles/FormArticle.tsx",
      "app/components/stock/FiltresArticles.tsx",
      "app/(admin)/boutique/actions/FormPromotion.tsx",
      "app/(admin)/(espace-reglages)/reglages/tva/page.tsx",
    ]) {
      const src = readFileSync(join(__dirname, "..", f), "utf8");
      expect(src, `${f} lit la table`).toContain("CATEGORIES_ARTICLE");
      expect(src, `${f} ne recopie pas le libellé`).not.toContain("Compléments alimentaires");
    }
  });
});

// ── La TVA et l'envoi postal ───────────────────────────────────────────────

describe("ce que la création propose", () => {
  it("2,6 % pour les compléments : c'est de l'aliment pour animaux", () => {
    expect(tauxPropose("complements")).toBe(TAUX_REDUIT);
    expect(TAUX_REDUIT).toBe(2.6);
  });

  it("8,1 % pour les gamelles : un objet, pas un aliment", () => {
    // Ce qu'on mange DANS une gamelle est à 2,6 %, la gamelle elle-même non.
    expect(tauxPropose("gamelles")).toBe(TAUX_NORMAL);
    expect(TAUX_NORMAL).toBe(8.1);
  });

  it("les deux partent par la poste, proposés cochés", () => {
    /**
     * `expediableParDefaut` est une liste de REFUS : un rayon neuf est
     * expédiable d'office, et il n'y avait donc rien à écrire. Le test le dit
     * quand même — sinon on ne saurait pas si c'est un choix ou un oubli.
     */
    for (const c of NEUFS) expect(expediableParDefaut(c), c).toBe(true);
  });

  it("une huile se périme, une gamelle non", () => {
    // La date de péremption est proposée à l'entrée en stock. Une huile rancit,
    // une levure se périme ; l'inox, lui, attend.
    expect(estPerissable("complements")).toBe(true);
    expect(estPerissable("gamelles")).toBe(false);
  });
});

// ── Les étiquettes proposées ───────────────────────────────────────────────

describe("les étiquettes de chaque rayon", () => {
  it("compléments : âge, besoin, taille du chien — ni goût ni « Contient »", () => {
    /**
     * On ne demande pas la protéine d'une huile de saumon : la réponse serait
     * « saumon », et elle n'apprendrait rien. Les deux cases (sans céréales,
     * monoprotéine) n'y sont pas non plus — elles qualifient une ration
     * complète, pas ce qu'on ajoute par-dessus.
     */
    expect(champsDeCategorie("complements")).toEqual(["ages", "besoins", "tailles_chien"]);
  });

  it("gamelles : taille du chien, taille de l'article, couleurs, matières", () => {
    // La matière compte plus ici qu'ailleurs : inox, céramique et plastique ne
    // se valent pas pour une gamelle, et c'est souvent par là qu'on choisit.
    expect(champsDeCategorie("gamelles"))
      .toEqual(["tailles_chien", "taille_article", "couleurs", "matieres"]);
  });

  it("l'animal retire ce qui n'a pas de sens, comme partout", () => {
    // Un complément pour rongeur ne montre pas « Taille du chien ».
    const rongeur = champsDeCategorieEtAnimaux("complements", ["rongeur"]);
    expect(rongeur).not.toContain("tailles_chien");
    expect(rongeur).toContain("ages");
    // Et l'espèce vient de l'animal, pas du rayon (APP 31 bis).
    expect(rongeur).toContain("especes");

    const chien = champsDeCategorieEtAnimaux("gamelles", ["chien"]);
    expect(chien).toContain("tailles_chien");
    expect(chien).not.toContain("especes");
  });
});

// ── Le client ne voit pas un rayon vide ────────────────────────────────────

describe("un rayon sans article n'apparaît jamais au client", () => {
  const ART = (a: Partial<ArticleFiltrable>): ArticleFiltrable =>
    ({
      id: Math.random().toString(36).slice(2),
      nom: "Article", categorie: "gamelles",
      prix_vente: 10, prix_final: 10, en_stock: true,
      ...a,
    }) as ArticleFiltrable;

  const rayons = (articles: ArticleFiltrable[]) =>
    filtresAffiches(articles, FILTRES_VIDES)
      .find((l) => l.libelle === "Catégorie")
      ?.valeurs.map((v) => v.valeur) ?? [];

  it("les deux rayons neufs sont absents tant qu'aucun article n'y est", () => {
    /**
     * C'est le cas du jour même de ce lot : la contrainte les accepte, le
     * module les connaît, et aucun article n'y est encore. Un rayon vide proposé
     * au filtre viderait la grille dès qu'on le touche — et on n'essaierait pas
     * le suivant.
     */
    const proposes = rayons([ART({ categorie: "jouets" }), ART({ categorie: "colliers" })]);
    for (const c of NEUFS) expect(proposes, c).not.toContain(c);
  });

  it("ils apparaissent dès qu'un article s'y range", () => {
    const proposes = rayons([
      ART({ categorie: "complements" }),
      ART({ categorie: "gamelles" }),
      ART({ categorie: "jouets" }),
    ]);
    for (const c of NEUFS) expect(proposes, c).toContain(c);
  });

  it("et une valeur d'étiquette sans article ne se propose pas non plus", () => {
    /*
     * Même règle, un cran plus bas : une matière n'apparaît que si un article
     * la porte.
     *
     * << metal >> et non << inox >> : le vocabulaire des matières ne connaît ni
     * inox, ni céramique, ni plastique -- les trois qui distinguent justement
     * une gamelle. Signalé au lot APP 34, pas corrigé : ces valeurs se
     * décident, elles ne s'inventent pas.
     */
    const listes = filtresAffiches(
      [ART({ categorie: "gamelles", matieres: ["metal"] } as Partial<ArticleFiltrable>)],
      { ...FILTRES_VIDES, categorie: "gamelles" },
    );
    const matieres = listes.find((l) => l.nom === "matieres")?.valeurs.map((v) => v.valeur) ?? [];
    expect(matieres).toEqual(["metal"]);
  });
});
