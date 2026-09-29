// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "./setup/attenteJsdom";
import {
  FILTRES_VIDES,
  filtresAffiches,
  ongletsAnimaux,
  type ArticleFiltrable,
  type Filtres,
} from "@/src/lib/filtresCatalogueLogique";
import { groupeFiltrablePourOnglet } from "@/src/lib/etiquettesArticles";

/**
 * APP 31 — « Espèce » chez les rongeurs, et l'onglet actif qu'on voit.
 *
 * ── CE QUE CE FICHIER GARDE ───────────────────────────────────────────────
 *
 * 1. « Espèce » est un filtre du catalogue, soumis à la SEULE règle de l'animal.
 *    Il ne peut donc apparaître que dans l'onglet Rongeurs — et surtout pas dans
 *    « Tous », où il proposerait Lapin et Hamster entre deux sacs de croquettes.
 * 2. « Tout effacer » efface les filtres, pas la navigation.
 * 3. La rangée d'onglets ramène l'onglet actif sous les yeux à l'ouverture.
 *
 * ── LE PIÈGE DU POINT 1, ET IL ÉTAIT ARMÉ ─────────────────────────────────
 *
 * `groupeVautPourAnimaux(groupe, null)` rend VRAI pour n'importe quel groupe :
 * c'est voulu pour la FICHE d'un article, où « aucun animal coché » veut dire
 * « pas encore renseigné ». Dans le catalogue, « aucun animal » veut dire
 * l'onglet « Tous » — un choix, pas une lacune. Brancher « Espèce » sur les
 * filtres universels sans rien d'autre l'aurait donc fait apparaître dans
 * « Tous » dès qu'un rongeur a un article. D'où `groupeFiltrablePourOnglet`.
 */

const ART = (a: Partial<ArticleFiltrable>): ArticleFiltrable =>
  ({
    id: Math.random().toString(36).slice(2),
    nom: "Article",
    categorie: "alimentation_complete",
    prix_vente: 10,
    prix_final: 10,
    en_stock: true,
    ...a,
  }) as ArticleFiltrable;

const onglet = (animal: string | null): Filtres => ({ ...FILTRES_VIDES, animal });
const libelles = (f: Filtres, articles: ArticleFiltrable[]) =>
  filtresAffiches(articles, f).map((x) => x.libelle);

/** Un foin de lapin, et de quoi faire exister l'onglet Rongeurs. */
const FOIN_LAPIN = ART({ animaux: ["rongeur"], especes: ["lapin"] });
const CROQUETTES = ART({ animaux: ["chien"], categorie: "alimentation_seche" });

describe("« Espèce » n'existe que dans l'onglet Rongeurs", () => {
  it("elle est proposée dans l'onglet Rongeurs, avec un article lapin", () => {
    expect(libelles(onglet("rongeur"), [FOIN_LAPIN, CROQUETTES])).toContain("Espèce");
  });

  it("elle est ABSENTE de l'onglet « Tous », même quand un rongeur a des articles", () => {
    /**
     * C'est le cas que le code d'avant aurait raté : l'article lapin existe, sa
     * valeur existe, et la règle générale de l'animal dit « oui » quand aucun
     * animal n'est choisi. Seule la règle de l'ONGLET dit non.
     */
    expect(libelles(onglet(null), [FOIN_LAPIN, CROQUETTES])).not.toContain("Espèce");
  });

  it("elle est absente de tous les autres onglets", () => {
    for (const animal of ["chien", "chat", "furet", "reptile", "oiseau"]) {
      const articles = [FOIN_LAPIN, ART({ animaux: [animal], especes: ["lapin"] })];
      expect(libelles(onglet(animal), articles), animal).not.toContain("Espèce");
    }
  });

  it("une valeur sans article n'est JAMAIS rendue, et le compte est celui des articles", () => {
    /**
     * Le vocabulaire compte huit espèces. Une liste qui les proposerait toutes
     * ferait cliquer sur « Chinchilla » pour n'obtenir aucune ligne — et on
     * n'essaierait pas la suivante.
     */
    const articles = [FOIN_LAPIN, ART({ animaux: ["rongeur"], especes: ["lapin"] }), CROQUETTES];
    const liste = filtresAffiches(articles, onglet("rongeur")).find((x) => x.libelle === "Espèce");
    expect(liste).toBeTruthy();
    expect(liste!.valeurs.map((v) => v.valeur)).toEqual(["lapin"]);
    expect(liste!.valeurs[0].nombre, "deux articles de lapin").toBe(2);
    for (const absente of ["hamster", "chinchilla", "degu"]) {
      expect(liste!.valeurs.map((v) => v.valeur), absente).not.toContain(absente);
    }
  });

  it("aucun rayon ne la commande : elle suit l'animal, et lui seul", () => {
    /**
     * Un foin, une litière et une cage de lapin se filtrent tous par l'espèce.
     * Lister les rayons concernés aurait créé une seconde règle à tenir à jour,
     * et le jour où un rayon serait oublié, le filtre disparaîtrait sans raison
     * visible.
     */
    for (const rayon of ["litiere", "cages_enclos", "friandises", "jouets"]) {
      const article = ART({ animaux: ["rongeur"], especes: ["lapin"], categorie: rayon });
      const f = { ...onglet("rongeur"), categorie: rayon };
      expect(libelles(f, [article]), rayon).toContain("Espèce");
    }
  });

  it("la règle vit dans la table, et l'écran ne la réécrit pas", () => {
    // La fonction répond seule : pas de `if` sur l'animal dans le catalogue.
    expect(groupeFiltrablePourOnglet("especes", "rongeur")).toBe(true);
    expect(groupeFiltrablePourOnglet("especes", null)).toBe(false);
    expect(groupeFiltrablePourOnglet("especes", "chien")).toBe(false);
    // « Taille du chien » n'est PAS dans le même cas : elle qualifie l'article,
    // et se propose donc encore dans « Tous ».
    expect(groupeFiltrablePourOnglet("tailles_chien", null)).toBe(true);
    expect(groupeFiltrablePourOnglet("tailles_chien", "chat")).toBe(false);

    const src = readFileSync(
      join(__dirname, "..", "src/lib/filtresCatalogueLogique.ts"),
      "utf8",
    );
    expect(src, "aucune condition sur « rongeur » dans l'écran").not.toMatch(
      /"rongeur"|'rongeur'/,
    );
  });
});

describe("« Tout effacer » efface les filtres, pas la navigation", () => {
  it("l'onglet d'animal survit au bouton", () => {
    /**
     * Un onglet est une navigation : renvoyer quelqu'un du rayon des rongeurs
     * vers toute la boutique parce qu'il a décoché une couleur, c'est changer de
     * page sans le dire.
     */
    const src = readFileSync(
      join(__dirname, "..", "app/(public)/catalogue/FiltresCatalogue.tsx"),
      "utf8",
    );
    expect(src).toContain("{ ...FILTRES_VIDES, animal: filtres.animal }");
    // L'ancienne forme, qui perdait l'onglet, ne doit pas revenir.
    expect(src).not.toMatch(/surChangement\(\{ \.\.\.FILTRES_VIDES \}\)/);
  });

  it("et le reste est bien remis à zéro", () => {
    // La garde inverse : garder l'onglet ne doit pas garder les filtres.
    const apres: Filtres = { ...FILTRES_VIDES, animal: "rongeur" };
    expect(apres.especes).toEqual([]);
    expect(apres.categorie).toBeNull();
    expect(apres.en_stock).toBe(false);
    expect(apres.animal).toBe("rongeur");
  });
});

// ── La rangée d'onglets ────────────────────────────────────────────────────

const OngletsAnimaux = (await import("@/app/(public)/catalogue/OngletsAnimaux")).default;

afterEach(cleanup);

describe("l'onglet actif est ramené sous les yeux à l'ouverture", () => {
  /**
   * jsdom ne met rien en page et n'implémente pas `scrollIntoView` : on ne peut
   * pas mesurer un défilement ici. Ce qui se vérifie, c'est l'APPEL et ses
   * options — et ce sont elles qui portent tout le sens du geste.
   *
   * La vérification visuelle à 375 px reste à faire dans un navigateur.
   */
  function rendre(actif: string | null, reduit = false) {
    const appels: Array<Record<string, unknown>> = [];
    const boutons: HTMLElement[] = [];
    vi.stubGlobal("matchMedia", (requete: string) => ({
      matches: reduit && requete.includes("prefers-reduced-motion"),
      media: requete,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    // Le stub retient QUI a été recentré : sans cela, on saurait qu'on a appelé
    // mais pas sur le bon onglet — et c'est justement le défaut qu'on corrige.
    Element.prototype.scrollIntoView = function (o: unknown) {
      boutons.push(this as HTMLElement);
      appels.push(o as Record<string, unknown>);
    } as never;

    const articles = [CROQUETTES, FOIN_LAPIN];
    render(
      <OngletsAnimaux
        onglets={ongletsAnimaux(articles, actif)}
        surChoix={() => {}}
      />,
    );
    return { appels, boutons };
  }

  it("le recentrage porte sur l'onglet ACTIF, et sur lui seul", () => {
    const { appels, boutons } = rendre("rongeur");
    expect(appels).toHaveLength(1);
    expect(boutons[0].textContent).toContain("Rongeurs");
    expect(boutons[0].getAttribute("aria-pressed")).toBe("true");
  });

  it("l'axe VERTICAL ne bouge pas : la page ne saute pas sous les yeux", () => {
    // `block: "nearest"` ne fait rien tant que la rangée est déjà à l'écran.
    // C'est ce qui distingue « ramener l'onglet » de « sauter à la rangée ».
    const { appels } = rendre("rongeur");
    expect(appels[0].block).toBe("nearest");
  });

  it("l'axe horizontal déplace du MINIMUM : aucun effet si tout tient", () => {
    /**
     * `inline: "nearest"` et non `"center"` : sur un ordinateur où les trois
     * onglets tiennent, l'onglet actif est déjà visible et rien ne bouge.
     * « center » aurait recentré la rangée même quand il n'y avait rien à voir.
     */
    const { appels } = rendre("rongeur");
    expect(appels[0].inline).toBe("nearest");
    expect(appels[0].inline).not.toBe("center");
  });

  it("« moins de mouvement » retire l'animation, sans retirer le recentrage", () => {
    // Un défilement animé peut déclencher un vertige. On arrive quand même au
    // bon endroit — c'est le trajet qu'on supprime, pas la destination.
    expect(rendre("rongeur", false).appels[0].behavior).toBe("smooth");
    expect(rendre("rongeur", true).appels[0].behavior).toBe("auto");
  });

  it("« Tous » actif : le recentrage a lieu aussi, sur le premier onglet", () => {
    const { appels, boutons } = rendre(null);
    expect(appels).toHaveLength(1);
    expect(boutons[0].textContent).toContain("Tous");
  });

  it("aucun plantage si le navigateur ne sait pas recentrer", () => {
    /**
     * `scrollIntoView` manque dans jsdom et dans de vieux navigateurs. Une
     * rangée qui ne se recentre pas reste utilisable ; une page qui plante, non.
     */
    const original = Element.prototype.scrollIntoView;
    // @ts-expect-error — on retire volontairement la méthode.
    delete Element.prototype.scrollIntoView;
    vi.stubGlobal("matchMedia", undefined);
    expect(() =>
      render(
        <OngletsAnimaux
          onglets={ongletsAnimaux([CROQUETTES, FOIN_LAPIN], "rongeur")}
          surChoix={() => {}}
        />,
      ),
    ).not.toThrow();
    expect(screen.getByText(/Rongeurs/)).toBeTruthy();
    Element.prototype.scrollIntoView = original;
  });

  it("le recentrage n'a lieu qu'À L'OUVERTURE, pas à chaque clic", () => {
    /**
     * Au clic, le doigt est déjà sur l'onglet choisi : le faire glisser sous le
     * doigt serait une surprise désagréable. Le tableau de dépendances vide dit
     * exactement cela, et c'est lui qu'on garde.
     */
    const src = readFileSync(
      join(__dirname, "..", "app/(public)/catalogue/OngletsAnimaux.tsx"),
      "utf8",
    );
    expect(src).toContain("}, []);");
    expect(src).toContain("scrollIntoView");
  });

  it("APP 49 : il n'y a plus de rangée du tout dans le catalogue client", () => {
    /**
     * Ce test gardait que la rangée d'onglets ne se redessinait pas à deux
     * endroits. Elle ne se dessine plus nulle part : la boutique se parcourt
     * par ENCADRÉS — un par animal, puis un par rayon — et le fil d'Ariane dit
     * où l'on est.
     *
     * L'assertion qui comptait est CONSERVÉE, en plus fort : l'écran ne
     * redessine pas la rangée, et il n'en reçoit plus non plus.
     */
    const src = readFileSync(
      join(__dirname, "..", "app/(public)/catalogue/CatalogueBoutique.tsx"),
      "utf8",
    );
    expect(src).not.toContain("<OngletsAnimaux");
    expect(src).not.toContain('aria-label="Choisir un animal"');
  });
});
