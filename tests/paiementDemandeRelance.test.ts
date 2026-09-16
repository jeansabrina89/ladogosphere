import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Demande de paiement à J-14 (cron rappel-veille, tâche 2) et relances : elles
 * lisent le reste à payer DÉRIVÉ des factures, jamais le drapeau enregistré.
 *
 * Le cas qui piégeait : une réservation marquée « impayé » alors que sa facture
 * a été payée depuis la fiche facture. Elle ne doit recevoir ni demande de
 * paiement, ni relance.
 */

const H = vi.hoisted(() => ({
  reservations: [] as Record<string, unknown>[],
  /** Ce que les factures disent de chaque réservation (entrée de la vraie dérivation). */
  factures: {} as Record<string, { lignes: number; paye: number; statut: string }>,
  emailsPaiement: [] as unknown[],
  emailsRelance: [] as unknown[],
  majs: [] as Record<string, unknown>[],
}));

vi.mock("@/src/lib/supabase-admin", () => {
  function from(table: string) {
    const ctx: { filtres: Record<string, unknown>; isNull: string[]; single: boolean } = { filtres: {}, isNull: [], single: false };
    const lignes = () => {
      if (table !== "reservations") return [];
      return H.reservations.filter((r) =>
        Object.entries(ctx.filtres).every(([k, v]) => (Array.isArray(v) ? v.includes(r[k]) : r[k] === v))
        && ctx.isNull.every((k) => r[k] === null || r[k] === undefined));
    };
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (k: string, v: unknown) => { ctx.filtres[k] = v; return chain; },
      in: (k: string, v: unknown[]) => { ctx.filtres[k] = v; return chain; },
      is: (k: string) => { ctx.isNull.push(k); return chain; },
      neq: (k: string, v: unknown) => { ctx.filtres[`__neq_${k}`] = v; return chain; },
      single: () => Promise.resolve({ data: lignes()[0] ?? null, error: null }),
      maybeSingle: () => Promise.resolve({ data: lignes()[0] ?? null, error: null }),
      update: (vals: Record<string, unknown>) => ({
        eq: (_k: string, id: string) => { H.majs.push({ id, ...vals }); return Promise.resolve({ error: null }); },
      }),
      then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: lignes(), error: null }).then(ok),
    };
    // Le filtre « neq » n'est pas appliqué : s'il existait encore, le test le verrait
    // à travers le résultat, pas à travers le mock.
    return chain;
  }
  return { supabaseAdmin: { from } };
});

// La dérivation est la VRAIE : seule la lecture de la base est remplacée.
vi.mock("@/src/lib/paiementReservation", async () => {
  const vrai = await vi.importActual<typeof import("@/src/lib/paiementReservation")>("@/src/lib/paiementReservation");
  const deriver = (id: string) => {
    const r = H.reservations.find((x) => x.id === id)!;
    const f = H.factures[id];
    return vrai.deriverPaiement({
      prix: Number(r.montant_final ?? 0),
      regleeAutrement: false,
      pieces: f ? [{ id: `f-${id}`, type: "facture", statut: f.statut, lignesReservation: f.lignes, lignesTotal: f.lignes, paiements: f.paye }] : [],
      paiementsDirects: 0,
      tropPercuReverse: 0,
    });
  };
  return {
    ...vrai,
    recalculerPaiementReservation: async (id: string) => deriver(id),
    recalculerPaiementsReservations: async (ids: Iterable<string>) => new Map([...ids].map((id) => [id, deriver(id)])),
  };
});

vi.mock("@/src/lib/email", () => ({
  envoyerEmailRappelVeille: async () => {},
  envoyerEmailPaiement: async (x: unknown) => { H.emailsPaiement.push(x); },
  envoyerEmailRelancePaiement: async (x: unknown) => { H.emailsRelance.push(x); },
}));
vi.mock("@/src/lib/factureResa", () => ({ factureEmisePourReservation: async () => ({ id: "f", numero: "FAC-2026-0100" }) }));
vi.mock("@/src/lib/coordonneesPaiement", () => ({ getCoordonneesPaiement: async () => ({ iban: "CH00", titulaire: "La Dogosphère" }) }));
vi.mock("@/src/lib/journalEvenements", () => ({ tracerEvenement: async () => {} }));
vi.mock("@/src/lib/permissions", () => ({ idUtilisateurCourant: async () => "u1" }));
vi.mock("@/src/lib/supabase-server", () => ({ createSupabaseServerClient: async () => ({}) }));
vi.mock("@/src/lib/apiAuth", () => ({ exigerPermissionApi: async () => null }));

const { GET: cron } = await import("@/app/api/cron/rappel-veille/route");
const { POST: relancer } = await import("@/app/api/relances/route");

const dansJours = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
};

function sejour(id: string, over: Record<string, unknown> = {}) {
  return {
    id, numero: 1, type_reservation: "sejour", statut: "validee",
    date_debut: dansJours(14), date_fin: dansJours(20),
    montant_final: 250, montant_calcule: 250, montant_paye: 0,
    // Le drapeau enregistré MENT : la facture a été payée ailleurs.
    statut_paiement: "impaye",
    paiement_demande_le: null, offerte: false, relance_niveau: 0,
    clients: { prenom: "Test", email: "client@exemple.invalid" },
    ...over,
  };
}

beforeEach(() => {
  process.env.CRON_SECRET = "secret-de-test";
  H.reservations = [];
  H.factures = {};
  H.emailsPaiement.length = 0;
  H.emailsRelance.length = 0;
  H.majs.length = 0;
});

const appelCron = () => cron(new Request("http://x/api/cron/rappel-veille", {
  headers: { authorization: "Bearer secret-de-test" },
}) as never);

describe("demande de paiement à J-14", () => {
  it("une réservation dont la facture est payée ne reçoit aucune demande, même marquée « impayé »", async () => {
    H.reservations = [sejour("payee")];
    H.factures.payee = { lignes: 250, paye: 250, statut: "acquittee" };
    const rep = await appelCron();
    expect(rep.status).toBe(200);
    expect(H.emailsPaiement).toEqual([]);
  });

  it("une réservation vraiment impayée reçoit la demande, pour le reste dérivé", async () => {
    H.reservations = [sejour("partielle")];
    H.factures.partielle = { lignes: 250, paye: 100, statut: "partiellement_reglee" };
    await appelCron();
    expect(H.emailsPaiement).toHaveLength(1);
    expect((H.emailsPaiement[0] as { montant: number }).montant).toBe(150);
  });

  it("une facture annulée par avoir ne déclenche rien", async () => {
    H.reservations = [sejour("annulee")];
    H.factures.annulee = { lignes: 0, paye: 0, statut: "annulee_par_avoir" };
    await appelCron();
    expect(H.emailsPaiement).toEqual([]);
  });
});

describe("relance manuelle", () => {
  const appel = (id: string) => relancer(new Request("http://x/api/relances", {
    method: "POST",
    body: JSON.stringify({ reservation_id: id }),
    headers: { "content-type": "application/json" },
  }) as never);

  it("une réservation dont la facture est payée n'est pas relancée, même marquée « impayé »", async () => {
    // Séjour terminé depuis longtemps : une relance serait due si c'était impayé.
    H.reservations = [sejour("payee", { date_debut: dansJours(-80), date_fin: dansJours(-75) })];
    H.factures.payee = { lignes: 250, paye: 250, statut: "acquittee" };
    const rep = await appel("payee");
    expect(rep.status).toBe(400);
    expect(H.emailsRelance).toEqual([]);
  });

  it("une réservation impayée est relancée pour son reste dérivé", async () => {
    H.reservations = [sejour("due", { date_debut: dansJours(-80), date_fin: dansJours(-75) })];
    H.factures.due = { lignes: 250, paye: 50, statut: "partiellement_reglee" };
    const rep = await appel("due");
    expect(rep.status).toBe(200);
    expect(H.emailsRelance).toHaveLength(1);
    expect((H.emailsRelance[0] as { montant: number }).montant).toBe(200);
  });
});
