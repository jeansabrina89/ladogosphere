// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";

/**
 * Les écrans restants, et la création d'une réservation — celle-ci n'avait
 * jamais été vue tourner depuis le passage de `window.location.href` à
 * `router.push()` (18d).
 */

const H = vi.hoisted(() => ({
  traces: [] as { message: string; contexte: unknown }[],
  pousse: [] as string[],
  rafraichi: 0,
  alertes: [] as string[],
  verifyOtp: null as null | (() => Promise<{ error: unknown }>),
}));

vi.mock("@sentry/nextjs", () => ({
  captureMessage: (message: string, contexte: unknown) => H.traces.push({ message, contexte }),
  captureException: () => {},
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: (url: string) => H.pousse.push(url), refresh: () => { H.rafraichi++; } }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@supabase/ssr", () => ({
  createBrowserClient: () => ({
    auth: {
      verifyOtp: () => H.verifyOtp!(),
      updateUser: async () => ({ error: null }),
    },
  }),
}));

import { MESSAGE_RESEAU } from "@/src/lib/reseau";
import FormReservation from "@/app/(admin)/(espace-clients)/reservations/nouvelle/FormReservation";

const CLIENT = { id: "cl1", prenom: "ZZ", nom: "Recette", membre: true } as never;
const CHIEN = { id: "ch1", nom: "Pixel", client_id: "cl1", statut_essai: "valide" } as never;
const BOX = { id: "b1", numero: 1, nom: "Box 1", interne: false } as never;

const reponse = (corps: unknown, statut = 200) =>
  new Response(JSON.stringify(corps), { status: statut, headers: { "content-type": "application/json" } });

/** Remplit le minimum pour qu'une réservation d'une journée puisse partir. */
function remplirJournee(container: HTMLElement) {
  const listes = container.querySelectorAll("select");
  fireEvent.change(listes[0], { target: { value: "cl1" } });
  const cases = container.querySelectorAll('input[type="checkbox"]');
  if (cases.length > 0) fireEvent.click(cases[0]);
  const dates = container.querySelectorAll('input[type="date"]');
  dates.forEach((d) => fireEvent.change(d, { target: { value: "2026-10-01" } }));
  // Le box : sans lui, l'envoi est refusé avant même de partir.
  for (const liste of Array.from(container.querySelectorAll("select"))) {
    if (Array.from(liste.options).some((o) => o.value === "b1")) {
      fireEvent.change(liste, { target: { value: "b1" } });
    }
  }
}

beforeEach(() => {
  H.traces.length = 0;
  H.pousse.length = 0;
  H.alertes.length = 0;
  H.rafraichi = 0;
  vi.stubGlobal("alert", (m: string) => H.alertes.push(String(m)));
  vi.stubGlobal("confirm", () => true);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// ── Création d'une réservation : ce que le 18d n'avait jamais vu tourner ────

describe("Créer une réservation", () => {
  it("arrive sur la fiche créée, et redemande les données au serveur", async () => {
    const fetchSimule = vi.fn(async () => reponse({ id: "r-neuve" }));
    vi.stubGlobal("fetch", fetchSimule);
    const { container } = render(
      <FormReservation clients={[CLIENT]} chiens={[CHIEN]} boxes={[BOX]} peutUrgence={false} />,
    );

    remplirJournee(container);
    fireEvent.submit(container.querySelector("form")!);

    // La navigation passe par le routeur de Next, vers la réservation créée.
    await waitFor(() => expect(H.pousse).toEqual(["/reservations/r-neuve"]));
    // …et les données de la page suivante sont relues côté serveur.
    expect(H.rafraichi).toBeGreaterThan(0);
  });

  it("un second envoi ne crée pas de doublon tant que le premier n'a pas répondu", async () => {
    let debloquer: (v: Response) => void = () => {};
    const attente = new Promise<Response>((r) => { debloquer = r; });
    // La signature est annoncée pour pouvoir relire ensuite AVEC QUOI il a été
    // appelé — c'est là qu'on voit s'il n'est parti qu'un seul envoi.
    const fetchSimule = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(() => attente);
    vi.stubGlobal("fetch", fetchSimule);
    const { container } = render(
      <FormReservation clients={[CLIENT]} chiens={[CHIEN]} boxes={[BOX]} peutUrgence={false} />,
    );

    remplirJournee(container);
    const bouton = screen.getByRole("button", { name: /Enregistrer/i });
    fireEvent.click(bouton);

    // Le bouton est verrouillé pendant l'envoi : c'est ce qui empêche le doublon.
    await waitFor(() => expect(bouton.hasAttribute("disabled")).toBe(true));
    fireEvent.click(bouton);
    fireEvent.click(bouton);

    debloquer(reponse({ id: "r-neuve" }));
    await waitFor(() => expect(H.pousse).toEqual(["/reservations/r-neuve"]));
    // Un seul appel d'écriture est parti.
    const envois = fetchSimule.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(envois).toHaveLength(1);
  });

  it("le réseau lâche : message, bouton réactivé, saisie conservée", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    const { container } = render(
      <FormReservation clients={[CLIENT]} chiens={[CHIEN]} boxes={[BOX]} peutUrgence={false} />,
    );

    remplirJournee(container);
    fireEvent.submit(container.querySelector("form")!);

    const alerte = await screen.findByRole("alert");
    expect(alerte.textContent).toContain(MESSAGE_RESEAU);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Enregistrer/i }).hasAttribute("disabled")).toBe(false));
    // On n'a pas navigué, et la saisie est toujours là.
    expect(H.pousse).toEqual([]);
    expect((container.querySelector('input[type="date"]') as HTMLInputElement).value).toBe("2026-10-01");
    // Rien de personnel dans la trace.
    expect(JSON.stringify(H.traces)).not.toContain("Pixel");
  });
});

// ── L'export Excel : c'est le MODULE qui manque, pas le serveur ─────────────

describe("Export Excel des statistiques", () => {
  it("le module ne se charge pas : phrase dédiée, bouton de nouveau cliquable", async () => {
    vi.doMock("xlsx", () => { throw new Error("chunk indisponible"); });
    const { default: Statistiques } = await import(
      "@/app/(admin)/(espace-comptabilite)/comptabilite/Statistiques"
    );

    render(
      <Statistiques
        annee={2026}
        statsMois={[{
          mois: "janvier", ca_facture: 1, ca_encaisse: 1, ca_annee_prec: 0, ca_cotisations: 0,
          ca_total: 1, nb_reservations: 1, nb_accueils_non_factures: 0, nb_chiens_total: 1,
          taux_box: 10, taux_box_payant: 10, taux_places: 10,
        }] as never}
        statsJours={[] as never}
        totalAnneeFacture={1}
        totalAnneeEncaisse={1}
        totalAnneePrec={0}
        totalCotisations={0}
        totalEncaisse={1}
        nbChiensActifs={0}
      />,
    );

    const bouton = screen.getByRole("button", { name: /Exporter stats Excel/i });
    fireEvent.click(bouton);

    const alerte = await screen.findByRole("alert");
    expect(alerte.textContent).toContain("L'export n'a pas pu être chargé.");
    // La phrase ne parle pas du serveur : ce n'est pas lui qui a manqué.
    expect(alerte.textContent).not.toContain("joindre le serveur");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Exporter stats Excel/i }).hasAttribute("disabled")).toBe(false));
    vi.doUnmock("xlsx");
  });
});

// ── Le lien de réinitialisation : un échec laisse quelqu'un dehors ──────────

describe("Réinitialisation du mot de passe", () => {
  it("le serveur injoignable : on dit quoi faire, pas seulement que ça a raté", async () => {
    window.history.replaceState({}, "", "/reset-password?token_hash=abc&type=recovery");
    H.verifyOtp = async () => { throw new TypeError("Failed to fetch"); };
    const { default: PageReset } = await import("@/app/(public)/reset-password/page");

    render(<PageReset />);

    await waitFor(() => {
      const texte = document.body.textContent ?? "";
      expect(texte).toContain("Vérifiez votre connexion");
      // La marche à suivre, dans l'ordre : réessayer, puis redemander un lien.
      expect(texte).toContain("rechargez cette page");
      expect(texte).toContain("redemandez un e-mail");
    });
  });

  it("le lien est périmé : c'est une autre phrase, celle du serveur", async () => {
    window.history.replaceState({}, "", "/reset-password?token_hash=abc&type=recovery");
    H.verifyOtp = async () => ({ error: { message: "expired" } });
    const { default: PageReset } = await import("@/app/(public)/reset-password/page");

    render(<PageReset />);
    await waitFor(() => {
      const texte = document.body.textContent ?? "";
      expect(texte).toContain("Ce lien a expiré");
      expect(texte).not.toContain("Vérifiez votre connexion");
    });
  });
});

// ── Les deux écrans que je n'ai pas pu rendre sans monter un décor entier ──
//
// GestionOptions n'expose pas son formulaire de valeur (sous-composant interne,
// atteignable seulement après plusieurs clics), et TunnelReservation est un
// tunnel à étapes dont le bouton d'envoi est au bout. Les rendre demanderait
// soit de les réécrire, soit un décor plus gros que ce qu'il prouve. On
// vérifie donc le BRANCHEMENT : l'appel passe par le rattrapage, et il éteint
// l'attente.
describe("branchement des deux écrans à étapes", () => {
  const lire = async (...p: string[]) => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    // Les sources sont en CRLF : on normalise avant de chercher.
    return fs.readFileSync(path.join(process.cwd(), ...p), "utf8").split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));
  };

  it("GestionOptions : l'enregistrement d'une valeur rend la main", async () => {
    const src = await lire("app", "components", "options", "GestionOptions.tsx");
    expect(src).toContain('tenterReseau(\n      "GestionOptions.enregistrerValeur"');
    expect(src).toContain("toujours: () => setEnCours(false)");
    expect(src).toContain("siEchec: (phrase) => onFini({ error: phrase })");
  });

  it("TunnelReservation : l'envoi de la demande rend la main", async () => {
    const src = await lire("app", "(client)", "mon-compte", "reservations", "nouvelle", "TunnelReservation.tsx");
    expect(src).toContain('tenterReseau(\n      "TunnelReservation.soumettre"');
    expect(src).toContain("toujours: () => setChargement(false)");
    expect(src).toContain("siEchec: setErreur");
  });
});
