import { describe, it, expect, beforeEach, vi } from "vitest";

// Corrections de la phase 0 de l'audit comptable, vérifiées sur le vrai code :
//  - le client d'un paiement est lu sur la réservation, jamais reçu du navigateur ;
//  - un double clic sur « Marquer payé » n'enregistre qu'un paiement ;
//  - marquerFactureReglee refuse de rejouer une facture déjà acquittée ;
//  - la date de paiement est bornée (pièce ≤ date ≤ aujourd'hui, exercice ouvert).

const AUJOURDHUI = new Date().toISOString().split("T")[0];
const ANNEE = Number(AUJOURDHUI.slice(0, 4));

type Ligne = Record<string, unknown>;
type Maj = { id: unknown; vals: Ligne };
type Ctx = { table: string; filters: Record<string, string>; op: string | null; vals: Ligne | null };

const H = vi.hoisted(() => ({
  reservationsMap: {} as Record<string, Record<string, unknown>>,
  facturesMap: {} as Record<string, Record<string, unknown>>,
  exercices: [] as { annee: number; statut: string }[],
  paiementsResaInserts: [] as Record<string, unknown>[],
  clesVues: new Set<string>(),
  reservationUpdates: [] as Maj[],
  factureUpdates: [] as Maj[],
  syncCalls: [] as unknown[][],
}));

vi.mock("@/src/lib/supabase-admin", () => {
  function resolveSingle(ctx: Ctx): Ligne | null {
    // Copie : la SUT relit la ligne AVANT de la mettre à jour, elle ne doit pas
    // voir ses propres écritures à travers la même référence d'objet.
    const src =
      ctx.table === "factures" ? H.facturesMap[ctx.filters.id]
      : ctx.table === "reservations" ? H.reservationsMap[ctx.filters.id]
      : null;
    return src ? { ...src } : null;
  }
  function from(table: string) {
    const ctx: Ctx = { table, filters: {}, op: null, vals: null };
    const chain = {
      select: () => chain,
      insert: (rows: Ligne | Ligne[]) => {
        const arr = Array.isArray(rows) ? rows : [rows];
        if (table === "paiements_resa") {
          for (const r of arr) {
            // Reproduit l'index unique (reservation_id, cle_idempotence).
            const cle = r.cle_idempotence ? `${r.reservation_id}|${r.cle_idempotence}` : null;
            if (cle && H.clesVues.has(cle)) {
              return Promise.resolve({ error: { code: "23505", message: "duplicate key" } });
            }
            if (cle) H.clesVues.add(cle);
            H.paiementsResaInserts.push(r);
          }
        }
        return Promise.resolve({ error: null });
      },
      update: (vals: Ligne) => { ctx.op = "update"; ctx.vals = vals; return chain; },
      eq: (col: string, val: string) => { ctx.filters[col] = val; return chain; },
      order: () => {
        const rows = table === "exercices"
          ? H.exercices.filter((e) => e.statut === (ctx.filters.statut ?? e.statut))
          : [];
        return Promise.resolve({ data: rows, error: null });
      },
      single: () => Promise.resolve({ data: resolveSingle(ctx), error: null }),
      maybeSingle: () => Promise.resolve({ data: resolveSingle(ctx), error: null }),
      then: <T,>(onF: (v: { error: null }) => T) => {
        if (ctx.op === "update") {
          if (table === "reservations") {
            H.reservationUpdates.push({ id: ctx.filters.id, vals: ctx.vals ?? {} });
            const r = H.reservationsMap[ctx.filters.id];
            if (r) Object.assign(r, ctx.vals);
          }
          if (table === "factures") {
            H.factureUpdates.push({ id: ctx.filters.id, vals: ctx.vals ?? {} });
            const f = H.facturesMap[ctx.filters.id];
            if (f) Object.assign(f, ctx.vals);
          }
        }
        return Promise.resolve({ error: null }).then(onF);
      },
    };
    return chain;
  }
  return { supabaseAdmin: { from } };
});

vi.mock("@/src/lib/comptaResa", () => ({
  synchroniserComptaResa: (...args: unknown[]) => { H.syncCalls.push(args); return Promise.resolve(); },
}));
vi.mock("@/src/lib/comptaAvoir", () => ({
  synchroniserComptaAvoir: () => Promise.resolve(),
  contrePasserComptaAvoir: () => Promise.resolve(),
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
vi.mock("@/src/lib/factureResa", () => ({
  rafraichirFactureBrouillon: () => Promise.resolve(),
  creerOuMajFactureBrouillon: () => Promise.resolve(),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: () => {} }));

import { enregistrerPaiement } from "@/app/(admin)/reservations/[id]/actions";
import { marquerFactureReglee } from "@/app/(admin)/factures/[id]/actions";

function resetEtat() {
  H.reservationsMap.r1 = {
    id: "r1", client_id: "c1", created_at: `${ANNEE}-01-05T09:00:00Z`,
    statut: "validee", montant_final: 100, montant_calcule: 100,
    ajustement_manuel: 0, montant_paye: 0,
  };
  H.reservationsMap.r2 = {
    id: "r2", client_id: "c1", created_at: `${ANNEE}-01-05T09:00:00Z`,
    statut: "validee", montant_final: 50, montant_calcule: 50,
    ajustement_manuel: 0, montant_paye: 0,
  };
  H.facturesMap.f1 = {
    id: "f1", statut: "envoyee", montant_total: 150,
    facture_reservations: [
      { reservation_id: "r1", reservations: H.reservationsMap.r1 },
      { reservation_id: "r2", reservations: H.reservationsMap.r2 },
    ],
  };
  H.exercices.length = 0;
  H.exercices.push({ annee: ANNEE - 1, statut: "ouvert" }, { annee: ANNEE, statut: "ouvert" });
  H.paiementsResaInserts.length = 0;
  H.clesVues.clear();
  H.reservationUpdates.length = 0;
  H.factureUpdates.length = 0;
  H.syncCalls.length = 0;
}

function fdPaiement(over: Record<string, string> = {}) {
  const fd = new FormData();
  fd.set("reservation_id", "r1");
  fd.set("montant_paye", "100");
  fd.set("date_paiement", AUJOURDHUI);
  fd.set("mode_paiement", "cash");
  for (const [k, v] of Object.entries(over)) fd.set(k, v);
  return fd;
}

beforeEach(resetEtat);

describe("le client d'un paiement vient du serveur", () => {
  it("le client_id enregistré est celui de la réservation", async () => {
    const res = await enregistrerPaiement(fdPaiement());
    expect(res.error).toBeUndefined();
    expect(H.paiementsResaInserts).toHaveLength(1);
    expect(H.paiementsResaInserts[0].client_id).toBe("c1");
  });

  it("un client_id envoyé par le navigateur est ignoré", async () => {
    const res = await enregistrerPaiement(fdPaiement({ client_id: "client-usurpe" }));
    expect(res.error).toBeUndefined();
    expect(H.paiementsResaInserts[0].client_id).toBe("c1");
  });

  it("réservation sans client : paiement refusé", async () => {
    H.reservationsMap.r1.client_id = null;
    const res = await enregistrerPaiement(fdPaiement());
    expect(res.error).toContain("sans client");
    expect(H.paiementsResaInserts).toHaveLength(0);
  });
});

describe("paiement rapide : idempotent", () => {
  const cle = ["r1", "100", AUJOURDHUI, "cash"].join(":");

  it("un double clic n'enregistre qu'un seul paiement", async () => {
    const un = await enregistrerPaiement(fdPaiement(), cle);
    expect(un.error).toBeUndefined();
    // Deuxième clic : même clé, la réservation est déjà à 100.
    H.reservationsMap.r1.montant_paye = 100;
    const deux = await enregistrerPaiement(fdPaiement(), cle);
    expect(deux.error).toBeUndefined();
    expect(H.paiementsResaInserts).toHaveLength(1);
  });

  it("le conflit d'unicité est traité comme un succès, pas comme une erreur", async () => {
    await enregistrerPaiement(fdPaiement(), cle);
    // On rejoue en repartant d'un montant payé nul : l'insert entre en conflit.
    H.reservationsMap.r1.montant_paye = 0;
    const rejeu = await enregistrerPaiement(fdPaiement(), cle);
    expect(rejeu.error).toBeUndefined();
    expect(H.paiementsResaInserts).toHaveLength(1);
  });

  it("sans clé, deux paiements distincts restent possibles", async () => {
    await enregistrerPaiement(fdPaiement({ montant_paye: "40" }));
    await enregistrerPaiement(fdPaiement({ montant_paye: "100" }));
    expect(H.paiementsResaInserts).toHaveLength(2);
  });
});

describe("bornes de la date de paiement", () => {
  it("une date dans le futur est refusée", async () => {
    const demain = new Date(Date.now() + 86400000).toISOString().split("T")[0];
    const res = await enregistrerPaiement(fdPaiement({ date_paiement: demain }));
    expect(res.error).toContain("futur");
    expect(H.paiementsResaInserts).toHaveLength(0);
  });

  it("une date antérieure à la réservation est refusée", async () => {
    const res = await enregistrerPaiement(fdPaiement({ date_paiement: `${ANNEE}-01-04` }));
    expect(res.error).toContain("antérieure");
    expect(H.paiementsResaInserts).toHaveLength(0);
  });

  it("une date dans un exercice clôturé est refusée", async () => {
    H.reservationsMap.r1.created_at = `${ANNEE - 1}-01-05T09:00:00Z`;
    H.exercices.splice(0, H.exercices.length, { annee: ANNEE, statut: "ouvert" });
    const res = await enregistrerPaiement(fdPaiement({ date_paiement: `${ANNEE - 1}-06-01` }));
    expect(res.error).toContain("clôturé");
    expect(H.paiementsResaInserts).toHaveLength(0);
  });

  it("une date valide passe et rien n'est refusé au passage", async () => {
    const res = await enregistrerPaiement(fdPaiement({ date_paiement: `${ANNEE}-01-05` }));
    expect(res.error).toBeUndefined();
    expect(H.paiementsResaInserts).toHaveLength(1);
  });
});

describe("marquerFactureReglee : idempotent", () => {
  it("un premier règlement acquitte la facture", async () => {
    const res = await marquerFactureReglee("f1", "cash");
    expect(res.error).toBeUndefined();
    expect(H.facturesMap.f1.statut).toBe("acquittee");
    expect(H.paiementsResaInserts).toHaveLength(2);
  });

  it("rejouer la même facture est refusé et n'écrit rien de plus", async () => {
    await marquerFactureReglee("f1", "cash");
    const nbPaiements = H.paiementsResaInserts.length;

    const rejeu = await marquerFactureReglee("f1", "cash");
    expect(rejeu.error).toContain("déjà acquittée");
    expect(H.paiementsResaInserts).toHaveLength(nbPaiements);
  });

  it("une facture annulée ne peut pas être réglée", async () => {
    H.facturesMap.f1.statut = "annulee";
    const res = await marquerFactureReglee("f1", "cash");
    expect(res.error).toContain("annulée");
    expect(H.paiementsResaInserts).toHaveLength(0);
  });

  it("les clés d'idempotence portent la facture et la réservation", async () => {
    await marquerFactureReglee("f1", "virement");
    expect(H.paiementsResaInserts.map((p) => p.cle_idempotence).sort()).toEqual([
      "facture:f1:resa:r1",
      "facture:f1:resa:r2",
    ]);
  });
});
