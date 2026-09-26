// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "./setup/attenteJsdom";
import FiltresCatalogue from "@/app/(public)/catalogue/FiltresCatalogue";
import {
  FILTRES_VIDES,
  filtresAffiches,
  type ArticleFiltrable,
  type Filtres,
} from "@/src/lib/filtresCatalogueLogique";

/**
 * Le panneau de filtres, à l'écran.
 *
 * Sur téléphone, un panneau posé au-dessus de la grille pousse les articles
 * hors de l'écran : le bouton « Filtrer (n) » ouvre la même liste en plein
 * écran, et on la referme sur un résultat annoncé — « Voir les 2 articles » —
 * plutôt qu'à l'aveugle.
 */

afterEach(cleanup);

const article = (p: Partial<ArticleFiltrable> & { id: string }): ArticleFiltrable => ({
  nom: p.id, marque: null, categorie: "colliers", type_article: "standard",
  prix_vente: 20, prix_final: 20, en_stock: true, expediable: true,
  ages: [], besoins: [], tailles_chien: [], proteines: [], couleurs: [],
  matieres: [], usages_jouet: [], sans_cereales: false, monoproteine: false,
  taille_article: null, ...p,
});

const ARTICLES = [
  article({ id: "a", tailles_chien: ["petit"], matieres: ["cuir"] }),
  article({ id: "b", tailles_chien: ["petit", "grand"], matieres: ["nylon"] }),
  article({ id: "c", categorie: "jouets", tailles_chien: ["grand"] }),
];

function Panneau({ depart = FILTRES_VIDES }: { depart?: Filtres }) {
  const affiches = filtresAffiches(ARTICLES, depart);
  const retenus = ARTICLES.length;
  return (
    <FiltresCatalogue
      filtres={depart}
      affiches={affiches}
      nombreResultats={retenus}
      surChangement={() => {}}
    />
  );
}

describe("les valeurs proposées", () => {
  it("annoncent chacune leur nombre d'articles", () => {
    render(<Panneau />);
    // Deux pastilles portent le même libellé (téléphone et écran large) :
    // c'est le même panneau, montré deux fois, et une seule est visible.
    expect(screen.getAllByRole("button", { name: /^Petit \(2\)$/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /^Grand \(2\)$/ }).length).toBeGreaterThan(0);
  });

  it("disent ce qui est coché, pour un lecteur d'écran comme pour l'œil", () => {
    render(<Panneau depart={{ ...FILTRES_VIDES, tailles_chien: ["petit"] }} />);
    const [pastille] = screen.getAllByRole("button", { name: /^Petit/ });
    expect(pastille.getAttribute("aria-pressed")).toBe("true");
    const [autre] = screen.getAllByRole("button", { name: /^Grand/ });
    expect(autre.getAttribute("aria-pressed")).toBe("false");
  });
});

describe("le panneau du téléphone", () => {
  it("compte les filtres actifs sur le bouton", () => {
    render(<Panneau />);
    expect(screen.getByRole("button", { name: "⚙️ Filtrer" })).toBeTruthy();
    cleanup();
    render(<Panneau depart={{ ...FILTRES_VIDES, categorie: "colliers", tailles_chien: ["petit"] }} />);
    expect(screen.getByRole("button", { name: "⚙️ Filtrer (2)" })).toBeTruthy();
  });

  it("s'ouvre en plein écran, et se referme sur un résultat annoncé", () => {
    render(<Panneau />);
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "⚙️ Filtrer" }));
    const dialogue = screen.getByRole("dialog", { name: "Filtrer les articles" });
    expect(dialogue.getAttribute("aria-modal")).toBe("true");
    expect(screen.getByRole("button", { name: "Voir les 3 articles" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Voir les 3 articles" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("« Tout effacer » n'apparaît que s'il y a quelque chose à effacer", () => {
    render(<Panneau />);
    expect(screen.queryByRole("button", { name: "Tout effacer" })).toBeNull();
    cleanup();

    const efface = vi.fn();
    render(
      <FiltresCatalogue
        filtres={{ ...FILTRES_VIDES, tailles_chien: ["petit"] }}
        affiches={filtresAffiches(ARTICLES, { ...FILTRES_VIDES, tailles_chien: ["petit"] })}
        nombreResultats={2}
        surChangement={efface}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Tout effacer" }));
    expect(efface).toHaveBeenCalledWith(FILTRES_VIDES);
  });

  it("le pied de page reste atteignable : la liste défile, lui non", () => {
    render(<Panneau />);
    fireEvent.click(screen.getByRole("button", { name: "⚙️ Filtrer" }));
    const dialogue = screen.getByRole("dialog");
    // Le conteneur des groupes est celui qui défile.
    const defilant = [...dialogue.querySelectorAll("div")].find(
      (d) => (d as HTMLElement).style.overflowY === "auto"
    );
    expect(defilant).toBeTruthy();
    expect(dialogue.style.position).toBe("fixed");
  });
});

describe("cliquer une valeur", () => {
  it("coche, et laisse la logique décider du reste", () => {
    const vu: Filtres[] = [];
    render(
      <FiltresCatalogue
        filtres={FILTRES_VIDES}
        affiches={filtresAffiches(ARTICLES, FILTRES_VIDES)}
        nombreResultats={3}
        surChangement={(f) => vu.push(f)}
      />
    );
    fireEvent.click(screen.getAllByRole("button", { name: /^Petit/ })[0]);
    expect(vu.at(-1)!.tailles_chien).toEqual(["petit"]);
  });

  it("changer de rayon abandonne les filtres propres à l'ancien", () => {
    const vu: Filtres[] = [];
    const depart: Filtres = { ...FILTRES_VIDES, categorie: "colliers", matieres: ["cuir"] };
    render(
      <FiltresCatalogue
        filtres={depart}
        affiches={filtresAffiches(ARTICLES, depart)}
        nombreResultats={1}
        surChangement={(f) => vu.push(f)}
      />
    );
    fireEvent.click(screen.getAllByRole("button", { name: /^Jouets/ })[0]);
    // Sans quoi « cuir » continuerait de restreindre un rayon de jouets, en
    // silence, et le client ne verrait plus rien sans comprendre pourquoi.
    expect(vu.at(-1)).toMatchObject({ categorie: "jouets", matieres: [] });
  });
});
