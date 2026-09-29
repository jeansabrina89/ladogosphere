import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  animalRetenu,
  choisirNiveau,
  encadresAnimaux,
  encadresRayons,
  filAriane,
  lienCatalogue,
  rayonRetenu,
  type ArticleClassable,
} from "@/src/lib/niveauxCatalogue";
import { ANIMAUX, libelleValeur } from "@/src/lib/etiquettesArticles";
import { ordreCategorie } from "@/src/lib/boutiqueLogique";

/**
 * APP 49 — la boutique à trois niveaux : l'animal, puis le rayon, puis la liste.
 *
 * ── CE QUE ÇA CORRIGE ─────────────────────────────────────────────────────
 *
 * Près de huit cents articles derrière une barre d'onglets : une cliente qui
 * cherchait une litière voyait d'abord des croquettes pour chien. Le magasin se
 * parcourt dans l'ordre inverse — on va au rayon des chats, puis aux litières.
 *
 * ── LA COMPATIBILITÉ EST UNE RÈGLE ────────────────────────────────────────
 *
 * Des adresses circulent déjà : e-mails d'alerte de retour en stock, liens du
 * site, favoris. Aucune ne doit tomber sur une page vide ou une erreur. C'est ce
 * que la moitié de ce fichier vérifie.
 */

const ART = (a: Partial<ArticleClassable>): ArticleClassable => ({
  categorie: "jouets",
  animaux: ["chien"],
  ...a,
});

/** Un catalogue à deux animaux, le minimum pour que le niveau 1 ait un sens. */
const DEUX = [
  ART({ animaux: ["chien"], categorie: "jouets" }),
  ART({ animaux: ["chien"], categorie: "colliers" }),
  ART({ animaux: ["chat"], categorie: "litiere" }),
];

// ── Le niveau choisi ───────────────────────────────────────────────────────

describe("quel niveau pour quelle adresse", () => {
  it("rien du tout → niveau 1", () => {
    expect(choisirNiveau({}, DEUX).niveau).toBe(1);
  });

  it("un animal → niveau 2", () => {
    const c = choisirNiveau({ animal: "chat" }, DEUX);
    expect(c.niveau).toBe(2);
    expect(c.animal).toBe("chat");
  });

  it("un animal ET un rayon → niveau 3", () => {
    const c = choisirNiveau({ animal: "chat", categorie: "litiere" }, DEUX);
    expect(c.niveau).toBe(3);
    expect(c.categorie).toBe("litiere");
  });

  it("une RECHERCHE → niveau 3, tous animaux confondus", () => {
    /**
     * Quelqu'un qui cherche veut voir des articles, pas des encadrés. C'est la
     * même règle qu'à la liste d'administration, où chercher déplie les rayons.
     */
    const c = choisirNiveau({ q: "collier" }, DEUX);
    expect(c.niveau).toBe(3);
    expect(c.animal).toBeNull();
    expect(c.q).toBe("collier");
  });

  it("une recherche vide ou en espaces ne change rien", () => {
    expect(choisirNiveau({ q: "" }, DEUX).niveau).toBe(1);
    expect(choisirNiveau({ q: "   " }, DEUX).niveau).toBe(1);
  });

  it("un FILTRE → niveau 3", () => {
    expect(choisirNiveau({ nbFiltres: 1 }, DEUX).niveau).toBe(3);
    expect(choisirNiveau({ animal: "chat", nbFiltres: 2 }, DEUX).niveau).toBe(3);
  });

  it("« Voir tous les articles » → niveau 3", () => {
    expect(choisirNiveau({ tout: "1" }, DEUX).niveau).toBe(3);
    expect(choisirNiveau({ animal: "chat", tout: "1" }, DEUX).niveau).toBe(3);
  });

  it("UN SEUL ANIMAL SERVI : le niveau 1 est sauté", () => {
    /**
     * Une grille d'un seul encadré ne fait pas choisir, elle fait cliquer pour
     * rien. C'est le cas du jour où la boutique n'aura que des chiens.
     */
    const seul = [ART({ animaux: ["chien"] })];
    const c = choisirNiveau({}, seul);
    expect(c.niveau).toBe(2);
    expect(c.animal).toBe("chien");
  });
});

// ── La compatibilité des adresses qui circulent ────────────────────────────

describe("aucune adresse existante ne tombe en erreur", () => {
  it("un animal INCONNU ramène au niveau 1", () => {
    const c = choisirNiveau({ animal: "licorne" }, DEUX);
    expect(c.niveau).toBe(1);
    expect(c.animal).toBeNull();
  });

  it("un animal FERMÉ ou sans article ramène au niveau 1", () => {
    /**
     * La liste reçue a déjà écarté les animaux fermés en ligne (APP 48) : un
     * lien vers « Furets » se comporte donc comme un lien vers un animal sans
     * article, et c'est exactement ce qu'on veut.
     */
    expect(choisirNiveau({ animal: "furet" }, DEUX).niveau).toBe(1);
    expect(animalRetenu("furet", DEUX)).toBeNull();
  });

  it("un RAYON VIDE pour cet animal ramène au niveau 2", () => {
    // Le chat n'a pas de colliers dans ce catalogue.
    const c = choisirNiveau({ animal: "chat", categorie: "colliers" }, DEUX);
    expect(c.niveau).toBe(2);
    expect(c.categorie).toBeNull();
    expect(c.animal).toBe("chat");
  });

  it("un rayon inconnu est ignoré, sans erreur", () => {
    expect(rayonRetenu("rayon_invente", DEUX, "chien")).toBeNull();
  });

  it("un rayon SANS animal reste valable : c'est « tous animaux »", () => {
    expect(rayonRetenu("litiere", DEUX, null)).toBe("litiere");
    expect(choisirNiveau({ categorie: "litiere" }, DEUX).niveau).toBe(3);
  });
});

// ── Les encadrés ───────────────────────────────────────────────────────────

describe("les encadrés du niveau 1", () => {
  it("un par animal servi, dans l'ordre du vocabulaire", () => {
    const e = encadresAnimaux(DEUX);
    expect(e.map((x) => x.valeur)).toEqual(["chien", "chat"]);
    const rang = (v: string) => (ANIMAUX as readonly string[]).indexOf(v);
    expect(rang("chien")).toBeLessThan(rang("chat"));
  });

  it("AUCUN encadré vide", () => {
    const e = encadresAnimaux(DEUX);
    expect(e.every((x) => x.nombre > 0)).toBe(true);
    expect(e.map((x) => x.valeur)).not.toContain("furet");
  });

  it("les nombres sont ceux de la LISTE", () => {
    const e = encadresAnimaux(DEUX);
    expect(e.find((x) => x.valeur === "chien")?.nombre).toBe(2);
    expect(e.find((x) => x.valeur === "chat")?.nombre).toBe(1);
  });

  it("UN ARTICLE CHIEN + CHAT COMPTE DANS LES DEUX", () => {
    /**
     * C'est le même article, rangé à deux endroits — pas deux articles. Une
     * gamelle qui sert au chien comme au chat doit se trouver par l'un ou par
     * l'autre, sinon on la cherche sous celui où on ne l'a pas mise.
     */
    const e = encadresAnimaux([ART({ animaux: ["chien", "chat"] }), ART({ animaux: ["chien"] })]);
    expect(e.find((x) => x.valeur === "chien")?.nombre).toBe(2);
    expect(e.find((x) => x.valeur === "chat")?.nombre).toBe(1);
  });

  it("les libellés viennent d'etiquettesArticles, jamais écrits en dur", () => {
    const e = encadresAnimaux([ART({ animaux: ["faune"] })]);
    expect(e[0].libelle).toBe(libelleValeur("animaux", "faune"));
  });

  it("chaque encadré mène à son animal", () => {
    expect(encadresAnimaux(DEUX)[0].lien).toBe("/catalogue?animal=chien");
  });
});

describe("les encadrés du niveau 2", () => {
  it("un par rayon ayant un article POUR CET ANIMAL", () => {
    // Et dans l'ordre du magasin : les colliers (8e rayon) avant les jouets
    // (13e), quel que soit l'ordre dans lequel les articles sont arrivés.
    expect(encadresRayons(DEUX, "chien").map((e) => e.valeur)).toEqual(["colliers", "jouets"]);
    expect(encadresRayons(DEUX, "chat").map((e) => e.valeur)).toEqual(["litiere"]);
  });

  it("dans l'ordre du MAGASIN, jamais l'alphabet ni le nombre", () => {
    const articles = [
      ART({ animaux: ["chien"], categorie: "jouets" }),
      ART({ animaux: ["chien"], categorie: "alimentation_seche" }),
      ART({ animaux: ["chien"], categorie: "alimentation_seche" }),
    ];
    const e = encadresRayons(articles, "chien");
    expect(e.map((x) => x.valeur)).toEqual(["alimentation_seche", "jouets"]);
    const rangs = e.map((x) => ordreCategorie(x.valeur));
    expect([...rangs]).toEqual([...rangs].sort((a, b) => a - b));
  });

  it("aucun rayon vide", () => {
    const e = encadresRayons(DEUX, "chat");
    expect(e.every((x) => x.nombre > 0)).toBe(true);
    expect(e.map((x) => x.valeur)).not.toContain("jouets");
  });

  it("chaque encadré garde l'animal dans son adresse", () => {
    expect(encadresRayons(DEUX, "chat")[0].lien).toBe("/catalogue?animal=chat&categorie=litiere");
  });
});

// ── Le fil ─────────────────────────────────────────────────────────────────

describe("le fil d'Ariane", () => {
  it("Boutique › Chats › Litière, et seule la dernière n'est pas un lien", () => {
    const f = filAriane({ animal: "chat", categorie: "litiere", q: "", unSeulAnimal: false });
    expect(f.map((m) => m.libelle)).toEqual(["Boutique", "Chats", "Litière"]);
    expect(f[0].lien).toBe("/catalogue");
    expect(f[1].lien).toBe("/catalogue?animal=chat");
    // Un lien vers soi-même ne mène nulle part tout en promettant le contraire.
    expect(f[2].lien).toBeNull();
  });

  it("UN SEUL ANIMAL : le fil commence à l'animal", () => {
    /**
     * Une miette « Boutique » ramènerait au niveau 2 du même animal — c'est-à-
     * dire ici. Elle promettrait un ailleurs qui n'existe pas.
     */
    const f = filAriane({ animal: "chien", categorie: "jouets", q: "", unSeulAnimal: true });
    expect(f.map((m) => m.libelle)).toEqual(["Chiens", "Jouets"]);
  });

  it("une recherche apparaît en dernière miette, sans lien", () => {
    const f = filAriane({ animal: null, categorie: null, q: "collier", unSeulAnimal: false });
    expect(f.map((m) => m.libelle)).toEqual(["Boutique", "« collier »"]);
    expect(f.at(-1)?.lien).toBeNull();
  });
});

describe("les adresses construites", () => {
  it("sans paramètre vide", () => {
    expect(lienCatalogue({})).toBe("/catalogue");
    expect(lienCatalogue({ animal: null, categorie: "", q: "  " })).toBe("/catalogue");
  });

  it("avec ce qu'on lui donne", () => {
    expect(lienCatalogue({ tout: true })).toBe("/catalogue?tout=1");
    expect(lienCatalogue({ animal: "chat", tout: true })).toBe("/catalogue?animal=chat&tout=1");
  });
});

// ── Ce que l'écran en fait ─────────────────────────────────────────────────

const lire = (relatif: string) => readFileSync(join(process.cwd(), relatif), "utf8");

describe("l'écran suit le module, et rien d'autre", () => {
  it("la page choisit le niveau à partir de la LISTE affichée", () => {
    /**
     * C'est ce qui garantit qu'un encadré « 12 articles » en montre douze, et
     * non onze parce qu'un animal a été fermé entre-temps (APP 48).
     */
    const src = lire("app/(public)/catalogue/page.tsx");
    expect(src).toMatch(/choisirNiveau\(\s*\{[\s\S]{0,200}\},\s*liste,\s*\)/);
    expect(src).toMatch(/encadresAnimaux\(liste\)/);
    expect(src).toMatch(/encadresRayons\(liste, choix\.animal\)/);
  });

  it("les filtres sont comptés par le module qui les possède", () => {
    // Les recompter ici aurait créé une seconde définition de « un filtre est
    // actif », et les deux auraient fini par diverger.
    expect(lire("app/(public)/catalogue/page.tsx")).toContain("nombreFiltresActifs(");
  });

  it("la recherche est un formulaire GET, sous « q »", () => {
    const src = lire("app/(public)/catalogue/EncadresCatalogue.tsx");
    expect(src).toMatch(/<form action="\/catalogue" method="get"/);
    expect(src).toMatch(/name="q"/);
    // Elle emporte l'animal : on cherche dans le rayon où l'on est.
    expect(src).toMatch(/type="hidden" name="animal"/);
  });

  it("LES ONGLETS ONT DISPARU : le fil les remplace", () => {
    const src = lire("app/(public)/catalogue/CatalogueBoutique.tsx");
    expect(src).not.toMatch(/<OngletsAnimaux/);
    expect(lire("app/(public)/catalogue/page.tsx")).toContain("<FilAriane");
  });

  it("appliquer un filtre ne perd pas la recherche", () => {
    const src = lire("app/(public)/catalogue/CatalogueBoutique.tsx");
    expect(src).toMatch(/qs\.set\("q", q\)/);
  });

  it("la recherche part de l'ADRESSE, pas d'un état vide", () => {
    expect(lire("app/(public)/catalogue/CatalogueBoutique.tsx"))
      .toMatch(/useState\(params\.get\("q"\) \?\? ""\)/);
  });

  it("la mention de la remise membre reste au niveau 1 et au niveau 3", () => {
    // Elle est posée au-dessus des trois niveaux : elle ne dépend d'aucun.
    const src = lire("app/(public)/catalogue/page.tsx");
    expect(src.indexOf("mentionMembre")).toBeLessThan(src.indexOf("choix.niveau === 1"));
  });

  it("aucune dépendance n'a été installée pour les icônes", () => {
    const pkg = JSON.parse(lire("package.json"));
    expect(pkg.dependencies).toHaveProperty("lucide-react");
    for (const absent of ["react-icons", "@heroicons/react", "feather-icons"]) {
      expect(pkg.dependencies, absent).not.toHaveProperty(absent);
    }
  });
});

describe("chaque animal a son icône", () => {
  it("les sept sont couverts, sans exception muette", () => {
    /**
     * Deux n'existent pas dans lucide-react et empruntent la plus proche : le
     * FURET prend la patte générique — aucun mustélidé dans la bibliothèque, et
     * un rat aurait menti sur l'animal — et la FAUNE prend l'écureuil, l'un des
     * trois animaux nommés par la décision.
     */
    const src = lire("app/(public)/catalogue/EncadresCatalogue.tsx");
    for (const a of ANIMAUX) {
      expect(src, `${a} doit avoir son icône`).toMatch(new RegExp(`\\b${a}:\\s*\\w+,`));
    }
    expect(src).toMatch(/furet: PawPrint/);
    expect(src).toMatch(/faune: Squirrel/);
  });
});
