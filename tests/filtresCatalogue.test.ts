import { describe, it, expect } from "vitest";
import {
  FILTRES_VIDES,
  TRANCHES_PRIX,
  depuisParams,
  estEnStock,
  filtrer,
  filtresAffiches,
  nombreFiltresActifs,
  prixAffiche,
  trancheDe,
  versParams,
  type ArticleFiltrable,
  type Filtres,
} from "@/src/lib/filtresCatalogueLogique";

/**
 * Les filtres du catalogue client (APP 24-FILTRES · D).
 *
 * Les deux règles qu'on croit évidentes et qui se trompent d'un cran :
 * DANS un filtre, les valeurs s'ajoutent ; ENTRE filtres, elles se
 * restreignent. Et les bornes de tranches de prix, qui ne se voient qu'au
 * franc exact.
 */

const article = (p: Partial<ArticleFiltrable> & { id: string }): ArticleFiltrable => ({
  nom: p.id,
  marque: null,
  categorie: "divers",
  type_article: "standard",
  prix_vente: 20,
  prix_final: 20,
  en_stock: true,
  expediable: true,
  ages: [],
  besoins: [],
  tailles_chien: [],
  proteines: [],
  couleurs: [],
  matieres: [],
  usages_jouet: [],
  sans_cereales: false,
  monoproteine: false,
  taille_article: null,
  ...p,
});

const filtres = (sur: Partial<Filtres> = {}): Filtres => ({ ...FILTRES_VIDES, ...sur });
const ids = (liste: ArticleFiltrable[]) => liste.map((a) => a.id);

const CATALOGUE: ArticleFiltrable[] = [
  article({ id: "croquettes-senior", categorie: "alimentation_seche", marque: "Bozita",
    prix_final: 29.5, prix_vente: 29.5, ages: ["senior"], besoins: ["light"],
    tailles_chien: ["petit"], proteines: ["poulet"], sans_cereales: true, expediable: false }),
  article({ id: "croquettes-chiot", categorie: "alimentation_seche", marque: "Bozita",
    prix_final: 62, prix_vente: 62, ages: ["chiot"], tailles_chien: ["grand"],
    proteines: ["saumon", "poulet"], monoproteine: false, expediable: false }),
  article({ id: "collier-cuir", categorie: "colliers", marque: "Hunter", prix_final: 43,
    prix_vente: 43, tailles_chien: ["petit", "moyen"], couleurs: ["noir"],
    matieres: ["cuir"], taille_article: "M" }),
  article({ id: "collier-nylon", categorie: "colliers", prix_final: 9.9, prix_vente: 9.9,
    tailles_chien: ["geant"], couleurs: ["rouge"], matieres: ["nylon"], taille_article: "L",
    en_stock: false }),
  article({ id: "corde", categorie: "jouets", prix_final: 10, prix_vente: 10,
    matieres: ["corde"], usages_jouet: ["tirer", "macher"], tailles_chien: ["moyen"] }),
];

describe("OU dans un filtre, ET entre filtres", () => {
  it("deux valeurs du même filtre s'ajoutent", () => {
    expect(ids(filtrer(CATALOGUE, filtres({ ages: ["senior"] })))).toEqual(["croquettes-senior"]);
    expect(ids(filtrer(CATALOGUE, filtres({ ages: ["senior", "chiot"] }))))
      .toEqual(["croquettes-senior", "croquettes-chiot"]);
  });

  it("deux filtres différents se restreignent", () => {
    // senior ET petit : le seul qui porte les deux.
    expect(ids(filtrer(CATALOGUE, filtres({ ages: ["senior"], tailles_chien: ["petit"] }))))
      .toEqual(["croquettes-senior"]);
    // senior ET géant : personne, alors que chacun pris seul rend quelqu'un.
    expect(filtrer(CATALOGUE, filtres({ ages: ["senior"], tailles_chien: ["geant"] })))
      .toEqual([]);
  });

  it("un article étiqueté deux fois est rendu une seule fois", () => {
    expect(ids(filtrer(CATALOGUE, filtres({ proteines: ["poulet", "saumon"] }))))
      .toEqual(["croquettes-senior", "croquettes-chiot"]);
  });

  it("une étiquette vide ne correspond à aucune valeur demandée", () => {
    expect(filtrer(CATALOGUE, filtres({ matieres: ["biothane"] }))).toEqual([]);
  });
});

describe("les tranches de prix, aux bornes", () => {
  it("le minimum est compris, le maximum exclu", () => {
    expect(trancheDe(9.99)).toBe("0-10");
    expect(trancheDe(10)).toBe("10-30");
    expect(trancheDe(29.99)).toBe("10-30");
    expect(trancheDe(30)).toBe("30-60");
    expect(trancheDe(59.99)).toBe("30-60");
    expect(trancheDe(60)).toBe("60+");
    expect(trancheDe(0)).toBe("0-10");
  });

  it("aucune tranche ne laisse un prix sans place, et aucune n'en revendique deux", () => {
    for (const prix of [0, 0.05, 9.99, 10, 10.01, 29.99, 30, 59.99, 60, 1000]) {
      const contenant = TRANCHES_PRIX.filter((t) => prix >= t.min && prix < t.max);
      expect(contenant).toHaveLength(1);
    }
  });

  it("filtre sur le prix AFFICHÉ, remise comprise", () => {
    const solde = article({ id: "solde", prix_vente: 40, prix_final: 8 });
    expect(prixAffiche(solde)).toBe(8);
    expect(ids(filtrer([solde], filtres({ prix: ["0-10"] })))).toEqual(["solde"]);
    expect(filtrer([solde], filtres({ prix: ["30-60"] }))).toEqual([]);
  });

  it("un sur-mesure se range sur son « dès … », pas sur un prix final calculé", () => {
    const surMesure = article({ id: "collier-sur-mesure", type_article: "personnalisable",
      prix_vente: 51, prix_final: 51 });
    expect(prixAffiche(surMesure)).toBe(51);
    expect(ids(filtrer([surMesure], filtres({ prix: ["30-60"] })))).toEqual(["collier-sur-mesure"]);
  });

  it("deux tranches cochées s'ajoutent", () => {
    expect(ids(filtrer(CATALOGUE, filtres({ prix: ["0-10", "60+"] }))))
      .toEqual(["croquettes-chiot", "collier-nylon"]);
  });
});

describe("les bascules", () => {
  it("« en stock » écarte l'épuisé, et garde le sur-mesure qui se fabrique", () => {
    expect(ids(filtrer(CATALOGUE, filtres({ en_stock: true }))))
      .toEqual(["croquettes-senior", "croquettes-chiot", "collier-cuir", "corde"]);
    const surMesure = article({ id: "sm", type_article: "personnalisable", en_stock: false });
    expect(estEnStock(surMesure)).toBe(true);
  });

  it("un client connecté n'a pas le booléen : le compte fait foi", () => {
    expect(estEnStock(article({ id: "x", en_stock: undefined, stock_disponible: 0 }))).toBe(false);
    expect(estEnStock(article({ id: "x", en_stock: undefined, stock_disponible: 2 }))).toBe(true);
  });

  it("« livrable par la poste » écarte ce qui ne part pas en colis", () => {
    expect(ids(filtrer(CATALOGUE, filtres({ expediable: true }))))
      .toEqual(["collier-cuir", "collier-nylon", "corde"]);
  });

  it("une bascule au repos ne demande rien", () => {
    expect(filtrer(CATALOGUE, filtres({}))).toHaveLength(CATALOGUE.length);
  });

  it("« sans céréales » ne garde que ce qui l'annonce", () => {
    expect(ids(filtrer(CATALOGUE, filtres({ sans_cereales: true })))).toEqual(["croquettes-senior"]);
  });
});

describe("les filtres proposés", () => {
  const nomsDe = (f: Filtres = filtres()) => filtresAffiches(CATALOGUE, f).map((x) => x.nom);

  it("un filtre sans aucune valeur n'apparaît pas", () => {
    // Personne ne porte de « besoin » sauf les croquettes senior : le filtre
    // existe. Sur un catalogue de colliers seuls, il disparaît.
    expect(nomsDe()).toContain("besoins");
    const colliers = CATALOGUE.filter((a) => a.categorie === "colliers");
    expect(filtresAffiches(colliers, filtres()).map((x) => x.nom)).not.toContain("besoins");
  });

  it("propose toujours catégorie, marque, prix, puis âge, besoin et taille du chien", () => {
    expect(nomsDe().slice(0, 3)).toEqual(["categorie", "marques", "prix"]);
    expect(nomsDe()).toContain("tailles_chien");
    // Sans catégorie choisie, pas de filtre propre à un rayon.
    expect(nomsDe()).not.toContain("matieres");
    expect(nomsDe()).not.toContain("proteines");
  });

  it("ajoute les filtres du rayon dès qu'une catégorie est choisie", () => {
    const alim = nomsDe(filtres({ categorie: "alimentation_seche" }));
    expect(alim).toContain("proteines");
    expect(alim).toContain("sans_cereales");
    expect(alim).not.toContain("couleurs");

    const colliers = nomsDe(filtres({ categorie: "colliers" }));
    expect(colliers).toContain("couleurs");
    expect(colliers).toContain("matieres");
    expect(colliers).toContain("tailles_article");
    expect(colliers).not.toContain("proteines");

    expect(nomsDe(filtres({ categorie: "jouets" }))).toContain("usages_jouet");
  });

  it("chaque valeur annonce son nombre d'articles", () => {
    const parNom = new Map(filtresAffiches(CATALOGUE, filtres()).map((f) => [f.nom, f]));
    const tailles = parNom.get("tailles_chien")!;
    expect(tailles.valeurs.map((v) => [v.valeur, v.nombre])).toEqual([
      ["petit", 2], ["moyen", 2], ["grand", 1], ["geant", 1],
    ]);
    const categories = parNom.get("categorie")!;
    expect(categories.valeurs.map((v) => [v.valeur, v.nombre])).toEqual([
      ["alimentation_seche", 2], ["colliers", 2], ["jouets", 1],
    ]);
  });

  it("compte SANS le filtre qu'il décrit : cocher une valeur n'efface pas les autres", () => {
    // C'est ce qui rend le choix multiple possible. Compté sur les articles
    // affichés, « chiot » tomberait à 0 dès qu'on coche « senior », donc
    // disparaîtrait du panneau.
    const apres = filtresAffiches(CATALOGUE, filtres({ ages: ["senior"] }));
    const ages = apres.find((f) => f.nom === "ages")!;
    expect(ages.valeurs.map((v) => [v.valeur, v.nombre, v.actif])).toEqual([
      ["chiot", 1, false], ["senior", 1, true],
    ]);
  });

  it("les autres filtres, eux, se resserrent sur ce qui reste", () => {
    const apres = filtresAffiches(CATALOGUE, filtres({ categorie: "colliers" }));
    const prix = apres.find((f) => f.nom === "prix")!;
    expect(prix.valeurs.map((v) => [v.valeur, v.nombre])).toEqual([["0-10", 1], ["30-60", 1]]);
  });

  it("une valeur cochée reste montrée même si plus rien ne la porte", () => {
    // Sans quoi elle disparaîtrait avec le seul moyen de la décocher.
    const impossible = filtres({ categorie: "jouets", matieres: ["cuir"] });
    const matieres = filtresAffiches(CATALOGUE, impossible).find((f) => f.nom === "matieres")!;
    expect(matieres.valeurs.find((v) => v.valeur === "cuir")).toEqual({
      valeur: "cuir", libelle: "Cuir", nombre: 0, actif: true,
    });
  });

  it("un filtre propre à un rayon ne fait pas disparaître les autres rayons", () => {
    // « cuir » ne concerne que les colliers ; le rayon « Jouets » doit rester
    // atteignable, puisque changer de rayon abandonne justement « cuir ».
    const dansLesColliers = filtres({ categorie: "colliers", matieres: ["cuir"] });
    const categories = filtresAffiches(CATALOGUE, dansLesColliers)
      .find((f) => f.nom === "categorie")!;
    expect(categories.valeurs.map((v) => v.valeur))
      .toEqual(["alimentation_seche", "colliers", "jouets"]);
  });

  it("la catégorie est un choix unique, les autres non", () => {
    const parNom = new Map(filtresAffiches(CATALOGUE, filtres()).map((f) => [f.nom, f.choix]));
    expect(parNom.get("categorie")).toBe("unique");
    expect(parNom.get("marques")).toBe("multiple");
  });

  it("compte les filtres actifs, pour le bouton « Filtrer (n) »", () => {
    expect(nombreFiltresActifs(filtres())).toBe(0);
    expect(nombreFiltresActifs(filtres({
      categorie: "colliers", ages: ["senior", "chiot"], en_stock: true,
    }))).toBe(4);
  });
});

describe("l'aller-retour entre l'URL et les filtres", () => {
  const complet = filtres({
    categorie: "colliers",
    marques: ["Hunter", "Bozita"],
    prix: ["10-30", "60+"],
    en_stock: true,
    expediable: true,
    ages: ["chiot", "senior"],
    besoins: ["light"],
    tailles_chien: ["petit"],
    proteines: ["saumon"],
    couleurs: ["noir"],
    matieres: ["cuir"],
    usages_jouet: ["macher"],
    tailles_article: ["M", "L"],
    sans_cereales: true,
    monoproteine: true,
  });

  it("écrit puis relit les mêmes filtres", () => {
    expect(depuisParams(versParams(complet))).toEqual(complet);
  });

  it("n'écrit rien pour un filtre vide", () => {
    expect(versParams(filtres()).toString()).toBe("");
    expect(depuisParams(new URLSearchParams(""))).toEqual(FILTRES_VIDES);
  });

  it("donne une adresse lisible, qui se partage", () => {
    expect(versParams(filtres({ categorie: "colliers", tailles_chien: ["petit", "moyen"] })).toString())
      .toBe("cat=colliers&taille=petit%2Cmoyen");
  });

  it("ignore ce qu'une adresse bricolée à la main voudrait injecter", () => {
    const sale = new URLSearchParams(
      "cat=colliers&age=<script>,senior&taille=inconnu&prix=gratuit&ta=XXL&stock=oui&mp=1"
    );
    const lu = depuisParams(sale);
    expect(lu.ages).toEqual(["senior"]);
    expect(lu.tailles_chien).toEqual([]);
    expect(lu.prix).toEqual([]);
    expect(lu.tailles_article).toEqual([]);
    // « oui » n'est pas « 1 » : la bascule reste au repos.
    expect(lu.en_stock).toBe(false);
    expect(lu.monoproteine).toBe(true);
    // La catégorie est recopiée telle quelle, mais elle ne sert qu'à comparer
    // : une catégorie inconnue ne rend simplement aucun article.
    expect(filtrer(CATALOGUE, depuisParams(new URLSearchParams("cat=<img>")))).toEqual([]);
  });

  it("range les étiquettes dans l'ordre du vocabulaire, pas dans celui de l'URL", () => {
    expect(depuisParams(new URLSearchParams("age=senior,chiot")).ages).toEqual(["chiot", "senior"]);
  });

  it("met les couleurs en minuscules — elles sont stockées ainsi", () => {
    expect(depuisParams(new URLSearchParams("couleur=NOIR,Rouge")).couleurs)
      .toEqual(["noir", "rouge"]);
  });
});
