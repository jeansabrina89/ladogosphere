// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
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

const barre = () => screen.queryByRole("navigation", { name: "Choisir un animal" });
const onglet = (nom: string) => screen.getByRole("button", { name: new RegExp(`^${nom}`) });

describe("aucun onglet tant qu'un seul animal est servi", () => {
  it("la boutique du jour de l'ouverture n'a AUCUN onglet", () => {
    // Tout est pour chiens : une rangée d'onglets ne mènerait qu'à un endroit,
    // et ferait croire qu'il y a autre chose à voir.
    afficher([art("a", ["chien"]), art("b", ["chien"])]);
    expect(barre()).toBeNull();
  });

  it("une boutique vide non plus", () => {
    afficher([]);
    expect(barre()).toBeNull();
  });
});

describe("les onglets apparaissent et disparaissent avec les articles", () => {
  it("un article pour rongeurs fait apparaître la barre, « Tous » compris", () => {
    afficher([art("a", ["chien"]), art("b", ["rongeur"])]);
    const nav = barre();
    expect(nav).toBeTruthy();
    expect(nav?.textContent).toContain("Tous");
    expect(nav?.textContent).toContain("Chiens");
    expect(nav?.textContent).toContain("Rongeurs");
  });

  it("aucun onglet n'est rendu pour un animal sans article", () => {
    afficher([art("a", ["chien"]), art("b", ["rongeur"])]);
    const nav = barre();
    for (const absent of ["Chats", "Furets", "Reptiles", "Oiseaux"]) {
      expect(nav?.textContent, absent).not.toContain(absent);
    }
  });

  it("chaque onglet annonce son nombre, et jamais zéro", () => {
    afficher([art("a", ["chien"]), art("b", ["chien"]), art("c", ["rongeur"])]);
    expect(onglet("Chiens").textContent).toContain("(2)");
    expect(onglet("Rongeurs").textContent).toContain("(1)");
    // « Tous » compte les ARTICLES, pas les animaux.
    expect(onglet("Tous").textContent).toContain("(3)");
  });

  it("retirer le dernier article d'un animal retire son onglet", () => {
    // Le même rendu, un article de moins : la barre disparaît entièrement,
    // puisqu'il ne reste qu'un animal.
    const { unmount } = afficher([art("a", ["chien"]), art("b", ["rongeur"])]);
    expect(barre()).toBeTruthy();
    unmount();
    afficher([art("a", ["chien"])]);
    expect(barre()).toBeNull();
  });
});

describe("l'onglet choisi, et la grille qu'il montre", () => {
  it("un onglet actif est marqué, et lui seul", () => {
    adresse.valeur = "animal=rongeur";
    afficher([art("a", ["chien"]), art("b", ["rongeur"])]);
    expect(onglet("Rongeurs").getAttribute("aria-pressed")).toBe("true");
    expect(onglet("Chiens").getAttribute("aria-pressed")).toBe("false");
    expect(onglet("Tous").getAttribute("aria-pressed")).toBe("false");
  });

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

  it("un lien vers un onglet vide ramène à « Tous », sans page blanche", () => {
    /**
     * Un signet vers « Furets » alors qu'aucun article ne l'est. La cliente doit
     * voir la boutique — pas un message d'erreur, et surtout pas une grille vide
     * qui laisserait croire que tout a disparu.
     */
    adresse.valeur = "animal=furet";
    afficher([art("a", ["chien"]), art("b", ["rongeur"])]);
    expect(screen.queryByText("Article a")).toBeTruthy();
    expect(screen.queryByText("Article b")).toBeTruthy();
    expect(onglet("Tous").getAttribute("aria-pressed")).toBe("true");
  });

  it("un animal inventé dans l'adresse est ignoré, pas servi", () => {
    adresse.valeur = "animal=licorne";
    afficher([art("a", ["chien"]), art("b", ["rongeur"])]);
    expect(screen.queryByText("Article a")).toBeTruthy();
    expect(onglet("Tous").getAttribute("aria-pressed")).toBe("true");
  });

  it("cliquer un onglet met l'adresse à jour", () => {
    const pousse: string[] = [];
    const vrai = window.history.pushState.bind(window.history);
    window.history.pushState = ((...a: unknown[]) => {
      pousse.push(String(a[2]));
      return vrai(a[0] as never, a[1] as never, a[2] as never);
    }) as typeof window.history.pushState;

    afficher([art("a", ["chien"]), art("b", ["rongeur"])]);
    fireEvent.click(onglet("Rongeurs"));
    expect(pousse.at(-1)).toContain("animal=rongeur");

    window.history.pushState = vrai;
  });
});

describe("ce qui rend le défilement possible sur téléphone", () => {
  it("la barre défile, et les onglets ne se compriment pas", () => {
    /**
     * jsdom ne met rien en page : on ne peut pas mesurer 375 px ici. Ce qui est
     * vérifié, c'est la paire de propriétés qui fait la différence — sans
     * `flexShrink: 0`, les sept onglets se compriment au lieu de défiler, et la
     * page prend une barre horizontale au lieu de la barre elle-même.
     *
     * La vérification visuelle reste à faire dans un navigateur.
     */
    afficher([art("a", ["chien"]), art("b", ["rongeur"])]);
    const nav = barre()!;
    expect(nav.style.overflowX).toBe("auto");
    expect(nav.style.display).toBe("flex");
    for (const bouton of Array.from(nav.querySelectorAll("button"))) {
      expect((bouton as HTMLElement).style.flexShrink).toBe("0");
      // Un libellé coupé en deux lignes casserait la hauteur de la barre.
      expect((bouton as HTMLElement).style.whiteSpace).toBe("nowrap");
    }
  });

  it("la barre est une navigation NOMMÉE : on sait à quoi elle sert", () => {
    // Sept boutons sans étiquette de groupe ne disent rien à un lecteur d'écran.
    afficher([art("a", ["chien"]), art("b", ["rongeur"])]);
    expect(barre()?.getAttribute("aria-label")).toBe("Choisir un animal");
  });

  it("la règle des onglets n'est pas réécrite dans l'écran", () => {
    const src = readFileSync(
      join(__dirname, "..", "app/(public)/catalogue/CatalogueBoutique.tsx"), "utf8");
    expect(src).toContain("ongletsAnimaux");
    expect(src).toContain("ongletRetenu");
    // L'écran ne compte pas les articles par animal de son côté.
    expect(src).not.toMatch(/animaux\s*\)\s*\.\s*length\s*>\s*0/);
  });
});
