// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import "./setup/attenteJsdom"; // quatre secondes d'attente, pas une

/**
 * APP 74 — la case « 🏠 Mon chien seul dans un box » dans le tunnel client.
 *
 * Le vrai tunnel est rendu ; seuls l'action serveur et le calendrier
 * (`/api/dates-indisponibles`) sont doublés. On prouve où la case apparaît,
 * que l'estimation et le récapitulatif la suivent, et que la demande la porte.
 */

const H = vi.hoisted(() => ({
  envois: [] as Record<string, unknown>[],
  urls: [] as string[],
}));

vi.mock("@/app/(client)/mon-compte/reservations/actions", () => ({
  creerDemandeReservation: async (input: Record<string, unknown>) => {
    H.envois.push(input);
    return { ok: true, ids: ["r1"] };
  },
}));

import TunnelReservation, { type ChienTunnel } from "@/app/(client)/mon-compte/reservations/nouvelle/TunnelReservation";

const ANNEE = new Date().getFullYear();
const TARIFS = [
  { categorie: "journee_partage_1", prix: "35" },
  { categorie: "journee_partage_2", prix: "68" },
  { categorie: "journee_privatif", prix: "70" },
  { categorie: "sejour_partage_1", prix: "45" },
  { categorie: "sejour_privatif", prix: "90" },
].map((t) => ({ ...t, membre: true, annee: ANNEE }));

const chien = (id: string, nom: string, p: Partial<ChienTunnel> = {}): ChienTunnel => ({
  id, nom, race: null, poids: 20, categorie_poids: "15_30kg", statut_essai: "valide",
  client_id: "c1", doit_etre_isole: false, ...p,
});
const REX = chien("rex", "Rex");
const DUO = chien("duo", "Duo");
const ISO = chien("iso", "Iso", { doit_etre_isole: true });
const NOUVEAU = chien("nouveau", "Nouveau", { statut_essai: "non_programme" });

const CASE = /Mon chien seul dans un box/;

function monter(chiens: ChienTunnel[], aCarteChienSeul = false) {
  return render(
    <TunnelReservation chiens={chiens} tarifs={TARIFS} estMembreAJour estExempte={false}
      essaiTermine adhesionEnAttenteARegler={false} montantCotisation={200}
      aCarteChienSeul={aCarteChienSeul} />,
  );
}
const suivant = () => fireEvent.click(screen.getByRole("button", { name: /Suivant/ }));
function choisirChiens(...noms: string[]) {
  for (const n of noms) fireEvent.click(screen.getByRole("button", { name: new RegExp(n) }));
  suivant();
}

beforeEach(() => {
  H.envois.length = 0;
  H.urls.length = 0;
  vi.stubGlobal("fetch", async (url: string) => {
    H.urls.push(String(url));
    return { json: async () => ({ jours_feries: [], dates_pleines: [], dates_fermees: [] }) };
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("où la case apparaît", () => {
  it("un chien sociable : la case, avec les prix « seul » lus dans les tarifs", () => {
    monter([REX]);
    choisirChiens("Rex");
    fireEvent.click(screen.getByRole("button", { name: /Garderie/ }));
    expect(screen.getByRole("checkbox", { name: CASE })).toBeTruthy();
    expect(screen.getByText(
      "Votre chien ne partage pas son box. Tarif chien seul : 70.– la journée, 90.– la nuit.")).toBeTruthy();
  });

  it("un chien qui doit être isolé : pas de case (il l'est déjà)", () => {
    monter([ISO]);
    choisirChiens("Iso");
    expect(screen.queryByRole("checkbox", { name: CASE })).toBeNull();
  });

  it("deux chiens : pas de case, et l'explication des règles d'aujourd'hui", () => {
    monter([REX, DUO]);
    choisirChiens("Rex", "Duo");
    expect(screen.queryByRole("checkbox", { name: CASE })).toBeNull();
    expect(screen.getByText(/Vos chiens partagent un box/)).toBeTruthy();
  });

  it("journée d'essai : pas de case", () => {
    monter([NOUVEAU]);
    choisirChiens("Nouveau");
    expect(screen.queryByRole("checkbox", { name: CASE })).toBeNull();
  });
});

describe("le récapitulatif et la demande suivent la case", () => {
  const date = (() => {
    const d = new Date(); d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  })();

  function jusquAuRecap(cocher: boolean, aCarte = false) {
    const { container } = monter([REX], aCarte);
    choisirChiens("Rex");
    fireEvent.click(screen.getByRole("button", { name: /Garderie/ }));
    if (cocher) fireEvent.click(screen.getByRole("checkbox", { name: CASE }));
    suivant();
    fireEvent.change(container.querySelector('input[type="date"]')!, { target: { value: date } });
    const [arrivee, depart] = screen.getAllByRole("combobox") as HTMLSelectElement[];
    fireEvent.change(arrivee, { target: { value: arrivee.options[1].value } });
    fireEvent.change(depart, { target: { value: depart.options[1].value } });
    suivant(); // → fréquence
    suivant(); // → récapitulatif
    expect(screen.getByText(/Vérifiez votre demande/)).toBeTruthy();
    return container;
  }

  it("cochée : 70.–, la ligne « Box », et la demande part avec box_seul", () => {
    jusquAuRecap(true);
    expect(screen.getByText("70.–")).toBeTruthy();
    const recap = screen.getByText("Box").parentElement!;
    expect(within(recap).getByText("🏠 Mon chien seul dans un box")).toBeTruthy();
    // Le calendrier a été relu pour un box VIDE.
    expect(H.urls.some((u) => u.includes("box_seul=1"))).toBe(true);
  });

  it("cochée, avec une carte « 1 chien seul » : on le dit", () => {
    jusquAuRecap(true, true);
    expect(screen.getAllByText("Payable avec votre carte 1 chien seul").length).toBeGreaterThan(0);
  });

  it("non cochée : 35.– comme avant, et pas de ligne « Box »", () => {
    jusquAuRecap(false);
    expect(screen.getByText("35.–")).toBeTruthy();
    expect(screen.queryByText("Box")).toBeNull();
  });

  it("la demande envoyée porte la case", async () => {
    jusquAuRecap(true);
    for (const c of screen.getAllByRole("checkbox")) fireEvent.click(c); // les conditions
    fireEvent.click(screen.getByRole("button", { name: /Envoyer la demande/ }));
    await vi.waitFor(() => expect(H.envois).toHaveLength(1));
    expect(H.envois[0]).toMatchObject({ chien_ids: ["rex"], type_reservation: "journee", box_seul: true });
  });
});
