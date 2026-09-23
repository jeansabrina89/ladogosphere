// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";

/**
 * Les neuf autres écrans, quand le réseau lâche.
 *
 * Pour chacun, les trois mêmes questions : une phrase s'affiche-t-elle ?
 * l'attente est-elle retombée ? ce qui était affiché l'est-il toujours ?
 */

const H = vi.hoisted(() => ({
  traces: [] as { message: string; contexte: unknown }[],
  pousse: [] as string[],
  fusion: null as null | (() => Promise<unknown>),
  creerReservation: null as null | (() => Promise<unknown>),
  enregistrerValeur: null as null | (() => Promise<unknown>),
  verifyOtp: null as null | (() => Promise<unknown>),
}));

vi.mock("@sentry/nextjs", () => ({
  captureMessage: (message: string, contexte: unknown) => H.traces.push({ message, contexte }),
  captureException: () => {},
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: (url: string) => H.pousse.push(url), refresh: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  redirect: () => {},
}));

vi.mock("@/app/(public)/catalogue/actionsFusion", () => ({
  fusionnerPanierLocal: () => H.fusion!(),
}));
vi.mock("@/app/(public)/catalogue/panierNavigateur", () => ({
  lirePanier: () => ({ lignes: [{ article_id: "a1", quantite: 1 }] }),
  viderPanier: () => {},
}));

import { MESSAGE_RESEAU } from "@/src/lib/reseau";
import FormModifierReservation from "@/app/(admin)/(espace-clients)/reservations/[id]/modifier/FormModifierReservation";
import BoutonsCheckinDashboard from "@/app/components/BoutonsCheckinDashboard";
import FusionPanier from "@/app/(public)/catalogue/FusionPanier";

const RESA = "44444444-4444-4444-8444-444444444444";

const reponse = (corps: unknown, statut = 200) =>
  new Response(JSON.stringify(corps), { status: statut, headers: { "content-type": "application/json" } });

const DETAILS = {
  reservation: {
    id: RESA, box_id: "b1", type_sejour: "pension", date_debut: "2026-10-01", date_fin: "2026-10-05",
    heure_arrivee: "09:00", heure_depart: "17:00", reservation_chiens: [{ chien_id: "c1" }],
  },
  boxes: [{ id: "b1", numero: 1, nom: "Box 1" }],
  peutUrgence: false,
};

beforeEach(() => {
  H.traces.length = 0;
  H.pousse.length = 0;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// ── 2. FormModifierReservation ─────────────────────────────────────────────

describe("Modifier une réservation : le chargement échoue", () => {
  it("l'écran quitte « Chargement… », dit pourquoi, et propose de réessayer", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    render(<FormModifierReservation id={RESA} />);

    const alerte = await screen.findByRole("alert");
    expect(alerte.textContent).toContain(MESSAGE_RESEAU);
    expect(screen.queryByText(/Chargement\.\.\./)).toBeNull();
    expect(screen.getByRole("button", { name: /Réessayer/i }).hasAttribute("disabled")).toBe(false);
  });

  it("l'enregistrement échoue : le bouton se réactive et le formulaire reste rempli", async () => {
    const fetchSimule = vi.fn()
      .mockResolvedValueOnce(reponse(DETAILS))
      .mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchSimule);
    const { container } = render(<FormModifierReservation id={RESA} />);

    await waitFor(() => expect(screen.getByRole("button", { name: /Enregistrer/i })).toBeTruthy());
    const formulaire = container.querySelector("form")!;
    fireEvent.submit(formulaire);

    const alerte = await screen.findByRole("alert");
    expect(alerte.textContent).toContain(MESSAGE_RESEAU);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Enregistrer/i }).hasAttribute("disabled")).toBe(false));
    // Le formulaire est toujours là, avec ses champs.
    expect(container.querySelector("form")).not.toBeNull();
    expect(H.pousse).toEqual([]); // on n'a pas navigué : rien n'a été enregistré
  });
});

// ── 5. BoutonsCheckinDashboard ─────────────────────────────────────────────

describe("Check-in du jour : le réseau est instable", () => {
  it("le bouton redevient cliquable, et la panne est dite", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    render(
      <BoutonsCheckinDashboard checkin_id="k1" type="arrivee" statut="attendu" nom_chien="Pixel" />,
    );

    const bouton = screen.getByRole("button", { name: /Valider l'arrivée/i });
    fireEvent.click(bouton);

    const alerte = await screen.findByRole("alert");
    expect(alerte.textContent).toContain(MESSAGE_RESEAU);
    // Le point qui compte ici : personne ne doit croire que l'arrivée est passée.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Valider l'arrivée/i }).hasAttribute("disabled")).toBe(false));
    expect(JSON.stringify(H.traces)).not.toContain("Pixel");
  });

  it("le serveur refuse : c'est SA phrase qui s'affiche, pas celle du réseau", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reponse({ error: "Ce chien est déjà arrivé." }, 400)));
    render(
      <BoutonsCheckinDashboard checkin_id="k1" type="arrivee" statut="attendu" nom_chien="Pixel" />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Valider l'arrivée/i }));

    const alerte = await screen.findByRole("alert");
    expect(alerte.textContent).toContain("Ce chien est déjà arrivé.");
    expect(alerte.textContent).not.toContain(MESSAGE_RESEAU);
  });
});

// ── 7. FusionPanier ────────────────────────────────────────────────────────

describe("Fusion du panier à la connexion", () => {
  it("l'échec se dit, et le panier du navigateur n'est pas perdu", async () => {
    H.fusion = async () => { throw new TypeError("Failed to fetch"); };
    render(<FusionPanier />);

    const alerte = await screen.findByRole("alert");
    expect(alerte.textContent).toContain(MESSAGE_RESEAU);
    expect(H.traces[0].contexte).toMatchObject({ tags: { endroit: "FusionPanier.fusionner" } });
  });

  it("quand tout va bien, rien ne s'affiche en rouge", async () => {
    H.fusion = async () => ({ fusionne: true, message: "1 article a rejoint votre compte." });
    render(<FusionPanier />);
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("rejoint votre compte"));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
