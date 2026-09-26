import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  GROUPES,
  ANIMAUX,
  champsDeCategorie,
  champsDeCategorieEtAnimaux,
  groupeVautPourAnimaux,
  valeursPourAnimaux,
} from "@/src/lib/etiquettesArticles";
import {
  FILTRES_VIDES,
  filtrer,
  filtresAffiches,
  ongletsAnimaux,
  ongletRetenu,
  depuisParams,
  versParams,
  type ArticleFiltrable,
  type Filtres,
} from "@/src/lib/filtresCatalogueLogique";

/**
 * La table unique : quel filtre vaut pour quel animal (APP 27).
 *
 * C'est la pièce que Sabrina a dictée, et la seule chose qui empêche la boutique
 * de proposer « Taille du chien » sous l'onglet Chats. Elle vit dans
 * `etiquettesArticles`, en un seul endroit — ce fichier vérifie surtout qu'elle
 * y vit VRAIMENT, c'est-à-dire qu'aucun écran ne refait le raisonnement de son
 * côté. Deux endroits qui décident finissent par se contredire, et on ne sait
 * plus lequel dit vrai.
 */

/** Un article minimal, pour le catalogue. */
function art(a: Partial<ArticleFiltrable> & { animaux: string[] }): ArticleFiltrable {
  return {
    id: Math.random().toString(36).slice(2),
    nom: "Article",
    categorie: "alimentation_seche",
    prix_vente: 10,
    prix_final: 10,
    en_stock: true,
    ...a,
  } as ArticleFiltrable;
}

const onglet = (animal: string | null): Filtres => ({ ...FILTRES_VIDES, animal });
const nomsDesFiltres = (f: Filtres, articles: ArticleFiltrable[]) =>
  filtresAffiches(articles, f).map((x) => x.libelle);

describe("la table, lue directement", () => {
  it("« Taille du chien » ne vaut QUE pour le chien", () => {
    expect(groupeVautPourAnimaux("tailles_chien", ["chien"])).toBe(true);
    for (const a of ["chat", "rongeur", "furet", "reptile", "oiseau"]) {
      expect(groupeVautPourAnimaux("tailles_chien", [a]), a).toBe(false);
    }
    // Un article chien ET chat garde le filtre : l'un de ses animaux le demande.
    expect(groupeVautPourAnimaux("tailles_chien", ["chat", "chien"])).toBe(true);
  });

  it("« Espèce » ne vaut QUE pour les rongeurs", () => {
    expect(groupeVautPourAnimaux("especes", ["rongeur"])).toBe(true);
    for (const a of ["chien", "chat", "furet", "reptile", "oiseau"]) {
      expect(groupeVautPourAnimaux("especes", [a]), a).toBe(false);
    }
  });

  it("« Besoin » : chien et chat ; « Goût » et « Contient » : et le furet", () => {
    // Du vocabulaire d'aliment carnivore. Un granulé de lapin n'est pas « light ».
    expect(groupeVautPourAnimaux("besoins", ["chien"])).toBe(true);
    expect(groupeVautPourAnimaux("besoins", ["chat"])).toBe(true);
    expect(groupeVautPourAnimaux("besoins", ["furet"])).toBe(false);
    for (const g of ["gouts", "proteines"] as const) {
      for (const a of ["chien", "chat", "furet"]) {
        expect(groupeVautPourAnimaux(g, [a]), `${g}/${a}`).toBe(true);
      }
      for (const a of ["rongeur", "reptile", "oiseau"]) {
        expect(groupeVautPourAnimaux(g, [a]), `${g}/${a}`).toBe(false);
      }
    }
  });

  it("« Type de soin », la couleur, la matière et l'usage valent pour tous", () => {
    for (const g of ["types_soin", "couleurs", "matieres", "usages_jouet", "ages"] as const) {
      for (const a of ANIMAUX) {
        expect(groupeVautPourAnimaux(g, [a]), `${g}/${a}`).toBe(true);
      }
    }
  });

  it("aucun animal connu : rien n'est masqué", () => {
    // Une fiche dont l'animal n'est pas encore coché doit rester remplissable :
    // masquer par excès de zèle empêcherait de saisir.
    expect(groupeVautPourAnimaux("tailles_chien", [])).toBe(true);
    expect(groupeVautPourAnimaux("tailles_chien", null)).toBe(true);
    expect(groupeVautPourAnimaux("especes", ["licorne"])).toBe(true);
  });
});

describe("les valeurs d'âge suivent l'animal", () => {
  const valeurs = (animaux: string[] | null) =>
    valeursPourAnimaux("ages", animaux).map((v) => v.valeur);

  it("le chien a le chiot, jamais le chaton", () => {
    expect(valeurs(["chien"])).toEqual(["chiot", "junior", "adulte", "senior"]);
  });

  it("le chat a le chaton, jamais le chiot NI le junior", () => {
    // Décision de Sabrina : chaton puis adulte. On ne comble pas le trou de
    // notre propre autorité.
    expect(valeurs(["chat"])).toEqual(["chaton", "adulte", "senior"]);
  });

  it("les NAC n'ont ni chiot ni chaton", () => {
    for (const a of ["rongeur", "furet", "reptile", "oiseau"]) {
      expect(valeurs([a]), a).toEqual(["junior", "adulte", "senior"]);
    }
  });

  it("un article pour deux animaux propose l'UNION, dans l'ordre du vocabulaire", () => {
    // L'intersection aurait effacé le chiot d'un paquet « chiots et chatons ».
    // « junior » y est parce que le CHIEN l'a : l'union prend tout ce que l'un
    // ou l'autre autorise, et c'est à Sabrina de cocher ce qui convient.
    expect(valeurs(["chien", "chat"]))
      .toEqual(["chiot", "chaton", "junior", "adulte", "senior"]);
  });

  it("les autres groupes ne sont pas filtrés par l'animal", () => {
    // Seul l'âge a des valeurs qui dépendent de l'animal. « Contient » propose
    // les seize protéines à tout le monde.
    expect(valeursPourAnimaux("proteines", ["chien"])).toEqual(GROUPES.proteines.valeurs);
  });
});

describe("le croisement catégorie x animal, sur la fiche", () => {
  it("un aliment pour chien montre la taille du chien ; pour lapin, non", () => {
    expect(champsDeCategorieEtAnimaux("alimentation_complete", ["chien"]))
      .toContain("tailles_chien");
    expect(champsDeCategorieEtAnimaux("alimentation_complete", ["rongeur"]))
      .not.toContain("tailles_chien");
  });

  it("un foin de lapin ne demande ni besoin ni goût, mais garde l'âge", () => {
    const champs = champsDeCategorieEtAnimaux("alimentation_complete", ["rongeur"]);
    expect(champs).not.toContain("besoins");
    expect(champs).not.toContain("gouts");
    expect(champs).not.toContain("proteines");
    expect(champs).toContain("ages");
    // Les cases ne dépendent pas de l'animal : un foin « sans céréales » existe.
    expect(champs).toContain("sans_cereales");
  });

  it("« Espèce » n'apparaît que si « Rongeurs » est coché", () => {
    // La catégorie ne suffit pas, l'animal ne suffit pas : il faut les deux —
    // et `especes` n'est dans la liste d'AUCUNE catégorie, donc elle se montre
    // par la seule règle de l'animal, sur la fiche.
    expect(groupeVautPourAnimaux("especes", ["rongeur"])).toBe(true);
    expect(groupeVautPourAnimaux("especes", ["chien"])).toBe(false);
  });

  it("le croisement n'invente jamais un champ que la catégorie ne demande pas", () => {
    // Une litière ne montre rien, quel que soit l'animal.
    for (const a of ANIMAUX) {
      expect(champsDeCategorieEtAnimaux("litiere", [a]), a).toEqual([]);
    }
    // Un collier de chat perd la taille du chien et ne gagne rien.
    expect(champsDeCategorieEtAnimaux("colliers", ["chat"]))
      .toEqual(["taille_article", "couleurs", "matieres"]);
  });

  it("« animaux » n'est jamais dans la liste rendue : il est EN TÊTE", () => {
    // Sa section se place avant tout le reste, parce que c'est elle qui commande
    // ce que les autres montrent. L'y mêler l'aurait noyée au milieu.
    for (const c of ["alimentation_seche", "litiere", "soins", "griffoirs", "divers"]) {
      expect(champsDeCategorie(c), c).not.toContain("animaux");
      expect(champsDeCategorieEtAnimaux(c, ["chien"]), c).not.toContain("animaux");
    }
  });
});

describe("le panneau de filtres du catalogue, dans un onglet", () => {
  const croquettesChien = art({ animaux: ["chien"], tailles_chien: ["grand"], ages: ["chiot"] });
  const pateeChat = art({ animaux: ["chat"], categorie: "alimentation_humide", ages: ["chaton"] });
  const foinLapin = art({
    animaux: ["rongeur"], categorie: "alimentation_complete",
    especes: ["lapin"], ages: ["adulte"],
  });
  const shampooing = art({
    animaux: ["chien", "chat"], categorie: "soins", types_soin: ["pelage"],
  });
  const tous = [croquettesChien, pateeChat, foinLapin, shampooing];

  it("un filtre de chien n'apparaît PAS dans l'onglet Chats", () => {
    expect(nomsDesFiltres(onglet("chien"), tous)).toContain("Taille du chien");
    expect(nomsDesFiltres(onglet("chat"), tous)).not.toContain("Taille du chien");
  });

  it("l'onglet Rongeurs ne propose en âge que junior, adulte et senior", () => {
    const filtres = filtresAffiches(tous, onglet("rongeur"));
    const age = filtres.find((x) => x.libelle === "Âge");
    const proposees = (age?.valeurs ?? []).map((v) => v.valeur);
    expect(proposees).not.toContain("chiot");
    expect(proposees).not.toContain("chaton");
    for (const v of proposees) expect(["junior", "adulte", "senior"]).toContain(v);
  });

  it("sans onglet, tout se propose : on ne sait pas encore pour qui elle cherche", () => {
    const noms = nomsDesFiltres(onglet(null), tous);
    expect(noms).toContain("Taille du chien");
  });

  it("l'onglet ne montre QUE les articles de cet animal", () => {
    expect(filtrer(tous, onglet("chien")).map((a) => a.id).sort())
      .toEqual([croquettesChien.id, shampooing.id].sort());
    expect(filtrer(tous, onglet("rongeur"))).toEqual([foinLapin]);
  });

  it("un article pour plusieurs animaux apparaît dans CHACUN de leurs onglets", () => {
    // Le même article, pas une copie : son identifiant est le même des deux côtés.
    expect(filtrer(tous, onglet("chien"))).toContain(shampooing);
    expect(filtrer(tous, onglet("chat"))).toContain(shampooing);
    expect(filtrer(tous, onglet("rongeur"))).not.toContain(shampooing);
  });

  it("une valeur sans article ne se propose pas, onglet compris", () => {
    // La règle d'avant APP 27, qui doit tenir dans un onglet aussi : un filtre
    // qui ne ramène rien est un cul-de-sac.
    const filtres = filtresAffiches(tous, onglet("chat"));
    for (const liste of filtres) {
      for (const v of liste.valeurs) {
        expect(v.nombre, `${liste.libelle}/${v.valeur}`).toBeGreaterThan(0);
      }
    }
  });

  it("« animaux » n'est JAMAIS un filtre du panneau : c'est l'onglet", () => {
    for (const a of [null, ...ANIMAUX]) {
      expect(nomsDesFiltres(onglet(a), tous), String(a)).not.toContain("Animal");
    }
  });
});

describe("la table vit en UN seul endroit", () => {
  it("aucun écran ne réécrit la règle de son côté", () => {
    /**
     * Ce que ce test empêche : qu'un composant décide lui-même que « Espèce » se
     * montre, ou qu'un autre liste les animaux qui ont droit à « Besoin ». Deux
     * endroits qui décident finissent par se contredire, et le jour où cela
     * arrive, personne ne sait lequel fait foi.
     */
    const fichiers = [
      "app/components/stock/EtiquettesArticle.tsx",
      "app/(public)/catalogue/FiltresCatalogue.tsx",
      "app/(public)/catalogue/CatalogueBoutique.tsx",
      "src/lib/filtresCatalogueLogique.ts",
    ];
    for (const chemin of fichiers) {
      const src = readFileSync(join(__dirname, "..", chemin), "utf8");
      // Personne ne compare un animal en dur pour décider d'un filtre.
      expect(src, `${chemin} ne doit pas coder la règle en dur`)
        .not.toMatch(/===\s*"rongeur"|includes\("rongeur"\)/);
      expect(src, chemin).not.toMatch(/===\s*"furet"|includes\("furet"\)/);
    }
  });

  it("la règle passe par les fonctions de la table, et par elles seules", () => {
    const ecran = readFileSync(
      join(__dirname, "..", "app/components/stock/EtiquettesArticle.tsx"), "utf8");
    expect(ecran).toContain("champsDeCategorieEtAnimaux");
    expect(ecran).toContain("valeursPourAnimaux");

    const filtres = readFileSync(
      join(__dirname, "..", "src/lib/filtresCatalogueLogique.ts"), "utf8");
    expect(filtres).toContain("groupeVautPourAnimaux");
    expect(filtres).toContain("valeursPourAnimaux");
  });
});

describe("les onglets d'animal : aucun onglet vide, jamais", () => {
  const chien = (n = 1) => Array.from({ length: n }, () => art({ animaux: ["chien"] }));
  const rongeur = () => art({ animaux: ["rongeur"] });
  const partage = () => art({ animaux: ["chien", "chat"] });

  it("un seul animal servi : AUCUN onglet du tout", () => {
    /**
     * Le jour de l'ouverture, tout est pour chiens. Une rangée d'onglets qui ne
     * mènerait qu'à un seul endroit ne servirait qu'à occuper la place, et
     * ferait croire qu'il y a autre chose à voir.
     */
    expect(ongletsAnimaux(chien(5), null)).toEqual([]);
    expect(ongletsAnimaux([], null)).toEqual([]);
  });

  it("un article actif pour rongeurs fait apparaître « Rongeurs » — et « Tous »", () => {
    const onglets = ongletsAnimaux([...chien(3), rongeur()], null);
    expect(onglets.map((o) => o.libelle)).toEqual(["Tous", "Chiens", "Rongeurs"]);
    // « Tous » compte les articles, pas les animaux.
    expect(onglets[0].nombre).toBe(4);
    expect(onglets.find((o) => o.valeur === "rongeur")?.nombre).toBe(1);
  });

  it("retirer le dernier article d'un animal fait disparaître son onglet", () => {
    // C'est la même règle lue à l'envers, et c'est ce que Sabrina a demandé :
    // l'onglet suit les articles, elle n'a rien à déclarer.
    const avec = ongletsAnimaux([...chien(3), rongeur()], null);
    expect(avec.map((o) => o.valeur)).toContain("rongeur");
    const sans = ongletsAnimaux(chien(3), null);
    expect(sans).toEqual([]);
  });

  it("un onglet n'est jamais rendu avec zéro article", () => {
    const onglets = ongletsAnimaux([...chien(2), rongeur(), partage()], null);
    for (const o of onglets) {
      expect(o.nombre, o.libelle).toBeGreaterThan(0);
    }
    // Les animaux sans article n'y sont pas du tout.
    for (const absent of ["furet", "reptile", "oiseau"]) {
      expect(onglets.map((o) => o.valeur), absent).not.toContain(absent);
    }
  });

  it("l'ordre des onglets est celui du vocabulaire, pas celui des articles", () => {
    // Deux boutiques au même contenu se lisent pareil, quel que soit l'ordre de
    // saisie des articles.
    const onglets = ongletsAnimaux(
      [art({ animaux: ["oiseau"] }), rongeur(), ...chien(1)], null);
    expect(onglets.map((o) => o.valeur)).toEqual([null, "chien", "rongeur", "oiseau"]);
  });

  it("l'onglet choisi est marqué actif, et lui seul", () => {
    const onglets = ongletsAnimaux([...chien(2), rongeur()], "rongeur");
    expect(onglets.filter((o) => o.actif).map((o) => o.valeur)).toEqual(["rongeur"]);
  });

  it("un article pour deux animaux compte dans les DEUX onglets", () => {
    const onglets = ongletsAnimaux([partage()], null);
    expect(onglets.find((o) => o.valeur === "chien")?.nombre).toBe(1);
    expect(onglets.find((o) => o.valeur === "chat")?.nombre).toBe(1);
    // Mais « Tous » ne le compte qu'une fois : c'est UN article.
    expect(onglets[0].nombre).toBe(1);
  });
});

describe("un lien vers un onglet devenu vide", () => {
  it("ramène à « Tous », sans erreur et sans page blanche", () => {
    /**
     * Un signet, un lien envoyé par courriel : l'onglet visé peut avoir perdu
     * son dernier article entre-temps. La cliente doit voir la boutique, pas un
     * message d'erreur — et surtout pas une grille vide qui laisserait croire
     * que tout a disparu.
     */
    const articles = [...Array.from({ length: 3 }, () => art({ animaux: ["chien"] })),
                      art({ animaux: ["rongeur"] })];
    expect(ongletRetenu(articles, "rongeur")).toBe("rongeur");
    // Le furet n'a aucun article : le lien ramène à « Tous ».
    expect(ongletRetenu(articles, "furet")).toBeNull();
    // Un animal inventé aussi.
    expect(ongletRetenu(articles, "licorne")).toBeNull();
    // Et quand il ne reste qu'un animal, plus aucun onglet n'existe.
    expect(ongletRetenu(Array.from({ length: 2 }, () => art({ animaux: ["chien"] })), "chien"))
      .toBeNull();
  });

  it("l'adresse ne retient qu'un animal du vocabulaire", () => {
    // Une adresse bricolée à la main ne doit rien pouvoir injecter.
    expect(depuisParams(new URLSearchParams("animal=rongeur")).animal).toBe("rongeur");
    expect(depuisParams(new URLSearchParams("animal=licorne")).animal).toBeNull();
    expect(depuisParams(new URLSearchParams("animal=")).animal).toBeNull();
    expect(depuisParams(new URLSearchParams("")).animal).toBeNull();
  });

  it("l'onglet voyage dans l'adresse, avant le rayon", () => {
    const p = versParams({ ...FILTRES_VIDES, animal: "chat", categorie: "litiere" });
    expect(p.toString()).toBe("animal=chat&cat=litiere");
    // Aller et retour : ce qui sort de l'adresse est ce qui y était entré.
    expect(depuisParams(p).animal).toBe("chat");
    expect(depuisParams(p).categorie).toBe("litiere");
  });

  it("« Espèce » et « Type de soin » voyagent aussi", () => {
    const p = versParams({ ...FILTRES_VIDES, especes: ["lapin"], types_soin: ["pelage"] });
    expect(depuisParams(p).especes).toEqual(["lapin"]);
    expect(depuisParams(p).types_soin).toEqual(["pelage"]);
    // Hors vocabulaire : ignoré, jamais recopié.
    expect(depuisParams(new URLSearchParams("espece=dragon")).especes).toEqual([]);
  });
});
