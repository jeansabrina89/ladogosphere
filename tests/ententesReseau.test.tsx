// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, within } from "@testing-library/react";
import "./setup/attenteJsdom"; // quatre secondes d'attente, pas une

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
    // Instrumenté pour départager deux hypothèses sur un échec intermittent
    // (une fois sur huit exécutions de la suite entière) : une écriture
    // périmée du composant, ou un reste de DOM d'un test voisin.
    const journal: string[] = [];
    let rang = 0;
    // CHAQUE appel reçoit son propre objet Response, comme un vrai fetch. Le
    // simulateur en partageait un seul : or un corps ne se lit qu'une fois,
    // donc un deuxième lecteur recevait « Body is unusable », que `appelerApi`
    // traite en échec réseau. Un simulateur qui ne supporte pas d'être appelé
    // deux fois invente des pannes que la production n'aurait pas.
    const fetchSimule = vi.fn(async () => {
      const n = ++rang;
      journal.push(`appel#${n}`);
      if (n === 1) { journal.push(`echec#${n}`); throw new TypeError("Failed to fetch"); }
      journal.push(`succes#${n}`);
      return reponse(LISTE);
    });
    vi.stubGlobal("fetch", fetchSimule);
    const { container } = afficher();

    const reessayer = await screen.findByRole("button", { name: /Réessayer/i });
    reessayer.click();

    await waitFor(() => expect(screen.queryAllByText(/Nala/).length).toBeGreaterThan(0));

    // Le départage tient dans ces deux nombres : un bandeau DANS ce conteneur
    // accuse le composant ; un bandeau ailleurs dans la page accuse le
    // nettoyage entre tests. L'assertion est plus stricte qu'avant, pas moins.
    const ici = within(container).queryAllByRole("alert");
    const partout = screen.queryAllByRole("alert");
    expect(
      { dansCeConteneur: ici.length, dansToutLeDocument: partout.length },
      `ordre des appels : ${journal.join(" → ")} | conteneurs montés : ${document.body.childElementCount}` +
        ` | texte du bandeau : ${(partout[0]?.textContent ?? "aucun").slice(0, 80)}`,
    ).toEqual({ dansCeConteneur: 0, dansToutLeDocument: 0 });
  });
});

describe("Ententes : deux chargements en vol", () => {
  it("un appel LENT qui échoue n'écrase pas le résultat d'un appel RAPIDE", async () => {
    // Le scénario que personne ne sait provoquer à la main mais qu'un réseau
    // instable fabrique tout seul : « Réessayer » cliqué deux fois, la
    // première réponse arrivant APRÈS la seconde, et en panne.
    let lacher: (() => void) | null = null;
    const lent = new Promise<void>((r) => { lacher = () => r(); });

    let rang = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      const n = ++rang;
      if (n === 1) throw new TypeError("Failed to fetch"); // le chargement initial
      if (n === 2) { await lent; throw new TypeError("Failed to fetch"); } // lent, et en panne
      return reponse(LISTE); // rapide, et bon
    }));

    const { container } = afficher();

    // Premier clic : part, et va traîner.
    const reessayer = await screen.findByRole("button", { name: /Réessayer/i });
    reessayer.click();
    // Deuxième clic : part, et répond tout de suite.
    reessayer.click();
    await waitFor(() => expect(screen.queryAllByText(/Nala/).length).toBeGreaterThan(0));

    // Maintenant seulement, le premier appel retombe — en panne.
    lacher!();
    await new Promise((r) => setTimeout(r, 50));

    // Sa panne est périmée : elle ne doit rien afficher par-dessus la liste.
    expect(
      within(container).queryAllByRole("alert").length,
      "une réponse dépassée a écrit dans l'état : le bandeau d'erreur recouvre une liste correcte",
    ).toBe(0);
    expect(screen.queryAllByText(/Nala/).length).toBeGreaterThan(0);
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
