// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import "./setup/attenteJsdom";

/**
 * L'écran d'inventaire : les anomalies se voient, et rien n'invite à agir.
 */

const H = vi.hoisted(() => ({ appels: [] as string[], reprises: [] as string[] }));

vi.mock("@sentry/nextjs", () => ({ captureMessage: () => {}, captureException: () => {} }));

// L action serveur touche la base des son chargement : on la simule, comme
// toute frontiere serveur dans un test de rendu.
vi.mock("@/app/(admin)/(espace-comptabilite)/export-comptable/actions", () => ({
  reprendreDocument: async (id: string) => { H.reprises.push(id); return { ok: true }; },
}));

import InventaireExport from "@/app/(admin)/(espace-comptabilite)/export-comptable/Inventaire";

const moisVide = (mois: number) => ({
  mois, nbFactures: 0, nbPieces: 0, nbOriginaux: 0,
  octetsFactures: 0, octetsPieces: 0, octetsOriginaux: 0, octets: 0,
});

function inventaire(avecAnomalies: boolean) {
  const mois = Array.from({ length: 12 }, (_, i) => moisVide(i + 1));
  mois[2] = { ...moisVide(3), nbFactures: 2, octetsFactures: 240_000, octets: 240_000 };
  return {
    exercice: 2026,
    mois,
    total: { ...moisVide(0), nbFactures: 2, octetsFactures: 240_000, octets: 240_000 },
    appelsStockage: 4,
    anomalies: avecAnomalies
      ? {
          manquants: [{ chemin: "2026/FAC-2026-0009.pdf", categorie: "facture", dateComptable: "2026-05-20" }],
          orphelins: [{ chemin: "depense/d1/zzz-inconnu.webp", octets: 7_000 }],
          originauxManquants: [{ chemin: "depense/d2/bbb.origine.jpg", dateComptable: "2026-04-02" }],
          facturesSansDocument: [
            { id: "f8", numero: "FAC-2026-0008", statut: "envoyee", dateComptable: "2026-07-15", renonceLe: null },
            { id: "f9", numero: "FAC-2026-0009", statut: "envoyee", dateComptable: "2026-07-16", renonceLe: "2026-09-20T07:00:00Z" },
          ],
          facturesDocumentPerdu: [{ numero: "FAC-2026-0002", chemin: "2026/FAC-2026-0002.pdf" }],
          sansExercice: [{ chemin: "RECETTE4000-x/justificatif.pdf", entite: "depense", entiteId: "d-perdu" }],
        }
      : { manquants: [], orphelins: [], originauxManquants: [], facturesSansDocument: [], sansExercice: [], facturesDocumentPerdu: [] },
  };
}

const reponse = (corps: unknown, statut = 200) =>
  new Response(JSON.stringify(corps), { status: statut, headers: { "content-type": "application/json" } });

beforeEach(() => { H.appels.length = 0; H.reprises.length = 0; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("écran d'inventaire", () => {
  it("les anomalies s'affichent, avec leur chemin, sans être masquées", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      H.appels.push(String(url));
      return reponse(inventaire(true));
    }));

    render(<InventaireExport exercices={[2026, 2025]} exerciceInitial={2026} />);

    const alerte = await screen.findByRole("alert");
    expect(alerte.textContent).toContain("2026/FAC-2026-0009.pdf");
    expect(alerte.textContent).toContain("depense/d1/zzz-inconnu.webp");
    expect(alerte.textContent).toContain("depense/d2/bbb.origine.jpg");
    // Le compte est annoncé dans le titre : on ne découvre pas les anomalies en lisant.
    // Les deux catégories ajoutées au lot 20 comptent dans le total.
    expect(alerte.textContent).toContain("FAC-2026-0008");
    expect(alerte.textContent).toContain("RECETTE4000-x/justificatif.pdf");
    // « Document PERDU » est une catégorie à part : la pièce a existé.
    expect(alerte.textContent).toContain("Document PERDU");
    expect(alerte.textContent).toContain("2026/FAC-2026-0002.pdf");
    expect(screen.getByText(/Anomalies \(7\)/)).toBeTruthy();
  });

  it("sans anomalie, l'écran le dit au lieu de laisser un vide", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reponse(inventaire(false))));
    render(<InventaireExport exercices={[2026]} exerciceInitial={2026} />);

    await waitFor(() => expect(screen.getByText(/Aucune :/)).toBeTruthy());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("annonce ce que pèsera l'export", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reponse(inventaire(false))));
    render(<InventaireExport exercices={[2026]} exerciceInitial={2026} />);
    await waitFor(() => expect(document.body.textContent).toContain("pèsera"));
    expect(document.body.textContent).toContain("234 ko");
  });

  it("le SEUL bouton est « Reprendre », et seulement sur une facture renoncée", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reponse(inventaire(true))));
    render(<InventaireExport exercices={[2026]} exerciceInitial={2026} />);
    await screen.findByRole("alert");

    // L'écran reste en lecture, à une exception près, voulue : une facture que
    // la réconciliation a laissée tomber n'a plus aucun chemin de retour hors
    // de la base. FAC-2026-0008 n'est pas renoncée : elle n'a pas de bouton.
    const boutons = screen.queryAllByRole("button");
    expect(boutons).toHaveLength(1);
    expect(boutons[0].textContent).toContain("Reprendre");
  });

  it("reprendre une facture renoncée appelle l'action, avec SON identifiant", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reponse(inventaire(true))));
    render(<InventaireExport exercices={[2026]} exerciceInitial={2026} />);
    await screen.findByRole("alert");

    fireEvent.click(screen.getByRole("button", { name: /Reprendre/i }));
    // f9 est la renoncée ; f8 ne doit jamais partir.
    await waitFor(() => expect(H.reprises).toEqual(["f9"]));
  });

  it("changer d'exercice relit, et l'attente retombe", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      H.appels.push(String(url));
      return reponse(inventaire(false));
    }));
    render(<InventaireExport exercices={[2026, 2025]} exerciceInitial={2026} />);
    await waitFor(() => expect(H.appels).toHaveLength(1));

    fireEvent.change(screen.getByLabelText("Exercice"), { target: { value: "2025" } });
    await waitFor(() => expect(H.appels).toHaveLength(2));
    expect(H.appels[1]).toContain("exercice=2025");
    await waitFor(() => expect(screen.queryByText(/Lecture en cours/)).toBeNull());
  });

  it("le réseau lâche : message, attente retombée, tableau conservé", async () => {
    let echouer = false;
    vi.stubGlobal("fetch", vi.fn(async () => {
      if (echouer) throw new TypeError("Failed to fetch");
      return reponse(inventaire(false));
    }));
    render(<InventaireExport exercices={[2026, 2025]} exerciceInitial={2026} />);
    await waitFor(() => expect(document.body.textContent).toContain("pèsera"));

    echouer = true;
    fireEvent.change(screen.getByLabelText("Exercice"), { target: { value: "2025" } });

    const alerte = await screen.findByRole("alert");
    expect(alerte.textContent).toContain("joindre le serveur");
    // Ce qui était affiché l'est toujours.
    expect(document.body.textContent).toContain("pèsera");
    await waitFor(() => expect(screen.queryByText(/Lecture en cours/)).toBeNull());
  });
});
