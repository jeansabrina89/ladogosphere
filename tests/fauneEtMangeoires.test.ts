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
  TAUX_NORMAL,
} from "@/src/lib/boutiqueLogique";
import {
  ANIMAUX,
  champsDeCategorie,
  champsDeCategorieEtAnimaux,
  groupeVautPourAnimaux,
  libelleValeur,
  valeursPourAnimaux,
} from "@/src/lib/etiquettesArticles";
import {
  FILTRES_VIDES,
  filtresAffiches,
  ongletsAnimaux,
  type ArticleFiltrable,
} from "@/src/lib/filtresCatalogueLogique";

/**
 * APP 46 — l'animal « faune » et le rayon « mangeoires ».
 *
 * ── CE QUI SE JOUE ICI ────────────────────────────────────────────────────
 *
 * Un hérisson qui passe au jardin n'est pas un animal de compagnie : on ne
 * connaît ni son âge, ni sa taille, ni son goût. C'est tout le contraire des
 * six animaux d'avant, dont la fiche pose ces questions — et c'est pour cela
 * que « faune » ne pouvait pas se ranger sous « rongeurs » ou « oiseaux ».
 *
 * Un article, lui, peut porter les DEUX : une boule de graisse nourrit la
 * mésange du jardin comme la perruche du salon.
 *
 * ── CE QUI A ÉTÉ ÉPROUVÉ EN BASE, ET NE L'EST PAS ICI ─────────────────────
 *
 * La contrainte elle-même, transaction annulée : « faune » seul accepté,
 * « oiseau » + « faune » accepté, animal inconnu refusé, aucun animal refusé,
 * rayon inconnu refusé, et la vitrine relue AVEC LE RÔLE ANON. Résultats dans
 * le message de commit. Ce fichier garde ce que le SQL ne garde pas tout seul.
 */

const MIGRATIONS = join(__dirname, "..", "supabase", "migrations");

function migrationApp46(): string {
  const f = readdirSync(MIGRATIONS)
    .filter((x) => x.endsWith("_app46_faune_sauvage_et_mangeoires.sql"))
    .sort()
    .at(-1);
  if (!f) throw new Error("la migration d'APP 46 est absente du dépôt");
  return readFileSync(join(MIGRATIONS, f), "utf8");
}

/** Les valeurs citées dans un bloc SQL, commentaires retirés d'abord. */
function valeursCitees(bloc: string): string[] {
  return (bloc.replace(/--[^\n]*/g, "").match(/'([^']+)'/g) ?? [])
    .map((v) => v.replace(/'/g, ""));
}

// ── Les contraintes ────────────────────────────────────────────────────────

describe("la base accepte le nouvel animal et le nouveau rayon", () => {
  it("« faune » entre dans la liste des animaux, et le « au moins un » reste", () => {
    const sql = migrationApp46();
    const bloc = sql.match(/articles_animaux_check[\s\S]*?cardinality/)?.[0] ?? "";
    const valeurs = valeursCitees(bloc);
    expect(valeurs).toEqual([
      "chien", "chat", "rongeur", "furet", "reptile", "oiseau", "faune",
    ]);
    // Sans cette clause, un article sans animal n'apparaîtrait nulle part et
    // personne ne saurait pourquoi.
    expect(sql).toMatch(/cardinality\(animaux\) >= 1/);
  });

  it("« mangeoires » entre dans la liste des rayons, juste après « gamelles »", () => {
    const sql = migrationApp46();
    const bloc = sql.match(/articles_categorie_check[\s\S]*?\]::text\[\]\)\)/)?.[0] ?? "";
    const valeurs = valeursCitees(bloc);
    expect(valeurs).toHaveLength(22);
    expect(valeurs.indexOf("mangeoires")).toBe(valeurs.indexOf("gamelles") + 1);
  });

  it("LES DEUX LISTES DE RAYONS DISENT LE MÊME ORDRE", () => {
    /**
     * La contrainte dit ce qui est permis ; la vue calcule le rang avec
     * `array_position` sur SA propre liste. Si les deux divergeaient, le rang
     * serait faux sans que rien n'échoue — et le catalogue rangerait les
     * mangeoires ailleurs que la fiche.
     */
    const sql = migrationApp46();
    const contrainte = valeursCitees(
      sql.match(/articles_categorie_check[\s\S]*?\]::text\[\]\)\)/)?.[0] ?? "",
    );
    const vue = valeursCitees(
      sql.match(/array_position\(array\[[\s\S]*?\]::text\[\], a\.categorie\)/)?.[0] ?? "",
    );
    expect(vue).toEqual(contrainte);
  });

  it("le module TypeScript dit le MÊME ordre que la base", () => {
    const sql = migrationApp46();
    const vue = valeursCitees(
      sql.match(/array_position\(array\[[\s\S]*?\]::text\[\], a\.categorie\)/)?.[0] ?? "",
    );
    expect(CATEGORIES_ARTICLE.map((c) => c.valeur)).toEqual(vue);
  });

  it("AUCUN article n'est déplacé ni publié par la migration", () => {
    /**
     * Les seize articles en brouillon seront déplacés à la main après ce lot.
     * Une migration qui devinerait leur rayon se tromperait sur les cas limites
     * — et personne ne saurait lesquels.
     */
    const sql = migrationApp46();
    expect(sql).not.toMatch(/update\s+public\.articles\b/i);
    expect(sql).not.toMatch(/set\s+categorie\s*=/i);
    expect(sql).not.toMatch(/set\s+statut_vitrine\s*=/i);
  });

  it("la vitrine garde ses droits, redits", () => {
    // `CREATE OR REPLACE VIEW` les conserve sur une base vivante, pas sur une
    // base reconstruite depuis le dépôt (leçon d'APP 34).
    const sql = migrationApp46();
    expect(sql).toContain("grant select on public.articles_vitrine to anon, authenticated");
    expect(sql).toContain("security_invoker = false");
  });

  it("le rayon neuf a sa ligne de remise d'adhésion", () => {
    // Sans elle, l'écran annonce −10 % et la caisse facture plein tarif : le
    // piège d'APP 27, silencieux des deux côtés.
    const sql = migrationApp46();
    const inserts = [
      ...sql.matchAll(/insert\s+into\s+public\.remise_membre_categories[\s\S]*?;/gi),
    ].map((m) => m[0]).join("\n");
    expect(inserts).toContain("mangeoires");
  });
});

// ── L'animal ───────────────────────────────────────────────────────────────

describe("« Faune sauvage » prend sa place après « Oiseaux »", () => {
  it("dans la liste des animaux, en dernier", () => {
    expect([...ANIMAUX]).toEqual([
      "chien", "chat", "rongeur", "furet", "reptile", "oiseau", "faune",
    ]);
  });

  it("son libellé, mot pour mot", () => {
    expect(libelleValeur("animaux", "faune")).toBe("Faune sauvage");
  });

  it("aucun libellé n'est écrit en dur ailleurs", () => {
    for (const f of [
      "app/(admin)/boutique/articles/FormArticle.tsx",
      "app/components/stock/FiltresArticles.tsx",
      "app/(public)/catalogue/CatalogueBoutique.tsx",
    ]) {
      const src = readFileSync(join(__dirname, "..", f), "utf8");
      expect(src, `${f} ne recopie pas « Faune sauvage »`).not.toContain("Faune sauvage");
      expect(src, `${f} ne recopie pas « Mangeoires »`).not.toContain('"Mangeoires"');
    }
  });
});

describe("la faune ne se demande pas ce qu'on ne peut pas savoir", () => {
  it("elle n'a AUCUNE valeur d'âge", () => {
    expect(valeursPourAnimaux("ages", ["faune"])).toEqual([]);
  });

  it("le groupe « âge » ne se propose donc pas pour elle", () => {
    /**
     * L'âge vaut « pour tous » — mais un filtre vide n'apprend rien et laisse
     * croire à une liste vide plutôt qu'à une question qui ne se pose pas.
     */
    expect(groupeVautPourAnimaux("ages", ["faune"])).toBe(false);
    // Les six autres le gardent.
    for (const a of ["chien", "chat", "rongeur", "furet", "reptile", "oiseau"]) {
      expect(groupeVautPourAnimaux("ages", [a]), a).toBe(true);
    }
  });

  it("un article oiseau ET faune garde l'âge de l'oiseau", () => {
    // L'union, jamais l'intersection : la même boule de graisse sert les deux,
    // et c'est à Sabrina de cocher ce qui convient.
    expect(groupeVautPourAnimaux("ages", ["oiseau", "faune"])).toBe(true);
    expect(valeursPourAnimaux("ages", ["oiseau", "faune"]).map((v) => v.valeur))
      .toEqual(["junior", "adulte", "senior"]);
  });

  it("ni goût, ni besoin, ni taille du chien, ni espèce", () => {
    for (const g of ["gouts", "proteines", "besoins", "tailles_chien", "especes"] as const) {
      expect(groupeVautPourAnimaux(g, ["faune"]), g).toBe(false);
    }
  });

  it("couleurs et matières restent, elles", () => {
    for (const g of ["couleurs", "matieres"] as const) {
      expect(groupeVautPourAnimaux(g, ["faune"]), g).toBe(true);
    }
  });
});

// ── Le rayon ───────────────────────────────────────────────────────────────

describe("le rayon « Mangeoires »", () => {
  it("son libellé et sa place, juste après « Gamelles »", () => {
    expect(libelleCategorieArticle("mangeoires")).toBe("Mangeoires");
    expect(ordreCategorie("mangeoires")).toBe(ordreCategorie("gamelles") + 1);
  });

  it("8,1 % : un objet de jardin, pas un aliment", () => {
    // Les graines qu'on y met, elles, relèvent de l'alimentation et de son taux.
    expect(tauxPropose("mangeoires")).toBe(TAUX_NORMAL);
    expect(TAUX_NORMAL).toBe(8.1);
  });

  it("non périssable, et expédiable d'office", () => {
    expect(estPerissable("mangeoires")).toBe(false);
    expect(expediableParDefaut("mangeoires")).toBe(true);
  });

  it("taille de l'article, couleurs, matières — et rien d'autre", () => {
    /**
     * Pas de « taille du chien », contrairement au reste de l'équipement : la
     * taille qui compte est celle de l'objet, pas celle d'un animal qu'on ne
     * choisit pas.
     */
    expect(champsDeCategorie("mangeoires")).toEqual([
      "taille_article", "couleurs", "matieres",
    ]);
  });

  it("et la faune n'y ajoute aucun champ", () => {
    expect(champsDeCategorieEtAnimaux("mangeoires", ["faune"])).toEqual([
      "taille_article", "couleurs", "matieres",
    ]);
  });

  it("une valeur inconnue n'est entrée nulle part", () => {
    const valeurs = CATEGORIES_ARTICLE.map((c) => c.valeur);
    expect(valeurs).not.toContain("mangeoire");
    expect(valeurs).not.toContain("nichoirs");
  });
});

// ── Le catalogue client ────────────────────────────────────────────────────

describe("l'onglet « Faune sauvage » n'apparaît qu'avec un article", () => {
  const ART = (a: Partial<ArticleFiltrable>): ArticleFiltrable =>
    ({
      id: Math.random().toString(36).slice(2),
      nom: "Article", categorie: "mangeoires",
      prix_vente: 10, prix_final: 10, en_stock: true,
      animaux: ["chien"],
      ...a,
    }) as ArticleFiltrable;

  const onglets = (articles: ArticleFiltrable[]) =>
    ongletsAnimaux(articles, null).map((o) => o.valeur);

  it("absent tant qu'aucun article ne le porte", () => {
    const vus = onglets([
      ART({ animaux: ["chien"] }),
      ART({ animaux: ["chat"] }),
    ]);
    expect(vus).not.toContain("faune");
  });

  it("présent dès qu'un article le porte, et APRÈS « Oiseaux »", () => {
    const vus = onglets([
      ART({ animaux: ["chien"] }),
      ART({ animaux: ["oiseau"] }),
      ART({ animaux: ["faune"] }),
    ]);
    expect(vus).toContain("faune");
    expect(vus.indexOf("faune")).toBe(vus.indexOf("oiseau") + 1);
  });

  it("un article oiseau ET faune compte dans les DEUX onglets", () => {
    /**
     * C'est le cas de la boule de graisse. L'article n'est pas dédoublé : il
     * est compté une fois par onglet, ce que la cliente attend — elle le
     * trouvera qu'elle cherche pour sa perruche ou pour son jardin.
     */
    const liste = ongletsAnimaux(
      [ART({ animaux: ["oiseau", "faune"] }), ART({ animaux: ["chien"] })],
      null,
    );
    expect(liste.find((o) => o.valeur === "oiseau")?.nombre).toBe(1);
    expect(liste.find((o) => o.valeur === "faune")?.nombre).toBe(1);
    // Et « Tous » ne le compte qu'une fois.
    expect(liste.find((o) => o.valeur === null)?.nombre).toBe(2);
  });
});

describe("un rayon vide ne se propose jamais au client", () => {
  const ART = (a: Partial<ArticleFiltrable>): ArticleFiltrable =>
    ({
      id: Math.random().toString(36).slice(2),
      nom: "Article", categorie: "jouets",
      prix_vente: 10, prix_final: 10, en_stock: true, animaux: ["chien"],
      ...a,
    }) as ArticleFiltrable;

  const rayons = (articles: ArticleFiltrable[]) =>
    filtresAffiches(articles, FILTRES_VIDES)
      .find((l) => l.libelle === "Catégorie")
      ?.valeurs.map((v) => v.valeur) ?? [];

  it("« Mangeoires » est absent le jour de ce lot : aucun article n'y est encore", () => {
    expect(rayons([ART({ categorie: "jouets" }), ART({ categorie: "colliers" })]))
      .not.toContain("mangeoires");
  });

  it("il apparaît dès qu'un article s'y range", () => {
    expect(rayons([ART({ categorie: "mangeoires" }), ART({ categorie: "jouets" })]))
      .toContain("mangeoires");
  });
});
