import { describe, it, expect, beforeEach, vi } from "vitest";
import { calculerLignesCotisation } from "@/src/lib/comptaCotisationLogique";

type L = { compte: string; debit: number; credit: number };
const parCompte = (lignes: L[]) => Object.fromEntries(lignes.map((l) => [l.compte, l]));

describe("calculerLignesCotisation — adhésion payée directement (3005)", () => {
  it("payée cash → débit 1000 + crédit 3005", () => {
    const m = parCompte(calculerLignesCotisation({ statut: "payee", mode_paiement: "cash", montant: 200 }, []));
    expect(m["1000"].debit).toBe(200);
    expect(m["3005"].credit).toBe(200);
  });

  it("payée virement → débit 1020", () => {
    const m = parCompte(calculerLignesCotisation({ statut: "payee", mode_paiement: "virement", montant: 200 }, []));
    expect(m["1020"].debit).toBe(200);
    expect(m["3005"].credit).toBe(200);
  });

  it("payée twint → débit 1021", () => {
    const m = parCompte(calculerLignesCotisation({ statut: "payee", mode_paiement: "twint", montant: 200 }, []));
    expect(m["1021"].debit).toBe(200);
    expect(m["3005"].credit).toBe(200);
  });

  it("en attente → aucune écriture", () => {
    expect(calculerLignesCotisation({ statut: "en_attente", mode_paiement: "virement", montant: 200 }, [])).toEqual([]);
  });

  it("payée mais mode non liquide (prochaine_resa) → aucune écriture", () => {
    expect(calculerLignesCotisation({ statut: "payee", mode_paiement: "prochaine_resa", montant: 200 }, [])).toEqual([]);
  });

  it("idempotence : rejoué avec les lignes déjà posées → delta vide", () => {
    const deja = [
      { compte_numero: "1020", debit: 200, credit: 0 },
      { compte_numero: "3005", debit: 0, credit: 200 },
    ];
    expect(calculerLignesCotisation({ statut: "payee", mode_paiement: "virement", montant: 200 }, deja)).toEqual([]);
  });

  it("annulation (retour en_attente) → contre-passation des lignes posées", () => {
    const deja = [
      { compte_numero: "1020", debit: 200, credit: 0 },
      { compte_numero: "3005", debit: 0, credit: 200 },
    ];
    const m = parCompte(calculerLignesCotisation({ statut: "en_attente", mode_paiement: "virement", montant: 200 }, deja));
    expect(m["1020"].credit).toBe(200);
    expect(m["3005"].debit).toBe(200);
  });
});

// ── IO : garde anti-doublon + branchement passer_ecriture ────────────────────

const H = vi.hoisted(() => ({ cotis: null as any, rpcCalls: [] as any[] }));

vi.mock("@sentry/nextjs", () => ({ captureException: () => {} }));
vi.mock("@/src/lib/supabase-admin", () => {
  function from(table: string) {
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: () => Promise.resolve({ data: table === "cotisations_membres" ? H.cotis : null, error: null }),
      then: (onF: any) => Promise.resolve({ data: [], error: null }).then(onF), // ecritures_lignes
    };
    return chain;
  }
  const rpc = (name: string, params: any) => { H.rpcCalls.push({ name, params }); return Promise.resolve({ error: null }); };
  return { supabaseAdmin: { from, rpc } };
});

import { synchroniserComptaCotisation } from "@/src/lib/comptaCotisation";

describe("synchroniserComptaCotisation — garde anti-doublon", () => {
  beforeEach(() => { H.rpcCalls.length = 0; H.cotis = null; });

  it("liée à une réservation (reservation_id) → aucune écriture (comptabilisée via la résa)", async () => {
    H.cotis = { statut: "payee", mode_paiement: "cash", montant: 200, reservation_id: "r1", date_paiement: "2026-06-01" };
    await synchroniserComptaCotisation("cot1");
    expect(H.rpcCalls).toHaveLength(0);
  });

  it("payée directement (cash, sans résa) → passer_ecriture avec 1000 + 3005", async () => {
    H.cotis = { statut: "payee", mode_paiement: "cash", montant: 200, reservation_id: null, date_paiement: "2026-06-01" };
    await synchroniserComptaCotisation("cot2");
    expect(H.rpcCalls).toHaveLength(1);
    const p = H.rpcCalls[0].params;
    expect(p.p_piece_type).toBe("cotisation");
    expect(p.p_piece_id).toBe("cot2");
    const m = parCompte(p.p_lignes);
    expect(m["1000"].debit).toBe(200);
    expect(m["3005"].credit).toBe(200);
  });

  it("mode prochaine_resa → aucune écriture", async () => {
    H.cotis = { statut: "payee", mode_paiement: "prochaine_resa", montant: 200, reservation_id: null, date_paiement: null };
    await synchroniserComptaCotisation("cot3");
    expect(H.rpcCalls).toHaveLength(0);
  });
});
