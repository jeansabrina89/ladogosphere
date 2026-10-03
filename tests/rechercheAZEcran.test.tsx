// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "./setup/attenteJsdom"; // quatre secondes d'attente, pas une
import RechercheAZ, { type ElementRecherche } from "@/app/components/RechercheAZ";

/**
 * APP 73 — la barre et les lettres, rendues. On tape, on clique, on lit
 * l'adresse et les liens vers les fiches.
 */

const el = (id: string, nom: string, extra: Partial<ElementRecherche> = {}): ElementRecherche => ({
  id, cleLettre: nom, tri: nom, textes: [nom], carte: <span>{nom}</span>, ...extra,
});
const ELEMENTS = [
  el("1", "Max", { textes: ["Max", "Labrador", "Élodie", "Martin"], drapeaux: ["attente"] }),
  el("2", "Rex", { textes: ["Rex", "Berger", "Paul", "Zürcher"] }),
  el("3", "Mila", { textes: ["Mila", "Caniche", "Anne", "Abel"] }),
];

function monter(initial = { lettre: null as string | null, q: "", filtre: null as string | null }) {
  return render(
    <RechercheAZ base="/chiens" elements={ELEMENTS} initial={initial} singulier="chien" pluriel="chiens"
      placeholder="Chercher"
      filtre={{ cle: "attente", encadre: (n) => `${n} chien(s) en attente de validation`, bouton: "Voir lesquels", actif: "Voir tous" }} />,
  );
}
const noms = () => screen.queryAllByRole("link").map((a) => a.textContent);

beforeEach(() => window.history.replaceState(null, "", "/chiens"));
afterEach(() => cleanup());

describe("la barre filtre pendant la frappe", () => {
  it("tri alphabétique, compte, et recherche sans accent", () => {
    monter();
    expect(noms()).toEqual(["Max", "Mila", "Rex"]);
    expect(screen.getByText("3 chiens")).toBeTruthy();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "elodie" } });
    expect(noms()).toEqual(["Max"]);
    expect(screen.getByText("1 chien")).toBeTruthy();
    expect(window.location.search).toBe("?q=elodie");
  });

  it("état vide clair, et « Effacer la recherche »", () => {
    monter();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "xyz" } });
    expect(screen.getByText("Aucun chien ne correspond à “xyz”.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Effacer la recherche" }));
    expect(noms()).toHaveLength(3);
    expect(window.location.search).toBe("");
  });
});

describe("les lettres", () => {
  it("une lettre sans fiche est inactive", () => {
    monter();
    const b = screen.getByRole("button", { name: "B — aucune fiche" }) as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Lettre M" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("lettre et recherche combinées, reflétées dans l'adresse", () => {
    monter();
    fireEvent.click(screen.getByRole("button", { name: "Lettre M" }));
    expect(noms()).toEqual(["Max", "Mila"]);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "caniche" } });
    expect(noms()).toEqual(["Mila"]);
    expect(window.location.search).toBe("?lettre=M&q=caniche");
  });

  it("chaque fiche reçoit l'état, pour que « ← Retour » ramène ici", () => {
    monter({ lettre: "M", q: "max", filtre: null });
    const lien = screen.getByRole("link") as HTMLAnchorElement;
    expect(lien.getAttribute("href")).toBe(`/chiens/1?retour=${encodeURIComponent("lettre=M&q=max")}`);
  });
});

describe("l'encadré des chiens à valider", () => {
  it("annonce le compte et applique le filtre", () => {
    monter();
    expect(screen.getByText("1 chien(s) en attente de validation")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Voir lesquels" }));
    expect(noms()).toEqual(["Max"]);
    expect(window.location.search).toBe("?filtre=attente");
  });
});
