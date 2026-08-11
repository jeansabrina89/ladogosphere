import { describe, it, expect, beforeEach, vi } from "vitest";

// État partagé + fixtures (hoisté avant les imports mockés).
const H = vi.hoisted(() => {
  const reservationsMap: Record<string, any> = {
    r1: { id: "r1", client_id: "c1", statut: "validee", montant_final: 100, montant_calcule: 100, ajustement_manuel: 0, montant_paye: 0 },
    r2: { id: "r2", client_id: "c1", statut: "validee", montant_final: 50, montant_calcule: 50, ajustement_manuel: 0, montant_paye: 0 },
    r0: { id: "r0", client_id: "c1", statut: "validee", montant_final: 0, montant_calcule: 0, ajustement_manuel: 0, montant_paye: 0 },
  };
  const facturesMap: Record<string, any> = {
    f1: {
      id: "f1", statut: "envoyee", montant_total: 150,
      facture_reservations: [
        { reservation_id: "r1", reservations: reservationsMap.r1 },
        { reservation_id: "r2", reservations: reservationsMap.r2 },
      ],
    },
    f0: {
      id: "f0", statut: "envoyee", montant_total: 0,
      facture_reservations: [
        { reservation_id: "r0", reservations: reservationsMap.r0 },
      ],
    },
  };
  return {
    reservationsMap,
    facturesMap,
    paiementsResaInserts: [] as any[],
    reservationUpdates: [] as any[],
    factureUpdates: [] as any[],
    syncCalls: [] as any[],
  };
});

vi.mock("@/src/lib/supabase-admin", () => {
  function resolveSingle(ctx: any) {
    if (ctx.table === "factures") return H.facturesMap[ctx.filters.id] ?? null;
    if (ctx.table === "reservations") return H.reservationsMap[ctx.filters.id] ?? null;
    return null;
  }
  function from(table: string) {
    const ctx: any = { table, filters: {}, op: null as string | null, vals: null as any };
    const chain: any = {
      select: () => chain,
      insert: (rows: any) => {
        const arr = Array.isArray(rows) ? rows : [rows];
        if (table === "paiements_resa") H.paiementsResaInserts.push(...arr);
        return Promise.resolve({ error: null });
      },
      update: (vals: any) => { ctx.op = "update"; ctx.vals = vals; return chain; },
      eq: (col: string, val: any) => { ctx.filters[col] = val; return chain; },
      single: () => Promise.resolve({ data: resolveSingle(ctx), error: null }),
      maybeSingle: () => Promise.resolve({ data: resolveSingle(ctx), error: null }),
      // Terminal pour update().eq() (awaité sans single).
      then: (onF: any) => {
        if (ctx.op === "update") {
          if (table === "reservations") H.reservationUpdates.push({ id: ctx.filters.id, vals: ctx.vals });
          if (table === "factures") H.factureUpdates.push({ id: ctx.filters.id, vals: ctx.vals });
        }
        return Promise.resolve({ error: null }).then(onF);
      },
    };
    return chain;
  }
  return { supabaseAdmin: { from } };
});

vi.mock("@/src/lib/comptaResa", () => ({
  synchroniserComptaResa: (...args: any[]) => { H.syncCalls.push(args); return Promise.resolve(); },
}));
vi.mock("@/src/lib/avoirs", () => ({
  getAvoirAppliqueReservation: () => Promise.resolve(0),
  getSoldeAvoir: () => Promise.resolve(0),
}));
vi.mock("@/src/lib/verifierPermission", () => ({
  verifierPermission: () => Promise.resolve({ userId: "u1" }),
}));
vi.mock("@/src/lib/getProfilePerms", () => ({ getProfilePerms: () => Promise.resolve({}) }));
vi.mock("@/src/lib/supabase-server", () => ({ createSupabaseServerClient: () => Promise.resolve({}) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: () => {} }));

// Import APRÈS les mocks. La SUT route chaque réservation vers le vrai
// enregistrerPaiement (paiements_resa + synchroniserComptaResa).
import { marquerFactureReglee } from "@/app/(admin)/factures/[id]/actions";

describe("marquerFactureReglee — chaque réservation passe par le chemin comptable", () => {
  beforeEach(() => {
    H.paiementsResaInserts.length = 0;
    H.reservationUpdates.length = 0;
    H.factureUpdates.length = 0;
    H.syncCalls.length = 0;
    // Réinitialiser les montants payés (mutés par les updates simulés indirects).
    H.reservationsMap.r1.montant_paye = 0;
    H.reservationsMap.r2.montant_paye = 0;
  });

  it("règle une facture de 2 réservations : 1 ligne paiements_resa + 1 sync par réservation, facture acquittée", async () => {
    const res = await marquerFactureReglee("f1", "cash");
    expect(res.error).toBeUndefined();

    // Une ligne paiements_resa par réservation, avec la clé d'idempotence facture+résa.
    expect(H.paiementsResaInserts).toHaveLength(2);
    const parResa = Object.fromEntries(H.paiementsResaInserts.map((p) => [p.reservation_id, p]));
    expect(parResa.r1.montant).toBe(100);
    expect(parResa.r2.montant).toBe(50);
    expect(parResa.r1.mode).toBe("cash");
    expect(parResa.r1.cle_idempotence).toBe("facture:f1:resa:r1");
    expect(parResa.r2.cle_idempotence).toBe("facture:f1:resa:r2");

    // synchroniserComptaResa invoqué une fois par réservation.
    expect(H.syncCalls).toHaveLength(2);
    expect(H.syncCalls.map((a) => a[0]).sort()).toEqual(["r1", "r2"]);

    // Facture acquittée après le règlement de toutes les réservations.
    const majFacture = H.factureUpdates.find((u) => u.id === "f1");
    expect(majFacture?.vals.statut).toBe("acquittee");
    expect(majFacture?.vals.montant_restant).toBe(0);
  });

  it("garde-fou : réservation à 0 CHF → erreur, aucune écriture, facture NON acquittée", async () => {
    const res = await marquerFactureReglee("f0", "virement");
    expect(res.error).toBeTruthy();
    expect(H.paiementsResaInserts).toHaveLength(0);
    expect(H.syncCalls).toHaveLength(0);
    expect(H.factureUpdates.find((u) => u.id === "f0")).toBeUndefined();
  });
});
