// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import "./setup/attenteJsdom";

/**
 * L'écran d'inventaire : les anomalies se voient, et rien n'invite à agir.
 */

const H = vi.hoisted(() => ({ appels: [] as string[] }));

vi.mock("@sentry/nextjs", () => ({ captureMessage: () => {}, captureException: () => {} }));

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
        }
      : { manquants: [], orphelins: [], originauxManquants: [] },
  };
}

const reponse = (corps: unknown, statut = 200) =>
  new Response(JSON.stringify(corps), { status: statut, headers: { "content-type": "application/json" } });

beforeEach(() => { H.appels.length = 0; });
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
    expect(screen.getByText(/Anomalies \(3\)/)).toBeTruthy();
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

  it("aucun bouton d'action : ni actif, ni grisé", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reponse(inventaire(true))));
    render(<InventaireExport exercices={[2026]} exerciceInitial={2026} />);
    await screen.findByRole("alert");
    // Un bouton grisé inviterait à revenir voir ; il n'y a rien à revenir chercher.
    expect(screen.queryAllByRole("button")).toHaveLength(0);
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
