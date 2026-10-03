import { describe, it, expect, beforeEach, vi } from "vitest";
import { REFUS_TROIS_CHIENS } from "@/src/lib/abonnementsTypes";

/**
 * APP 72 — « 3 chiens ensemble » ne se vend plus, ni au client, ni par
 * l'équipe.
 *
 * Il n'existe qu'un chemin de CRÉATION d'une carte : la commande du client
 * (`commanderAbonnement`). L'équipe ne crée pas de carte : elle confirme le
 * paiement d'une carte commandée (`confirmerPaiementAbonnement`, fiche
 * client). Les deux appliquent la même règle (`refusCarte`). Les actions
 * réelles sont appelées ; la base et les gardes sont doublées.
 */

const H = vi.hoisted(() => ({
  chiens: [] as Record<string, unknown>[],
  carte: null as Record<string, unknown> | null,
  insertions: [] as { table: string; vals: unknown }[],
  majs: [] as { table: string; vals: unknown }[],
}));

vi.mock("@/src/lib/supabase-admin", () => {
  function from(table: string) {
    let op = "select";
    let vals: unknown = null;
    const chain: Record<string, unknown> = {
      select: () => chain, eq: () => chain, in: () => chain, or: () => chain, order: () => chain, limit: () => chain,
      insert: (v: unknown) => { op = "insert"; vals = v; H.insertions.push({ table, vals: v }); return chain; },
      update: (v: unknown) => { op = "update"; vals = v; H.majs.push({ table, vals: v }); return chain; },
      maybeSingle: () => Promise.resolve({
        data: table === "clients" ? { id: "client-1" } : table === "abonnements" ? H.carte : null,
        error: null,
      }),
      single: () => Promise.resolve({ data: { id: "x" }, error: null }),
      then: (ok: (v: unknown) => unknown) =>
        Promise.resolve({ data: table === "chiens" && op === "select" ? H.chiens : null, error: null, vals }).then(ok),
    };
    return chain;
  }
  return { supabaseAdmin: { from } };
});
vi.mock("@/src/lib/supabase-server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "auth-1" } } }) } }),
}));
vi.mock("@/src/utils/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/src/lib/membre", () => ({ estMembreActif: async () => true }));
vi.mock("@/src/lib/verifierPermission", () => ({ verifierPermission: async () => ({ userId: "u-equipe" }) }));
vi.mock("@/src/lib/journalEvenements", () => ({ tracerEvenement: async () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: (u: string) => { throw new Error(`REDIRECT ${u}`); } }));
vi.mock("resend", () => ({ Resend: class { emails = { send: async () => ({}) }; } }));

const { commanderAbonnement } = await import("@/app/(client)/mon-compte/actions");
const { confirmerPaiementAbonnement } = await import("@/app/(admin)/(espace-clients)/clients/[id]/actions");

const SOCIABLES = [
  { doit_etre_isole: false, actif: true },
  { doit_etre_isole: false, actif: true },
  { doit_etre_isole: false, actif: true },
];

beforeEach(() => {
  H.chiens = SOCIABLES;
  H.carte = null;
  H.insertions.length = 0;
  H.majs.length = 0;
});

describe("achat par le client", () => {
  it("« 3 chiens ensemble » est refusée, même avec trois chiens sociables, et rien n'est créé", async () => {
    expect(await commanderAbonnement("journee_partage_3")).toEqual({ error: REFUS_TROIS_CHIENS });
    expect(H.insertions.filter((i) => i.table === "abonnements")).toEqual([]);
  });

  it("une carte non éligible est refusée avec une phrase claire", async () => {
    H.chiens = [{ doit_etre_isole: true, actif: true }];
    expect(await commanderAbonnement("journee_partage_1"))
      .toEqual({ error: "Cette formule ne correspond pas au profil de vos chiens." });
  });
});

describe("vente par l'équipe (confirmation du paiement d'une carte commandée)", () => {
  it("une carte « 3 chiens ensemble » en attente ne s'active pas", async () => {
    H.carte = {
      id: "carte-1", client_id: "client-1", statut: "en_attente_paiement",
      jours_total: 11, categorie: "journee_partage_3", prix_paye: 1010,
    };
    expect(await confirmerPaiementAbonnement("carte-1", "cash")).toEqual({ error: REFUS_TROIS_CHIENS });
    expect(H.majs.filter((m) => m.table === "abonnements")).toEqual([]);
    expect(H.insertions.filter((i) => i.table === "abonnements_mouvements")).toEqual([]);
  });

  it("une carte DÉJÀ active n'est pas concernée : elle reste active, sans rien refaire", async () => {
    H.carte = { id: "carte-1", client_id: "client-1", statut: "actif", categorie: "journee_partage_3" };
    expect(await confirmerPaiementAbonnement("carte-1", "cash")).toEqual({ ok: true });
  });
});
