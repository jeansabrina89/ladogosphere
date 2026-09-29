// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "./setup/attenteJsdom";

/**
 * Les onglets d'animal, à l'écran (APP 27).
 *
 * Ce que ce fichier garde : la règle de Sabrina vue par la cliente. Un onglet
 * n'apparaît QUE s'il a des articles ; tant qu'un seul animal est servi, il n'y
 * a aucun onglet et la boutique reste exactement comme avant.
 *
 * Le rendu à 375 px ne se MESURE pas en jsdom — il n'y a pas de mise en page.
 * Ce qui est vérifié ici, c'est ce qui la rend possible : le conteneur défile
 * horizontalement, et les onglets ne se compriment pas. La vérification visuelle
 * reste à faire dans un navigateur, et elle est demandée dans le rapport.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
  useSearchParams: () => new URLSearchParams(adresse.valeur),
}));
vi.mock("@/app/(public)/catalogue/actions", () => ({
  ajouterAuPanier: async () => ({ message: "ajouté" }),
}));
vi.mock("@/app/(public)/catalogue/panierNavigateur", () => ({
  ajouter: () => {},
}));

/** L'adresse simulée : les onglets la lisent, comme les filtres. */
const adresse = { valeur: "" };

const CatalogueBoutique = (await import("@/app/(public)/catalogue/CatalogueBoutique")).default;

afterEach(() => {
  cleanup();
  adresse.valeur = "";
});

type Art = Parameters<typeof CatalogueBoutique>[0]["articles"][number];

function art(id: string, animaux: string[], reste: Partial<Art> = {}): Art {
  return {
    id, nom: `Article ${id}`, description: null, categorie: "alimentation_seche",
    marque: null, prix_vente: 20, prix_final: 20, remise_libelle: null,
    photo_path: null, type_article: "standard", delai_fabrication_jours: null,
    en_stock: true, animaux, especes: [], types_soin: [], ages: [], besoins: [],
    tailles_chien: [], gouts: [], proteines: [], couleurs: [], matieres: [],
    usages_jouet: [], sans_cereales: false, monoproteine: false, taille_article: null,
    ...reste,
  } as Art;
}

const afficher = (articles: Art[]) =>
  render(<CatalogueBoutique articles={articles} connecte={false} />);


describe("APP 49 : LA BARRE D'ONGLETS A DISPARU DU CATALOGUE CLIENT", () => {
  /**
   * Ce fichier gardait la barre d'onglets par animal (APP 27/31) : elle
   * n'existe plus. La boutique se parcourt maintenant par ENCADRÉS — un par
   * animal, puis un par rayon — et le fil d'Ariane dit où l'on est.
   *
   * Les règles que ces tests protégeaient n'ont pas disparu avec eux : elles
   * sont reprises une à une dans tests/niveauxCatalogue.test.ts — un encadré
   * n'apparaît qu'avec un article, annonce son nombre, un animal inventé ou
   * vide ramène au niveau 1, un article à deux animaux compte dans les deux.
   *
   * Ce qui reste ici est ce qui SURVIT à la barre : le filtrage par animal,
   * qui vient toujours de l'adresse, et les textes de l'écran.
   */
  it("le catalogue ne rend plus de rangée d'onglets", () => {
    const src = readFileSync(
      join(__dirname, "..", "app/(public)/catalogue/CatalogueBoutique.tsx"), "utf8");
    expect(src).not.toContain("<OngletsAnimaux");
    expect(src).not.toContain('aria-label="Choisir un animal"');
  });

  it("c'est le fil d'Ariane qui prend sa place", () => {
    const src = readFileSync(
      join(__dirname, "..", "app/(public)/catalogue/page.tsx"), "utf8");
    expect(src).toContain("<FilAriane");
  });
});

describe("l'onglet choisi, et la grille qu'il montre", () => {

  it("l'onglet ne montre QUE les articles de cet animal", () => {
    adresse.valeur = "animal=rongeur";
    afficher([art("a", ["chien"]), art("b", ["rongeur"])]);
    expect(screen.queryByText("Article b")).toBeTruthy();
    expect(screen.queryByText("Article a")).toBeNull();
  });

  it("un article pour deux animaux se voit dans CHACUN de leurs onglets", () => {
    const partage = art("p", ["chien", "chat"]);
    adresse.valeur = "animal=chat";
    const { unmount } = afficher([art("a", ["chien"]), partage]);
    expect(screen.queryByText("Article p")).toBeTruthy();
    unmount();
    adresse.valeur = "animal=chien";
    afficher([art("a", ["chien"]), partage]);
    expect(screen.queryByText("Article p")).toBeTruthy();
  });



});

describe("D.5 : les textes de la boutique et l'animal", () => {
  const src = (c: string) => readFileSync(join(__dirname, "..", c), "utf8");

  it("le sous-titre n'annonce plus « Croquettes » seules", () => {
    // La boutique sert six animaux : « Croquettes » ne dit plus ce qu'elle vend.
    const page = src("app/(public)/catalogue/page.tsx");
    expect(page).toContain("Alimentation, accessoires et pièces faites sur mesure");
    expect(page).not.toContain('sousTitre="Croquettes');
  });

  it("le sous-titre ne NOMME aucun animal : les onglets s'en chargent", () => {
    /**
     * Un sous-titre qui annoncerait « et petits animaux » le ferait aussi le jour
     * où il n'y en a aucun — la règle de Sabrina veut qu'on ne promette rien de
     * vide. Les onglets, eux, savent lesquels ont des articles.
     */
    const page = src("app/(public)/catalogue/page.tsx");
    const soustitre = page.match(/sousTitre="([^"]*)"/)?.[1] ?? "";
    for (const animal of ["chats", "rongeurs", "furets", "reptiles", "oiseaux"]) {
      expect(soustitre.toLowerCase(), animal).not.toContain(animal);
    }
  });

  it("« au départ de votre chien » RESTE, et c'est le mode de remise", async () => {
    /**
     * Ce n'est PAS une supposition sur l'animal de l'article : c'est la façon de
     * retirer sa commande — en venant chercher son chien à la pension. Le texte
     * est exact quel que soit l'article : une cliente qui a un chien en séjour et
     * un lapin à la maison retire bien la litière du lapin au départ du chien.
     *
     * Le remplacer par « votre animal » aurait rendu la phrase FAUSSE : la
     * pension ne garde que des chiens, et aucun lapin n'a de date de départ.
     */
    const { libelleModeRemise } = await import("@/src/lib/venteEnLigneLogique");
    expect(libelleModeRemise("depart_chien")).toBe("Remise au départ de votre chien");
  });
});
