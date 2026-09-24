// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import "./setup/attenteJsdom";

/**
 * Le bouton et la touche Entrée doivent passer par la même serrure.
 *
 * Le bouton était grisé par `enCours`, la touche Entrée ne regardait rien :
 * deux pressions rapides — ou une touche maintenue, qui répète l'événement —
 * envoyaient deux enregistrements. Un affichage périmé se rattrape en
 * rechargeant ; une écriture en double reste en base.
 */

const H = vi.hoisted(() => ({
  ecritures: [] as unknown[],
  lacher: null as null | (() => void),
}));

vi.mock("@sentry/nextjs", () => ({ captureMessage: () => {}, captureException: () => {} }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));

vi.mock("@/app/components/options/actions", () => ({
  // L'enregistrement traîne : c'est pendant ce temps que la seconde pression
  // arrive, exactement comme sur un réseau lent.
  enregistrerValeur: async (donnees: unknown) => {
    H.ecritures.push(donnees);
    await new Promise<void>((r) => { H.lacher = () => r(); });
    return { id: "v1" };
  },
  enregistrerGroupe: async () => ({}),
  supprimerGroupe: async () => ({}),
  deplacerGroupe: async () => ({}),
  ordonnerGroupes: async () => ({}),
  basculerValeur: async () => ({}),
  supprimerValeur: async () => ({}),
  deplacerValeur: async () => ({}),
  dupliquerDepuis: async () => ({}),
  ordonnerValeurs: async () => ({}),
  definirParentGroupe: async () => ({}),
  basculerDependance: async () => ({}),
  basculerLot: async () => ({}),
  definirSupplementCombinaison: async () => ({}),
  appliquerPrixLot: async () => ({}),
  copierDisponibilites: async () => ({}),
}));

import GestionOptions from "@/app/components/options/GestionOptions";

const GROUPE = {
  id: "g1", nom: "Coloris", type: "choix", obligatoire: false, ordre: 1,
  aide: null, max_caracteres: null, valeurs: [],
} as never;

const decor = () => (
  <GestionOptions
    porteur={{ type: "article", id: "a1" } as never}
    groupes={[GROUPE]}
    dependances={[]}
    fournitures={[]}
    sources={[]}
  />
);

beforeEach(() => { H.ecritures.length = 0; H.lacher = null; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("enregistrer une option : deux pressions sur Entrée", () => {
  it("n'écrit qu'une seule fois", async () => {
    render(decor());

    // On ouvre le formulaire d'ajout d'une option.
    fireEvent.click(screen.getByRole("button", { name: /Ajouter une option/i }));
    const champ = await screen.findByLabelText("Nom");
    fireEvent.change(champ, { target: { value: "Bleu nuit" } });

    // Deux pressions coup sur coup, avant que la première ait répondu.
    fireEvent.keyDown(champ, { key: "Enter" });
    fireEvent.keyDown(champ, { key: "Enter" });
    fireEvent.keyDown(champ, { key: "Enter" });

    await waitFor(() => expect(H.ecritures.length).toBeGreaterThan(0));
    expect(
      H.ecritures.length,
      "la touche Entrée a envoyé plusieurs enregistrements : la base porte des doublons",
    ).toBe(1);

    H.lacher?.();
  });

  it("une fois l'enregistrement fini, la touche Entrée fonctionne de nouveau", async () => {
    render(decor());
    fireEvent.click(screen.getByRole("button", { name: /Ajouter une option/i }));
    const champ = await screen.findByLabelText("Nom");
    fireEvent.change(champ, { target: { value: "Bleu nuit" } });

    fireEvent.keyDown(champ, { key: "Enter" });
    await waitFor(() => expect(H.ecritures).toHaveLength(1));
    H.lacher?.(); // la première aboutit

    // La serrure doit se rouvrir : sinon le formulaire serait mort après un envoi.
    await waitFor(() => expect(screen.getByLabelText("Nom")).toBeTruthy());
    const champ2 = screen.getByLabelText("Nom");
    fireEvent.change(champ2, { target: { value: "Rouge" } });
    fireEvent.keyDown(champ2, { key: "Enter" });
    await waitFor(() => expect(H.ecritures).toHaveLength(2));
  });
});
