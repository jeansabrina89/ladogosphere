import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import AlerteFormulaire, { marqueChamp, marqueChampClasse } from "@/app/components/AlerteFormulaire";

// JSX volontairement évité : la configuration vitest ne prend que les .ts.
const rendre = (etat: Parameters<typeof AlerteFormulaire>[0]["etat"]) =>
  renderToStaticMarkup(createElement(AlerteFormulaire, { etat }));

const style = { border: "1px solid rgba(27,43,94,0.2)", borderRadius: 12 };

describe("AlerteFormulaire", () => {
  it("n’affiche rien tant qu’il n’y a pas de refus", () => {
    expect(rendre({ erreur: null })).toBe("");
  });

  it("affiche le message en rouge, annoncé aux lecteurs d’écran", () => {
    const html = rendre({ erreur: "Le sexe doit être « Mâle » ou « Femelle ».", champ: "sexe" });
    expect(html).toContain("Le sexe doit être « Mâle » ou « Femelle ».");
    expect(html).toContain(`role="alert"`);
    expect(html).toContain(`aria-live="assertive"`);
    // Rose de refus et texte grenat, comme ailleurs dans l’application.
    expect(html).toContain("#FDECEC");
    expect(html).toContain("#8A1F1F");
  });
});

describe("marqueChamp", () => {
  const etat = { erreur: "Le poids doit être compris entre 0.5 et 120 kg.", champ: "poids" };

  it("donne au champ son id et son nom", () => {
    const a = marqueChamp(etat, "nom", style);
    expect(a.id).toBe("nom");
    expect(a.name).toBe("nom");
  });

  it("marque le champ fautif : bordure grenat et aria-invalid", () => {
    const a = marqueChamp(etat, "poids", style);
    expect(a["aria-invalid"]).toBe(true);
    expect(a.style.border).toBe("1px solid #A8453A");
    expect(a.style.backgroundColor).toBe("#FFF7F7");
    // Le reste du style d’origine est conservé.
    expect(a.style.borderRadius).toBe(12);
  });

  it("laisse les autres champs intacts", () => {
    const a = marqueChamp(etat, "nom", style);
    expect(a["aria-invalid"]).toBeUndefined();
    expect(a.style).toEqual(style);
  });

  it("ne marque rien quand il n’y a pas d’erreur", () => {
    const a = marqueChamp({ erreur: null, champ: "poids" }, "poids", style);
    expect(a["aria-invalid"]).toBeUndefined();
  });

  it("variante en classes : même règle", () => {
    const fautif = marqueChampClasse(etat, "poids", "w-full border");
    expect(fautif["aria-invalid"]).toBe(true);
    expect(fautif.className).toContain("border-[#A8453A]");

    const sain = marqueChampClasse(etat, "nom", "w-full border");
    expect(sain["aria-invalid"]).toBeUndefined();
    expect(sain.className).toBe("w-full border");
  });
});
