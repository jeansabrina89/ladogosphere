// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";

/**
 * Ententes, quand le réseau lâche.
 *
 * Trois choses à prouver, et ce sont celles qui comptent pour la personne
 * devant l'écran : une phrase s'affiche, l'attente retombe (le bouton
 * redevient cliquable), et ce qui était déjà affiché reste affiché.
 *
 * L'environnement jsdom est déclaré EN TÊTE DE CE FICHIER : les autres tests
 * restent en environnement node, plus rapide.
 */

const H = vi.hoisted(() => ({ traces: [] as { message: string; contexte: unknown }[] }));

vi.mock("@sentry/nextjs", () => ({
  captureMessage: (message: string, contexte: unknown) => H.traces.push({ message, contexte }),
  captureException: () => {},
}));

import Ententes from "@/app/(admin)/(espace-clients)/chiens/[id]/Ententes";
import { MESSAGE_RESEAU } from "@/src/lib/reseau";

const CHIEN = "11111111-1111-4111-8111-111111111111";
const CIBLE = "22222222-2222-4222-8222-222222222222";
const LIBRE = "33333333-3333-4333-8333-333333333333";

const TOUS_CHIENS = [
  { id: CHIEN, nom: "Pixel", race: "Berger" },
  { id: CIBLE, nom: "Nala", race: "Labrador" },
  // Un chien encore libre : sans lui, le formulaire d'ajout ne s'affiche pas.
  { id: LIBRE, nom: "Filou", race: "Bouvier" },
];

/** Ce que l'API rend quand tout va bien : une entente déjà enregistrée. */
const LISTE = {
  ententes: [
    { id: "e1", chien_cible_id: CIBLE, type: "ok", note: "", chien_cible: { nom: "Nala", race: "Labrador" } },
  ],
  famille_uniquement: false,
};

const reponse = (corps: unknown, statut = 200) =>
  new Response(JSON.stringify(corps), { status: statut, headers: { "content-type": "application/json" } });

function afficher() {
  return render(
    <Ententes chien_id={CHIEN} tous_chiens={TOUS_CHIENS} perm_chiens_modifier />,
  );
}

beforeEach(() => {
  H.traces.length = 0;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Ententes : le premier chargement échoue", () => {
  it("dit ce qui ne va pas, propose de réessayer, et n'invente rien", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    afficher();

    // 1. Une phrase, en français, sans code ni jargon.
    const alerte = await screen.findByRole("alert");
    expect(alerte.textContent).toContain(MESSAGE_RESEAU);
    expect(alerte.textContent).not.toMatch(/fetch|TypeError|\d{3}/);

    // 2. L'écran est utilisable : le bouton « Réessayer » est là et actif.
    const reessayer = screen.getByRole("button", { name: /Réessayer/i });
    expect(reessayer.hasAttribute("disabled")).toBe(false);

    // 3. La trace est partie, sans rien de personnel.
    expect(H.traces).toHaveLength(1);
    expect(H.traces[0].contexte).toMatchObject({ level: "error", tags: { endroit: "Ententes.charger" } });
    expect(JSON.stringify(H.traces)).not.toContain("Pixel");
  });

  it("« Réessayer » recharge vraiment, et la liste apparaît", async () => {
    const fetchSimule = vi.fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValue(reponse(LISTE));
    vi.stubGlobal("fetch", fetchSimule);
    afficher();

    const reessayer = await screen.findByRole("button", { name: /Réessayer/i });
    reessayer.click();

    await waitFor(() => expect(screen.queryAllByText(/Nala/).length).toBeGreaterThan(0));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("Ententes : la liste est affichée, puis le réseau tombe", () => {
  it("l'ajout échoue : message, bouton réactivé, et la liste reste à l'écran", async () => {
    const fetchSimule = vi.fn()
      .mockResolvedValueOnce(reponse(LISTE))          // le chargement initial
      .mockRejectedValue(new TypeError("Failed to fetch")); // puis tout tombe
    vi.stubGlobal("fetch", fetchSimule);
    afficher();

    // La liste est là avant la panne.
    await waitFor(() => expect(screen.queryAllByText(/Nala/).length).toBeGreaterThan(0));

    // On choisit un chien et on ajoute : l'appel part, et échoue.
    // La première liste déroulante est celle des chiens.
    const listeDeroulante = screen.getAllByRole("combobox")[0];
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.change(listeDeroulante, { target: { value: LIBRE } });
    const ajouter = screen.getByRole("button", { name: /Ajouter/i });
    fireEvent.click(ajouter);

    // 1. Le message.
    const alerte = await screen.findByRole("alert");
    expect(alerte.textContent).toContain(MESSAGE_RESEAU);

    // 2. L'attente est retombée : le bouton est de nouveau cliquable.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Ajouter/i }).hasAttribute("disabled")).toBe(false));

    // 3. Ce qui était affiché l'est toujours.
    expect(screen.queryAllByText(/Nala/).length).toBeGreaterThan(0);
  });
});
