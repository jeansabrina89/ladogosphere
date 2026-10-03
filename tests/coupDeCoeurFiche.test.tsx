// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "./setup/attenteJsdom";
import { AIDE_COUP_DE_COEUR } from "@/src/lib/coupsDeCoeurLogique";

/**
 * APP 62 — la case « ❤️ Coup de cœur du moment » sur la fiche article.
 *
 * Ce fichier garde ce que Sabrina VOIT : la case, sa phrase d'aide, et l'état
 * relu de la fiche. Ce que la case ÉCRIT (colonne et journal) est gardé par
 * `coupDeCoeurEnregistrement.test.ts`, qui appelle l'action elle-même.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
vi.mock("@/app/(admin)/boutique/actions", () => ({
  enregistrerArticle: async () => ({}),
  supprimerArticle: async () => ({}),
}));

const FormArticle = (await import("@/app/(admin)/boutique/articles/FormArticle")).default;

afterEach(cleanup);

function afficher(article?: Record<string, unknown>, perimetre?: "atelier") {
  return render(
    <FormArticle
      fournisseurs={[]}
      tauxLegaux={[2.6, 8.1]}
      article={(article ? { animaux: ["chien"], ...article } : undefined) as never}
      {...(perimetre ? { perimetre } : {})}
    />
  );
}

const laCase = () => screen.getByLabelText(/Coup de cœur du moment/) as HTMLInputElement;

describe("la case « Coup de cœur du moment »", () => {
  it("est sur la fiche, avec l'aide écrite par Sabrina", () => {
    afficher();
    expect(laCase().type).toBe("checkbox");
    expect(screen.getByText(AIDE_COUP_DE_COEUR)).toBeTruthy();
    expect(AIDE_COUP_DE_COEUR).toBe(
      "Mis en avant en haut de la boutique en ligne. 4 à 8 articles, c'est l'idéal."
    );
  });

  it("est vide pour un nouvel article", () => {
    afficher();
    expect(laCase().checked).toBe(false);
  });

  it("relit l'état de la fiche : cochée si l'article est un coup de cœur", () => {
    afficher({ id: "a-1", nom: "Bozita", coup_de_coeur: true });
    expect(laCase().checked).toBe(true);
  });

  it("porte le marqueur qui dit à l'action que la case a été MONTRÉE", () => {
    // Sans lui, l'action ne touche pas la colonne : une fiche d'atelier, qui
    // n'a pas la case, ne doit pas effacer un coup de cœur en s'enregistrant.
    const { container } = afficher();
    const marqueur = container.querySelector('input[name="coup_de_coeur_montre"]') as HTMLInputElement;
    expect(marqueur?.value).toBe("1");
  });

  it("n'existe pas sur une fiche d'atelier, marqueur compris", () => {
    // Une fourniture ne se vend pas seule : elle n'a rien à faire en vitrine.
    const { container } = afficher(undefined, "atelier");
    expect(screen.queryByLabelText(/Coup de cœur du moment/)).toBeNull();
    expect(container.querySelector('input[name="coup_de_coeur_montre"]')).toBeNull();
  });
});
