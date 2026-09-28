import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  animalRetenu,
  articleDeLAnimal,
  grouperParRayon,
  ongletsAnimaux,
  rayonsOuverts,
  type ArticleClassable,
} from "@/src/lib/listeArticlesAdmin";
import { CATEGORIES_ARTICLE, ordreCategorie } from "@/src/lib/boutiqueLogique";
import { ANIMAUX, libelleValeur } from "@/src/lib/etiquettesArticles";

/**
 * APP 47 — la liste d'administration se range comme la boutique.
 *
 * ── CE QUI SE JOUE ────────────────────────────────────────────────────────
 *
 * Près de huit cents articles dans un seul tableau : on y cherche un collier
 * parmi des sacs de croquettes. Sabrina voulait le MÊME classement que sa
 * boutique en ligne — l'animal, puis le rayon — pour ne pas avoir deux façons
 * de ranger les mêmes articles selon l'écran où on les regarde.
 *
 * ── CE QUI NE DOIT PAS BOUGER ─────────────────────────────────────────────
 *
 * `CatalogueStock` sert aussi les fournitures de l'atelier. Un test garde que
 * sa page ne demande ni onglets ni rayons : des rivets n'ont pas d'animal.
 */

const ART = (a: Partial<ArticleClassable> & { nom: string }): ArticleClassable => ({
  id: Math.random().toString(36).slice(2),
  categorie: "jouets",
  animaux: ["chien"],
  ...a,
});

// ── Les onglets ────────────────────────────────────────────────────────────

describe("les onglets par animal", () => {
  it("« Tous » d'abord, puis les animaux dans l'ordre du vocabulaire", () => {
    const liste = ongletsAnimaux(
      [
        ART({ nom: "Graines", animaux: ["oiseau"] }),
        ART({ nom: "Collier", animaux: ["chien"] }),
        ART({ nom: "Griffoir", animaux: ["chat"] }),
      ],
      null,
    );
    expect(liste.map((o) => o.valeur)).toEqual([null, "chien", "chat", "oiseau"]);
    // L'ordre est celui d'ANIMAUX, jamais celui des articles ni l'alphabet.
    const rang = (v: string) => (ANIMAUX as readonly string[]).indexOf(v);
    expect(rang("chien")).toBeLessThan(rang("chat"));
    expect(rang("chat")).toBeLessThan(rang("oiseau"));
  });

  it("les libellés viennent d'etiquettesArticles, jamais écrits en dur", () => {
    const liste = ongletsAnimaux([ART({ nom: "Boule", animaux: ["faune"] })], null);
    expect(liste.find((o) => o.valeur === "faune")?.libelle)
      .toBe(libelleValeur("animaux", "faune"));
    expect(liste[0].libelle).toBe("Tous");
  });

  it("un onglet n'apparaît QUE s'il a au moins un article", () => {
    const liste = ongletsAnimaux([ART({ nom: "Collier", animaux: ["chien"] })], null);
    expect(liste.map((o) => o.valeur)).toEqual([null, "chien"]);
    expect(liste.map((o) => o.valeur)).not.toContain("furet");
  });

  it("UN ARTICLE CHIEN + CHAT EST COMPTÉ DANS LES DEUX ONGLETS", () => {
    /**
     * Et une seule fois dans « Tous » : c'est le même article, rangé à deux
     * endroits, pas deux articles. Une gamelle qui sert au chien comme au chat
     * doit se retrouver sous les deux, sinon on la cherche sous celui où on ne
     * l'a pas mise.
     */
    const liste = ongletsAnimaux(
      [ART({ nom: "Gamelle", animaux: ["chien", "chat"] }), ART({ nom: "Laisse", animaux: ["chien"] })],
      null,
    );
    expect(liste.find((o) => o.valeur === "chien")?.nombre).toBe(2);
    expect(liste.find((o) => o.valeur === "chat")?.nombre).toBe(1);
    expect(liste.find((o) => o.valeur === null)?.nombre).toBe(2);
  });

  it("l'onglet actif est marqué, et un seul", () => {
    const liste = ongletsAnimaux(
      [ART({ nom: "A", animaux: ["chien"] }), ART({ nom: "B", animaux: ["chat"] })],
      "chat",
    );
    expect(liste.filter((o) => o.actif)).toHaveLength(1);
    expect(liste.find((o) => o.actif)?.valeur).toBe("chat");
  });

  it("aucun article : aucune barre", () => {
    expect(ongletsAnimaux([], null)).toEqual([]);
  });
});

describe("un onglet inconnu ou vide ramène à « Tous »", () => {
  const articles = [ART({ nom: "Collier", animaux: ["chien"] })];

  it("un animal qui n'existe pas", () => {
    expect(animalRetenu("licorne", articles)).toBeNull();
  });

  it("un animal connu mais sans article ici", () => {
    /**
     * Laisser une liste vide avec aucun onglet allumé donnerait l'impression
     * que le magasin est vide. On montre tout, et « Tous » s'allume.
     */
    expect(animalRetenu("furet", articles)).toBeNull();
  });

  it("rien de demandé", () => {
    expect(animalRetenu("", articles)).toBeNull();
    expect(animalRetenu(null, articles)).toBeNull();
    expect(animalRetenu(undefined, articles)).toBeNull();
  });

  it("un animal présent est retenu, lui", () => {
    expect(animalRetenu("chien", articles)).toBe("chien");
    expect(animalRetenu("  chien  ", articles)).toBe("chien");
  });

  it("l'onglet « Tous » ne filtre rien", () => {
    expect(articleDeLAnimal(ART({ nom: "A", animaux: ["chat"] }), null)).toBe(true);
    expect(articleDeLAnimal(ART({ nom: "A", animaux: ["chat"] }), "chien")).toBe(false);
    expect(articleDeLAnimal(ART({ nom: "A", animaux: ["chien", "chat"] }), "chat")).toBe(true);
  });

  it("un article sans animal n'apparaît sous aucun onglet, mais bien sous « Tous »", () => {
    // Il existe, il se vend, il se corrige : le cacher partout le rendrait
    // introuvable — et c'est justement celui qu'il faut retrouver.
    const orphelin = ART({ nom: "Oublié", animaux: [] });
    expect(articleDeLAnimal(orphelin, null)).toBe(true);
    expect(articleDeLAnimal(orphelin, "chien")).toBe(false);
  });
});

// ── Les rayons ─────────────────────────────────────────────────────────────

describe("les articles groupés par rayon, dans l'ORDRE DU MAGASIN", () => {
  it("l'ordre est celui de CATEGORIES_ARTICLE, jamais l'alphabet", () => {
    const groupes = grouperParRayon([
      ART({ nom: "Cage", categorie: "cages_enclos" }),
      ART({ nom: "Croquettes", categorie: "alimentation_seche" }),
      ART({ nom: "Balle", categorie: "jouets" }),
    ]);
    expect(groupes.map((g) => g.valeur)).toEqual([
      "alimentation_seche", "jouets", "cages_enclos",
    ]);
    // Et c'est bien l'ordre du magasin, relu à la source.
    const rangs = groupes.map((g) => ordreCategorie(g.valeur));
    expect([...rangs]).toEqual([...rangs].sort((a, b) => a - b));
    // L'alphabet aurait mis « alimentation_seche, balle… » autrement.
    expect(groupes.map((g) => g.valeur)).not.toEqual(
      [...groupes.map((g) => g.valeur)].sort(),
    );
  });

  it("UN RAYON VIDE N'EST PAS AFFICHÉ", () => {
    /**
     * Une liste de rayons dont la moitié annonce « 0 » se parcourt plus mal
     * qu'une liste courte. Le magasin en compte vingt-deux ; deux suffisent ici.
     */
    const groupes = grouperParRayon([ART({ nom: "Balle", categorie: "jouets" })]);
    expect(groupes).toHaveLength(1);
    expect(groupes.map((g) => g.valeur)).not.toContain("litiere");
    expect(CATEGORIES_ARTICLE.length).toBeGreaterThan(groupes.length);
  });

  it("à l'intérieur d'un rayon, les articles sont triés par nom", () => {
    const groupes = grouperParRayon([
      ART({ nom: "Zèbre", categorie: "jouets" }),
      ART({ nom: "Éléphant", categorie: "jouets" }),
      ART({ nom: "Balle", categorie: "jouets" }),
    ]);
    expect(groupes[0].articles.map((a) => a.nom)).toEqual(["Balle", "Éléphant", "Zèbre"]);
  });

  it("le libellé du rayon vient du module, pas de la valeur brute", () => {
    const groupes = grouperParRayon([ART({ nom: "Cage", categorie: "cages_enclos" })]);
    expect(groupes[0].libelle).toBe("Cages et enclos");
  });

  it("un rayon inconnu est rangé À LA FIN, jamais perdu", () => {
    /**
     * Une valeur entrée en base avant que le code ne la connaisse existe : la
     * taire rendrait ses articles introuvables depuis cet écran, et personne
     * ne saurait qu'ils manquent.
     */
    const groupes = grouperParRayon([
      ART({ nom: "Mystère", categorie: "rayon_inconnu" }),
      ART({ nom: "Balle", categorie: "jouets" }),
    ]);
    expect(groupes.map((g) => g.valeur)).toEqual(["jouets", "rayon_inconnu"]);
    expect(groupes.at(-1)?.libelle).toBe("rayon_inconnu");
  });

  it("aucun article n'est perdu ni dupliqué par le groupement", () => {
    const articles = [
      ART({ nom: "A", categorie: "jouets" }),
      ART({ nom: "B", categorie: "litiere" }),
      ART({ nom: "C", categorie: "jouets" }),
    ];
    const groupes = grouperParRayon(articles);
    const ids = groupes.flatMap((g) => g.articles.map((a) => a.id));
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
  });
});

describe("repliés par défaut, ouverts quand on cherche", () => {
  it("plusieurs rayons, aucun filtre : repliés", () => {
    expect(rayonsOuverts({ filtreActif: false, nbRayons: 5 })).toBe(false);
  });

  it("une recherche ou un filtre : tout est ouvert", () => {
    // Replier cacherait la réponse : il faudrait deviner dans quel rayon elle
    // se trouve avant de la voir.
    expect(rayonsOuverts({ filtreActif: true, nbRayons: 5 })).toBe(true);
  });

  it("un seul rayon : ouvert, replier n'économise rien", () => {
    expect(rayonsOuverts({ filtreActif: false, nbRayons: 1 })).toBe(true);
    expect(rayonsOuverts({ filtreActif: false, nbRayons: 0 })).toBe(true);
  });
});

// ── Ce que l'écran en fait ─────────────────────────────────────────────────

const lire = (relatif: string) => readFileSync(join(process.cwd(), relatif), "utf8");

describe("la page compose les filtres dans le bon ordre", () => {
  const PAGE = "app/(admin)/boutique/articles/page.tsx";

  it("les onglets se calculent SANS le filtre d'animal", () => {
    /**
     * L'invariant le plus facile à casser : calculer les onglets sur la liste
     * déjà filtrée par animal ferait disparaître tous les autres onglets, et
     * l'on ne pourrait plus en sortir qu'en effaçant l'adresse à la main.
     */
    const src = lire(PAGE);
    expect(src).toMatch(/const saufAnimal = tous\.filter\(correspond\)/);
    expect(src).toMatch(/ongletsAnimaux\(saufAnimal, animal\)/);
  });

  it("l'animal se combine à TOUS les filtres existants", () => {
    /**
     * `correspond` porte la recherche, la catégorie, le fournisseur, le statut,
     * le seuil, le poids, les étiquettes et le sur-commande ; l'animal s'y
     * ajoute APRÈS, sur le résultat. Aucun filtre n'est donc perdu en changeant
     * d'onglet.
     */
    const src = lire(PAGE);
    expect(src).toMatch(/const retenus = saufAnimal\.filter\(\(a\) => articleDeLAnimal\(a, animal\)\)/);
    for (const filtre of [
      "recherche", "categorie", "fournisseur", "statut",
      "seulementSousSeuil", "seulementSansPoids", "seulementSansEtiquettes", "seulementSurCommande",
    ]) {
      expect(src, `${filtre} doit rester dans correspond`).toContain(filtre);
    }
  });

  it("le lien d'un onglet garde les filtres en cours", () => {
    // Changer d'onglet ne doit pas effacer la recherche : on compare deux
    // animaux SUR le même filtre, c'est tout l'intérêt.
    const src = lire(PAGE);
    expect(src).toMatch(/const lienOnglet = /);
    expect(src).toMatch(/if \(cle === "animal" \|\| cle === "supprime"\) continue/);
  });

  it("les compteurs de tête suivent l'onglet", () => {
    const src = lire(PAGE);
    expect(src).toMatch(/const tousDeLOnglet = tous\.filter\(\(a\) => articleDeLAnimal\(a, animal\)\)/);
    expect(src).toMatch(/tous=\{tousDeLOnglet\}/);
  });
});

describe("RIEN NE CHANGE POUR L'ATELIER", () => {
  it("sa page ne demande ni onglets, ni rayons, ni lien d'onglet", () => {
    /**
     * Des rivets et de la sangle n'ont ni animal ni rayon de magasin. Leur
     * imposer ce classement aurait fabriqué un rayon « Divers » de cent lignes.
     * Les propriétés sont facultatives : c'est ce qui laisse l'atelier intact.
     */
    const src = lire("app/(admin)/atelier/fournitures/page.tsx");
    for (const prop of ["onglets=", "groupes=", "lienOnglet=", "rayonsOuverts="]) {
      expect(src, `l'atelier ne passe pas ${prop}`).not.toContain(prop);
    }
  });

  it("sans ces propriétés, le composant rend UN seul tableau", () => {
    const src = lire("app/components/stock/CatalogueStock.tsx");
    // La branche « un seul tableau » existe toujours, et c'est celle par défaut.
    expect(src).toContain("<Carte>{tableau(articles)}</Carte>");
    expect(src).toMatch(/\) : groupes \? \(/);
  });

  it("les onglets sont des LIENS, avec aria-current", () => {
    /**
     * Des liens fonctionnent sans JavaScript, se partagent et s'ouvrent dans
     * un onglet du navigateur. `aria-current` dit lequel est actif — la
     * couleur seule ne le dirait pas à qui n'y voit pas.
     */
    const src = lire("app/components/stock/CatalogueStock.tsx");
    expect(src).toMatch(/aria-current=\{o\.actif \? "page" : undefined\}/);
    expect(src).toMatch(/<Link\s+href=\{lienOnglet\(o\.valeur\)\}/);
    // Et la barre défile dans son conteneur, pas la page (téléphone).
    expect(src).toMatch(/aria-label="Filtrer par animal"[\s\S]{0,120}overflow-x-auto/);
  });
});
