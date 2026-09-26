// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "./setup/attenteJsdom";
import EtiquettesArticle from "@/app/components/stock/EtiquettesArticle";
import { etiquettesDepuisChamps } from "@/src/lib/etiquettesArticles";

/**
 * La section « Étiquettes pour les filtres » de la fiche article.
 *
 * Ce qui compte ici : ce qui PART à l'enregistrement. Les pastilles sont
 * agréables, mais le défaut qui coûte cher serait d'effacer en silence les
 * étiquettes qu'une catégorie ne montre pas — un article mal classé, reclassé
 * le lendemain, aurait perdu ce qu'on avait mis vingt minutes à saisir.
 */

afterEach(cleanup);

/** Ce que le formulaire enverrait : les champs cachés et les cases. */
function champsEnvoyes(conteneur: HTMLElement): Record<string, string> {
  const champs: Record<string, string> = {};
  for (const el of conteneur.querySelectorAll("input")) {
    const input = el as HTMLInputElement;
    if (!input.name) continue;
    if (input.type === "checkbox") {
      // Une case décochée n'entre pas dans un FormData.
      if (input.checked) champs[input.name] = "on";
    } else {
      champs[input.name] = input.value;
    }
  }
  return champs;
}

describe("ce que la catégorie montre", () => {
  it("l'alimentation demande la composition, jamais la couleur", () => {
    render(<EtiquettesArticle categorie="alimentation_seche" />);
    expect(screen.getByRole("button", { name: "Chiot" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Saumon" })).toBeTruthy();
    expect(screen.getByLabelText("Sans céréales")).toBeTruthy();
    expect(screen.queryByLabelText("Ajouter une couleur")).toBeNull();
    expect(screen.queryByRole("button", { name: "Cuir" })).toBeNull();
  });

  it("un collier demande la taille, la couleur et la matière, jamais la protéine", () => {
    render(<EtiquettesArticle categorie="colliers" />);
    expect(screen.getByRole("button", { name: "Biothane" })).toBeTruthy();
    expect(screen.getByLabelText("Ajouter une couleur")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Taille unique" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Saumon" })).toBeNull();
    expect(screen.queryByLabelText("Sans céréales")).toBeNull();
  });

  it("un jouet demande l'usage", () => {
    render(<EtiquettesArticle categorie="jouets" />);
    expect(screen.getByRole("button", { name: "À mâcher" })).toBeTruthy();
  });
});

describe("cliquer une pastille", () => {
  it("coche, décoche, et part dans le champ caché", () => {
    const { container } = render(<EtiquettesArticle categorie="friandises" />);
    expect(champsEnvoyes(container).ages).toBe("");

    fireEvent.click(screen.getByRole("button", { name: "Senior" }));
    fireEvent.click(screen.getByRole("button", { name: "Chiot" }));
    expect(champsEnvoyes(container).ages).toBe("senior,chiot");
    expect(screen.getByRole("button", { name: "Senior" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Senior" }));
    expect(champsEnvoyes(container).ages).toBe("chiot");
  });

  it("la taille de l'article est un choix UNIQUE, et se reprend", () => {
    const { container } = render(<EtiquettesArticle categorie="colliers" />);
    fireEvent.click(screen.getByRole("button", { name: "M" }));
    expect(champsEnvoyes(container).taille_article).toBe("M");
    // Une autre taille remplace, elle ne s'ajoute pas.
    fireEvent.click(screen.getByRole("button", { name: "L" }));
    expect(champsEnvoyes(container).taille_article).toBe("L");
    // Recliquer la taille cochée l'enlève.
    fireEvent.click(screen.getByRole("button", { name: "L" }));
    expect(champsEnvoyes(container).taille_article).toBe("");
  });

  it("une couleur libre s'ajoute normalisée, et ne rentre pas deux fois", () => {
    const { container } = render(<EtiquettesArticle categorie="laisses" />);
    const champ = screen.getByLabelText("Ajouter une couleur");

    fireEvent.change(champ, { target: { value: "  Bleu   Marine " } });
    fireEvent.click(screen.getByRole("button", { name: "+ Ajouter" }));
    expect(champsEnvoyes(container).couleurs).toBe("bleu marine");

    fireEvent.change(champ, { target: { value: "BLEU MARINE" } });
    fireEvent.click(screen.getByRole("button", { name: "+ Ajouter" }));
    expect(champsEnvoyes(container).couleurs).toBe("bleu marine");

    // La virgule sépare les valeurs : elle ne peut pas entrer dans l'une d'elles.
    fireEvent.change(champ, { target: { value: "rouge, vert" } });
    fireEvent.click(screen.getByRole("button", { name: "+ Ajouter" }));
    expect(champsEnvoyes(container).couleurs).toBe("bleu marine,rouge vert");
  });
});

describe("on masque, on n'efface pas", () => {
  it("les étiquettes hors catégorie partent quand même, à leur valeur actuelle", () => {
    // Un article saisi en friandises puis reclassé en colliers : ses
    // protéines ne se montrent plus, mais elles ne disparaissent pas.
    const { container } = render(
      <EtiquettesArticle
        categorie="colliers"
        article={{
          proteines: ["saumon"],
          ages: ["chiot"],
          sans_cereales: true,
          matieres: ["cuir"],
        }}
      />
    );
    expect(screen.queryByRole("button", { name: "Saumon" })).toBeNull();

    const envoyes = champsEnvoyes(container);
    expect(envoyes.proteines).toBe("saumon");
    expect(envoyes.ages).toBe("chiot");
    // La case masquée part en champ caché, à « on ».
    expect(envoyes.sans_cereales).toBe("on");
    // Et ce qui est montré reste modifiable.
    expect(envoyes.matieres).toBe("cuir");

    // Ce que l'action écrirait : tout est conservé.
    expect(etiquettesDepuisChamps(envoyes)).toMatchObject({
      proteines: ["saumon"],
      ages: ["chiot"],
      sans_cereales: true,
      matieres: ["cuir"],
    });
  });

  it("pose le marqueur, sans lequel l'action ne touche à rien", () => {
    const { container } = render(<EtiquettesArticle categorie="divers" />);
    expect(champsEnvoyes(container).etiquettes).toBe("1");
  });
});

describe("l'écriture côté serveur", () => {
  const source = (chemin: string) => readFileSync(join(__dirname, "..", chemin), "utf8");

  it("n'écrit les étiquettes QUE si le formulaire les a montrées", () => {
    const action = source("app/(admin)/boutique/actions.ts");
    expect(action).toContain(`formData.get(MARQUEUR_ETIQUETTES) === "1"`);
    expect(action).toContain("etiquettesDepuisChamps(valeurs)");
    // Sans marqueur : un objet vide, donc aucune colonne touchée.
    expect(action).toMatch(/\?\s*\{ \.\.\.etiquettesDepuisChamps\(valeurs\) \}\s*:\s*\{\}/);
  });

  it("la fourniture d'atelier n'a pas de section d'étiquettes", () => {
    const formulaire = source("app/(admin)/boutique/articles/FormArticle.tsx");
    expect(formulaire).toMatch(/\{!atelier && \(\s*<EtiquettesArticle/);
  });

  it("la liste des articles sait montrer ce qui reste à compléter", () => {
    expect(source("app/components/stock/FiltresArticles.tsx")).toContain(
      `if (filtrePoids && (sur?.sansEtiquettes ?? sansEtiquettes)) p.set("sansetiquettes", "1");`
    );
    expect(source("app/(admin)/boutique/articles/page.tsx")).toContain(
      "if (seulementSansEtiquettes && !sansEtiquettes(a)) return false;"
    );
  });
});
