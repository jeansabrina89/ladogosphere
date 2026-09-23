import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Le rattrapage des échecs réseau : deux familles, deux phrases, et un retour
 * à un écran utilisable dans tous les cas.
 */

const H = vi.hoisted(() => ({ traces: [] as { message: string; contexte: unknown }[] }));

vi.mock("@sentry/nextjs", () => ({
  captureMessage: (message: string, contexte: unknown) => H.traces.push({ message, contexte }),
  captureException: () => {},
}));

import {
  appelerApi,
  tenterReseau,
  MESSAGE_RESEAU,
  MESSAGE_SERVEUR,
} from "@/src/lib/reseau";

/** Une réponse HTTP fabriquée à la main. */
const reponse = (statut: number, corps?: unknown) =>
  new Response(corps === undefined ? "" : JSON.stringify(corps), {
    status: statut,
    headers: { "content-type": "application/json" },
  });

beforeEach(() => {
  H.traces.length = 0;
  vi.restoreAllMocks();
});

describe("appelerApi", () => {
  it("la réponse attendue revient telle quelle, sans trace", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reponse(200, { ententes: [{ id: "e1" }] })));
    const r = await appelerApi<{ ententes: { id: string }[] }>("Zone.charger", "/api/x", {}, {});
    expect(r).toMatchObject({ ok: true, valeur: { ententes: [{ id: "e1" }] } });
    expect(H.traces).toEqual([]);
  });

  it("une réponse vide est une réponse : pas un échec", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
    const r = await appelerApi("Zone.supprimer", "/api/x", { method: "DELETE" }, {});
    expect(r).toEqual({ ok: true, valeur: null });
  });

  it("le serveur refuse : c'est SA phrase qui s'affiche, famille « serveur »", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reponse(400, { error: "Cette date est déjà prise." })));
    const vus: { message: string; famille: string }[] = [];
    const r = await appelerApi("Zone.envoyer", "/api/x", {}, {
      siEchec: (message, famille) => vus.push({ message, famille }),
    });
    expect(r).toMatchObject({ ok: false, famille: "serveur", message: "Cette date est déjà prise." });
    expect(vus).toEqual([{ message: "Cette date est déjà prise.", famille: "serveur" }]);
  });

  it("le serveur refuse sans un mot : une phrase par défaut, jamais un code", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>500</html>", { status: 500 })));
    const r = await appelerApi("Zone.envoyer", "/api/x", {}, {});
    expect(r).toMatchObject({ ok: false, famille: "serveur", message: MESSAGE_SERVEUR });
    expect(r.ok === false && r.message).not.toMatch(/\d{3}|html|error/i);
  });

  it("la demande n'est pas partie : famille « reseau », et on invite à réessayer", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    const r = await appelerApi("Zone.charger", "/api/x", {}, {});
    expect(r).toMatchObject({ ok: false, famille: "reseau", message: MESSAGE_RESEAU });
    expect(MESSAGE_RESEAU).toMatch(/réessayez/i);
  });

  it("une réponse illisible compte comme un échec réseau, pas comme un succès vide", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("pas du json", { status: 200 })));
    const r = await appelerApi("Zone.charger", "/api/x", {}, {});
    expect(r).toMatchObject({ ok: false, famille: "reseau" });
  });

  it("« toujours » s'exécute dans tous les cas : l'écran ne reste jamais en attente", async () => {
    const etats: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async () => reponse(200, {})));
    await appelerApi("Zone.a", "/api/x", {}, { toujours: () => etats.push("succès") });
    vi.stubGlobal("fetch", vi.fn(async () => reponse(400, { error: "non" })));
    await appelerApi("Zone.b", "/api/x", {}, { toujours: () => etats.push("refus") });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("coupé"); }));
    await appelerApi("Zone.c", "/api/x", {}, { toujours: () => etats.push("panne") });
    expect(etats).toEqual(["succès", "refus", "panne"]);
  });

  it("le message par défaut peut être remplacé quand le contexte l'exige", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("coupé"); }));
    const r = await appelerApi("Zone.charger", "/api/x", {}, { message: "L'export n'a pas pu être chargé." });
    expect(r).toMatchObject({ ok: false, message: "L'export n'a pas pu être chargé." });
  });
});

describe("tenterReseau", () => {
  it("rend la valeur quand tout va bien", async () => {
    const r = await tenterReseau("Zone.import", async () => 42, {});
    expect(r).toEqual({ ok: true, valeur: 42 });
    expect(H.traces).toEqual([]);
  });

  it("rattrape le rejet, rend l'écran, et le dit", async () => {
    let chargement = true;
    let phrase: string | null = null;
    const r = await tenterReseau("Zone.import", async () => { throw new Error("module absent"); }, {
      toujours: () => { chargement = false; },
      siEchec: (m) => { phrase = m; },
    });
    expect(r).toMatchObject({ ok: false, famille: "reseau" });
    expect(chargement).toBe(false);
    expect(phrase).toBe(MESSAGE_RESEAU);
  });
});

describe("ce qui part dans la trace", () => {
  it("le niveau est « error », et l'endroit permet de retrouver l'appel", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("coupé"); }));
    await appelerApi("Ententes.charger", "/api/chiens/abc/ententes", {}, {});
    expect(H.traces).toHaveLength(1);
    expect(H.traces[0].message).toBe("Échec reseau — Ententes.charger");
    expect(H.traces[0].contexte).toMatchObject({
      level: "error",
      tags: { endroit: "Ententes.charger", famille: "reseau" },
    });
  });

  it("aucune donnée personnelle : ni nom, ni adresse, ni formulaire, ni identifiant", async () => {
    const corps = JSON.stringify({
      nom: "Dupont", prenom: "Camille", chien: "Pixel",
      adresse: "3 rue du Test, 1950 Sion", email: "camille@exemple.test",
    });
    vi.stubGlobal("fetch", vi.fn(async () => reponse(500, { error: "Camille Dupont : refusé" })));
    await appelerApi("Zone.envoyer", "/api/clients/7a820aa4-ff87-4261-bf66-072ec2f404c8", {
      method: "POST", body: corps,
    }, {});

    const charge = JSON.stringify(H.traces);
    for (const interdit of ["Dupont", "Camille", "Pixel", "Sion", "exemple.test", "7a820aa4", "/api/clients"]) {
      expect(charge).not.toContain(interdit);
    }
    // Seuls l'endroit, la famille et le code HTTP voyagent.
    expect(H.traces[0].contexte).toMatchObject({ tags: { endroit: "Zone.envoyer" }, extra: { statut: 500 } });
  });
});
