// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "./setup/attenteJsdom";

/**
 * La fiche article : « Disponible sur commande », et l'avertissement qui la sauve.
 *
 * La règle nº 2 d'APP 26 — coché sans délai connu = pas commandable — est
 * appliquée en base, où elle ne peut pas être contournée. Mais appliquée en
 * silence, elle coûterait cher : Sabrina cocherait la case, croirait l'article
 * commandable, et découvrirait trois semaines plus tard que personne n'a pu
 * l'acheter. Rien ne le lui aurait dit.
 *
 * C'est cet avertissement que ce fichier garde. Il se lit sur la fiche, au
 * moment de la saisie, et il dit ce qui se passera VRAIMENT.
 *
 * Le décor est celui du lot 18g, qui avait cru devoir y renoncer : rendre
 * l'écran et ouvrir la section suffit.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
vi.mock("@/app/(admin)/boutique/actions", () => ({
  enregistrerArticle: async () => ({}),
  supprimerArticle: async () => ({}),
}));

const FormArticle = (await import("@/app/(admin)/boutique/articles/FormArticle")).default;

afterEach(cleanup);

const BOZITA = {
  id: "f-1", nom: "Bozita",
  delai_commande_min_jours: 5, delai_commande_max_jours: 8,
};
const SANS_DELAI = { id: "f-2", nom: "Fournisseur sans délai" };

/** L'écran, avec de quoi choisir un fournisseur. */
function afficher(article?: Record<string, unknown>) {
  return render(
    <FormArticle
      fournisseurs={[BOZITA, SANS_DELAI]}
      tauxLegaux={[{ categorie: "alimentation_seche", taux: 2.6 }]}
      article={article as never}
    />
  );
}

const caseSurCommande = () => screen.getByLabelText(/Disponible sur commande/);

describe("la case « Disponible sur commande »", () => {
  it("ne montre ni délai ni avertissement tant qu'elle n'est pas cochée", () => {
    afficher();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByLabelText(/Exception — au plus tard/)).toBeNull();
  });

  it("cochée SANS délai connu : l'avertissement le dit, en clair", () => {
    // Le cas qui coûte cher. Sans ce bandeau, la case paraît suffire.
    afficher();
    fireEvent.click(caseSurCommande());
    const alerte = screen.getByRole("alert");
    expect(alerte.textContent).toMatch(/aucun délai connu/i);
    expect(alerte.textContent, "elle doit savoir ce que la cliente verra")
      .toMatch(/Épuisé/);
  });

  it("le délai du fournisseur fait taire l'avertissement, et s'annonce", () => {
    afficher({ fournisseur_id: "f-1" });
    fireEvent.click(caseSurCommande());
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText(/Délai du fournisseur : 5 à 8 jours ouvrables/)).toBeTruthy();
  });

  it("un fournisseur sans délai le dit aussi, plutôt que de se taire", () => {
    afficher({ fournisseur_id: "f-2" });
    fireEvent.click(caseSurCommande());
    expect(screen.getByText(/n'a pas de délai de commande sur sa fiche/)).toBeTruthy();
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("changer de fournisseur remet l'avertissement à jour sur-le-champ", () => {
    // Sans état réactif, Sabrina choisirait Bozita et garderait un bandeau
    // faux sous les yeux — ou l'inverse, plus grave : aucun bandeau alors que
    // le nouveau fournisseur n'a pas de délai.
    afficher({ fournisseur_id: "f-1" });
    fireEvent.click(caseSurCommande());
    expect(screen.queryByRole("alert")).toBeNull();

    fireEvent.change(screen.getByLabelText("Fournisseur"), { target: { value: "f-2" } });
    expect(screen.getByRole("alert")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Fournisseur"), { target: { value: "f-1" } });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("une exception saisie sur l'article suffit, même sans fournisseur", () => {
    // Un article acheté chez un grossiste qui n'est pas au carnet : son délai
    // se saisit ici, et il compte.
    afficher();
    fireEvent.click(caseSurCommande());
    expect(screen.getByRole("alert")).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/Exception — au plus tard/), { target: { value: "12" } });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("une exception effacée fait revenir l'avertissement", () => {
    afficher({ disponible_sur_commande: true, delai_commande_max_jours: 12 });
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.change(screen.getByLabelText(/Exception — au plus tard/), { target: { value: "" } });
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("une fiche déjà cochée s'ouvre sur sa section, sans qu'on la rouvre", () => {
    afficher({ disponible_sur_commande: true, fournisseur_id: "f-1" });
    expect((caseSurCommande() as HTMLInputElement).checked).toBe(true);
    expect(screen.getByLabelText(/Exception — au plus tard/)).toBeTruthy();
  });
});

describe("ce que l'action serveur écrit", () => {
  it("les trois colonnes partent, et le délai vide vaut NULL", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(join(__dirname, "..", "app/(admin)/boutique/actions.ts"), "utf8");
    expect(src).toContain(`disponible_sur_commande: formData.get("disponible_sur_commande") === "on"`);
    // `joursOuNull` et non `lireNombre` : un champ vide doit rendre NULL, pas
    // zéro. Zéro promettrait une livraison le jour même.
    expect(src).toContain(`delai_commande_min_jours: joursOuNull(`);
    expect(src).toContain(`delai_commande_max_jours: joursOuNull(`);
  });

  it("`joursOuNull` distingue le vide du zéro", async () => {
    const { joursOuNull } = await import("@/src/lib/boutiqueLogique");
    expect(joursOuNull("")).toBeNull();
    expect(joursOuNull(null)).toBeNull();
    expect(joursOuNull("pas un nombre")).toBeNull();
    expect(joursOuNull("-3"), "un délai négatif n'existe pas").toBeNull();
    expect(joursOuNull("0")).toBe(0);
    expect(joursOuNull("8")).toBe(8);
    expect(joursOuNull("7,6"), "arrondi, comme un délai en jours entiers").toBe(8);
  });
});
