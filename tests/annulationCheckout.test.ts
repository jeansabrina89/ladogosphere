import { describe, it, expect, beforeEach, vi } from "vitest";
import { calculerLignesEcriture } from "@/src/lib/comptaResaLogique";

// Point 4 de l'audit : annuler un check-out rouvrait la réservation SANS
// resynchroniser la comptabilité — le produit restait reconnu au grand livre.

type Ligne = Record<string, unknown>;
type Maj = { id: unknown; vals: Ligne };
type Ctx = { table: string; filters: Record<string, string>; op: string | null; vals: Ligne | null };

const H = vi.hoisted(() => ({
  reservationDeLaLigne: "r1" as string | null,
  reservation: { abonnement_id: null } as { abonnement_id: string | null },
  checkinUpdates: [] as Maj[],
  reservationUpdates: [] as Maj[],
  syncResa: [] as unknown[][],
  syncAbo: [] as unknown[][],
  defige: [] as string[],
}));

vi.mock("@/src/lib/supabase-admin", () => {
  function from(table: string) {
    const ctx: Ctx = { table, filters: {}, op: null, vals: null };
    const chain = {
      select: () => chain,
      update: (vals: Ligne) => { ctx.op = "update"; ctx.vals = vals; return chain; },
      eq: (col: string, val: string) => { ctx.filters[col] = val; return chain; },
      single: () => Promise.resolve({
        data: table === "checkin_checkout" ? { reservation_id: H.reservationDeLaLigne } : null,
        error: null,
      }),
      maybeSingle: () => Promise.resolve({
        data: table === "reservations" ? H.reservation : null,
        error: null,
      }),
      then: <T,>(onF: (v: { error: null }) => T) => {
        if (ctx.op === "update") {
          const maj = { id: ctx.filters.id, vals: ctx.vals ?? {} };
          if (table === "checkin_checkout") H.checkinUpdates.push(maj);
          if (table === "reservations") H.reservationUpdates.push(maj);
        }
        return Promise.resolve({ error: null }).then(onF);
      },
    };
    return chain;
  }
  return { supabaseAdmin: { from } };
});

vi.mock("@/src/lib/factureResa", () => ({
  figerFactureResa: () => Promise.resolve(),
  defigerFactureResa: (id: string) => { H.defige.push(id); return Promise.resolve(); },
}));
vi.mock("@/src/lib/comptaResa", () => ({
  synchroniserComptaResa: (...a: unknown[]) => { H.syncResa.push(a); return Promise.resolve(); },
}));
vi.mock("@/src/lib/comptaAbonnement", () => ({
  synchroniserComptaAbonnement: (...a: unknown[]) => { H.syncAbo.push(a); return Promise.resolve(); },
}));
vi.mock("@/src/lib/email", () => ({ envoyerEmailResultatEssai: () => Promise.resolve() }));

import { annulerCheckout } from "@/src/lib/checkinCheckout";

beforeEach(() => {
  H.reservationDeLaLigne = "r1";
  H.reservation = { abonnement_id: null };
  H.checkinUpdates.length = 0;
  H.reservationUpdates.length = 0;
  H.syncResa.length = 0;
  H.syncAbo.length = 0;
  H.defige.length = 0;
});

describe("annulerCheckout resynchronise la comptabilité", () => {
  it("la réservation repasse en validee, la facture est défigée ET la compta resynchronisée", async () => {
    const res = await annulerCheckout("ck1");
    expect(res.error).toBeUndefined();

    expect(H.checkinUpdates[0].vals.statut).toBe("arrive");
    expect(H.reservationUpdates[0].vals.statut).toBe("validee");
    expect(H.defige).toEqual(["r1"]);
    expect(H.syncResa.map((a) => a[0])).toEqual(["r1"]);
  });

  it("l'abonnement éventuel est resynchronisé en plus, pas à la place", async () => {
    H.reservation = { abonnement_id: "a1" };
    await annulerCheckout("ck1");
    expect(H.syncResa.map((a) => a[0])).toEqual(["r1"]);
    expect(H.syncAbo.map((a) => a[0])).toEqual(["a1"]);
  });

  it("ligne de check-in sans réservation : rien n'est resynchronisé", async () => {
    H.reservationDeLaLigne = null;
    await annulerCheckout("ck1");
    expect(H.syncResa).toHaveLength(0);
    expect(H.defige).toHaveLength(0);
  });
});

describe("le grand livre revient bien à l'état « acompte »", () => {
  const resa = { type_reservation: "sejour", montant_final: 200, montant_calcule: 200 };
  const paiements = [{ mode: "cash", montant: 200 }];

  // 1) Au check-out : le séjour est terminé, le produit est reconnu.
  const auCheckout = calculerLignesEcriture({ ...resa, statut: "terminee" }, paiements, []);
  const dejaPosees = auCheckout.map((l) => ({ compte_numero: l.compte, debit: l.debit, credit: l.credit }));

  it("au check-out : caisse au débit, produit 3000 au crédit, pas d'acompte", () => {
    const parCompte = Object.fromEntries(auCheckout.map((l) => [l.compte, l]));
    expect(parCompte["1000"]).toEqual({ compte: "1000", debit: 200, credit: 0 });
    expect(parCompte["3000"]).toEqual({ compte: "3000", debit: 0, credit: 200 });
    expect(parCompte["2030"]).toBeUndefined();
  });

  it("après annulation du check-out : le produit est repris, le versement redevient un acompte (2030)", () => {
    const apresAnnulation = calculerLignesEcriture(
      { ...resa, statut: "validee" },
      paiements,
      dejaPosees,
    );
    const parCompte = Object.fromEntries(apresAnnulation.map((l) => [l.compte, l]));

    // Le produit reconnu est contre-passé…
    expect(parCompte["3000"]).toEqual({ compte: "3000", debit: 200, credit: 0 });
    // …et bascule en dette d'acompte envers le client.
    expect(parCompte["2030"]).toEqual({ compte: "2030", debit: 0, credit: 200 });
    // La caisse ne bouge pas : l'argent est toujours là.
    expect(parCompte["1000"]).toBeUndefined();
  });

  it("l'état final est celui d'un simple acompte, comme si le séjour n'avait jamais été clôturé", () => {
    const apresAnnulation = calculerLignesEcriture({ ...resa, statut: "validee" }, paiements, dejaPosees);
    const solde: Record<string, number> = {};
    for (const l of [...dejaPosees.map((l) => ({ compte: l.compte_numero, debit: l.debit, credit: l.credit })), ...apresAnnulation]) {
      solde[l.compte] = Math.round(((solde[l.compte] ?? 0) + l.debit - l.credit) * 100) / 100;
    }
    const attendu = calculerLignesEcriture({ ...resa, statut: "validee" }, paiements, []);
    const soldeAttendu: Record<string, number> = {};
    for (const l of attendu) {
      soldeAttendu[l.compte] = Math.round(((soldeAttendu[l.compte] ?? 0) + l.debit - l.credit) * 100) / 100;
    }
    for (const compte of new Set([...Object.keys(solde), ...Object.keys(soldeAttendu)])) {
      expect(solde[compte] ?? 0).toBe(soldeAttendu[compte] ?? 0);
    }
  });
});
