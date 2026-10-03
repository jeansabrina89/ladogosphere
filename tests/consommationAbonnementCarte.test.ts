import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * APP 72 — quelle carte une journée de garderie débite-t-elle ?
 *
 * La règle voulue : celle du TARIF réellement appliqué à la réservation
 * (journee_partage_1 / _2 / _privatif, selon calculTarif), et non une
 * déduction séparée à partir de « doit être isolé ».
 *
 * L'action réelle `consommerAbonnementResa` est appelée. Seuls la base, la
 * cohabitation des chiens et la comptabilité sont doublées : ce qu'on
 * vérifie, c'est la carte DÉBITÉE.
 */

type Carte = { id: string; categorie: string; jours: number };

const H = vi.hoisted(() => ({
  chienIds: [] as string[],
  cohabitation: [] as Record<string, unknown>[],
  cartes: [] as { id: string; categorie: string; jours: number }[],
  debits: [] as { abonnement_id: string; delta: number }[],
  majResa: [] as Record<string, unknown>[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/src/lib/supabase-admin", () => {
  function from(table: string) {
    const filtres: Record<string, unknown> = {};
    let op: "select" | "insert" | "update" = "select";
    let vals: Record<string, unknown> = {};
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (c: string, v: unknown) => { filtres[c] = v; return chain; },
      or: () => chain,
      insert: (v: Record<string, unknown>) => { op = "insert"; vals = v; return chain; },
      update: (v: Record<string, unknown>) => { op = "update"; vals = v; return chain; },
      maybeSingle: () => Promise.resolve({
        data: table === "reservations"
          ? {
              id: "resa-1", client_id: "client-1", type_reservation: "journee", statut: "validee",
              abonnement_id: null, reservation_chiens: H.chienIds.map((chien_id) => ({ chien_id })),
            }
          : null,
        error: null,
      }),
      then: (ok: (v: unknown) => unknown) => {
        if (table === "abonnements_mouvements" && op === "insert") {
          H.debits.push({ abonnement_id: vals.abonnement_id as string, delta: vals.delta as number });
        }
        if (table === "reservations" && op === "update") H.majResa.push(vals);
        const data = table === "abonnements" && op === "select"
          ? H.cartes
              .filter((c) => c.categorie === filtres.categorie)
              .map((c) => ({
                id: c.id, statut: "actif", date_expiration: null,
                abonnements_mouvements: [{ delta: c.jours }],
              }))
          : null;
        return Promise.resolve({ data, error: null }).then(ok);
      },
    };
    return chain;
  }
  return { supabaseAdmin: { from } };
});
vi.mock("@/src/lib/cohabitationDb", () => ({ lireCohabitationChiens: async () => H.cohabitation }));
vi.mock("@/src/lib/comptaAbonnement", () => ({ synchroniserComptaAbonnement: async () => {} }));
vi.mock("@/src/lib/abonnementCompta", () => ({ synchroniserProduitAbonnement: async () => {} }));
vi.mock("@/src/lib/paiementReservation", () => ({ recalculerPaiementReservation: async () => {} }));

const { consommerAbonnementResa } = await import("@/src/lib/consommationAbonnement");

const CARTE_SOCIABLE: Carte = { id: "carte-sociable", categorie: "journee_partage_1", jours: 11 };
const CARTE_SEUL: Carte = { id: "carte-seul", categorie: "journee_privatif", jours: 11 };
const CARTE_DEUX: Carte = { id: "carte-deux", categorie: "journee_partage_2", jours: 11 };
const ANCIENNE_TROIS: Carte = { id: "carte-trois", categorie: "journee_partage_3", jours: 4 };

const chien = (id: string, p: Record<string, unknown> = {}) => ({ id, client_id: "client-1", doit_etre_isole: false, ...p });

function scenario(chiens: Record<string, unknown>[], cartes: Carte[]) {
  H.chienIds = chiens.map((c) => c.id as string);
  H.cohabitation = chiens;
  H.cartes = cartes;
}

beforeEach(() => {
  H.debits.length = 0;
  H.majResa.length = 0;
});

describe("la carte débitée est celle du tarif appliqué", () => {
  it("chien sociable en box seul (« famille uniquement », venu seul : tarif privatif) → « 1 chien seul »", async () => {
    // Avant APP 72 : « doit être isolé » étant faux, c'est la carte
    // « 1 chien sociable » (35.–) qui payait une journée facturée 70.–.
    scenario([chien("a", { famille_uniquement: true })], [CARTE_SOCIABLE, CARTE_SEUL]);
    expect(await consommerAbonnementResa("resa-1", "client-1")).toEqual({ ok: true });
    expect(H.debits).toEqual([{ abonnement_id: "carte-seul", delta: -1 }]);
  });

  it("chien sociable en partagé → « 1 chien sociable », PAS « 1 chien seul » même s'il a les deux cartes", async () => {
    scenario([chien("a")], [CARTE_SEUL, CARTE_SOCIABLE]);
    expect(await consommerAbonnementResa("resa-1", "client-1")).toEqual({ ok: true });
    expect(H.debits).toEqual([{ abonnement_id: "carte-sociable", delta: -1 }]);
  });

  it("chien isolé → « 1 chien seul »", async () => {
    scenario([chien("a", { doit_etre_isole: true })], [CARTE_SOCIABLE, CARTE_SEUL]);
    await consommerAbonnementResa("resa-1", "client-1");
    expect(H.debits).toEqual([{ abonnement_id: "carte-seul", delta: -1 }]);
  });

  it("deux chiens « famille » gardés ensemble (tarif 2 chiens) → « 2 chiens ensemble »", async () => {
    scenario(
      [chien("a", { famille_uniquement: true }), chien("b", { famille_uniquement: true })],
      [CARTE_SEUL, CARTE_DEUX],
    );
    await consommerAbonnementResa("resa-1", "client-1");
    expect(H.debits).toEqual([{ abonnement_id: "carte-deux", delta: -1 }]);
  });

  it("3 chiens ensemble, sans ancienne carte → AUCUN débit : la journée reste au tarif normal", async () => {
    scenario([chien("a"), chien("b"), chien("c")], [CARTE_SOCIABLE, CARTE_DEUX, CARTE_SEUL]);
    const r = await consommerAbonnementResa("resa-1", "client-1");
    expect(r.error).toBe("Aucune carte disponible pour cette reservation.");
    expect(H.debits).toEqual([]);
    expect(H.majResa).toEqual([]);
  });

  it("3 chiens ensemble, avec une ANCIENNE carte « 3 chiens ensemble » → elle est débitée", async () => {
    scenario([chien("a"), chien("b"), chien("c")], [CARTE_DEUX, ANCIENNE_TROIS]);
    expect(await consommerAbonnementResa("resa-1", "client-1")).toEqual({ ok: true });
    expect(H.debits).toEqual([{ abonnement_id: "carte-trois", delta: -1 }]);
    expect(H.majResa[0]).toMatchObject({ abonnement_id: "carte-trois", mode_paiement: "abonnement" });
  });
});
