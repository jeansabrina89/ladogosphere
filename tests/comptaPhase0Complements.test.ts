import { describe, it, expect, beforeEach, vi } from "vitest";

// Compléments de la phase 0 :
//  - garde-fou de suppression : le lien facture passe par facture_reservations ;
//  - traçabilité : passer_ecriture reçoit created_by ;
//  - resynchronisation comptable : réservée à l'admin.

type Ligne = Record<string, unknown>;
type Ctx = { table: string; filters: Record<string, string>; op: string | null; vals: Ligne | null };

const H = vi.hoisted(() => ({
  reservation: {} as Record<string, unknown>,
  lignesFacture: [] as { facture_annulee: boolean }[],
  comptesLignes: [] as { compte_numero: string; debit: number; credit: number }[],
  paiements: [] as { mode: string; montant: number }[],
  compteurs: {} as Record<string, number>,
  suppressions: [] as string[],
  rpcAppels: [] as { nom: string; args: Record<string, unknown> }[],
  roleCourant: "admin" as string,
}));

vi.mock("@/src/lib/supabase-admin", () => {
  function from(table: string) {
    const ctx: Ctx = { table, filters: {}, op: null, vals: null };
    const resultat = () => {
      if (table === "facture_reservations") return { data: H.lignesFacture, count: H.lignesFacture.length };
      if (table === "ecritures_lignes") return { data: H.comptesLignes, count: H.comptesLignes.length };
      if (table === "paiements_resa") return { data: H.paiements, count: H.compteurs.paiements_resa ?? 0 };
      return { data: [], count: H.compteurs[table] ?? 0 };
    };
    const chain = {
      select: () => chain,
      delete: () => { ctx.op = "delete"; return chain; },
      update: (vals: Ligne) => { ctx.op = "update"; ctx.vals = vals; return chain; },
      eq: (col: string, val: string) => { ctx.filters[col] = val; return chain; },
      single: () => Promise.resolve({
        data: table === "reservations" ? H.reservation : null,
        error: null,
      }),
      maybeSingle: () => Promise.resolve({
        data: table === "reservations" ? H.reservation : null,
        error: null,
      }),
      then: <T,>(onF: (v: { data: unknown; count: number; error: null }) => T) => {
        if (ctx.op === "delete") H.suppressions.push(table);
        const r = resultat();
        return Promise.resolve({ data: r.data, count: r.count, error: null }).then(onF);
      },
    };
    return chain;
  }
  function rpc(nom: string, args: Record<string, unknown>) {
    H.rpcAppels.push({ nom, args });
    return Promise.resolve({ data: "ecr-1", error: null });
  }
  return { supabaseAdmin: { from, rpc } };
});

vi.mock("@/src/lib/supabase-server", () => ({
  createSupabaseServerClient: () => Promise.resolve({
    auth: { getUser: () => Promise.resolve({ data: { user: { id: "u1" } } }) },
    from: () => ({
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { role: H.roleCourant } }) }) }),
    }),
  }),
}));
vi.mock("@/src/utils/supabase/server", () => ({
  createClient: () => Promise.resolve({
    auth: { getUser: () => Promise.resolve({ data: { user: { id: "u1" } } }) },
    from: () => ({
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { role: H.roleCourant } }) }) }),
    }),
  }),
}));
vi.mock("@/src/lib/verifierPermission", () => ({
  verifierPermission: () => Promise.resolve({ userId: "u1" }),
}));
vi.mock("@/src/lib/getProfilePerms", () => ({ getProfilePerms: () => Promise.resolve({}) }));
vi.mock("@/src/lib/avoirs", () => ({
  getAvoirAppliqueReservation: () => Promise.resolve(0),
  getSoldeAvoir: () => Promise.resolve(0),
}));
vi.mock("@/src/lib/factureResa", () => ({
  rafraichirFactureBrouillon: () => Promise.resolve(),
  creerOuMajFactureBrouillon: () => Promise.resolve(),
}));
vi.mock("@/src/lib/comptaAvoir", () => ({
  synchroniserComptaAvoir: () => Promise.resolve(),
  contrePasserComptaAvoir: () => Promise.resolve(),
}));
vi.mock("@sentry/nextjs", () => ({ captureException: () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: () => { throw new Error("REDIRECT"); } }));

import { supprimerReservationDefinitivement } from "@/app/(admin)/reservations/[id]/actions";
import { synchroniserComptaResa } from "@/src/lib/comptaResa";
import { resynchroniserCompta } from "@/app/(admin)/comptabilite/reconciliation/actions";

function fd(id = "r1") {
  const f = new FormData();
  f.set("id", id);
  return f;
}

beforeEach(() => {
  H.reservation = {
    id: "r1", statut: "annulee", montant_paye: 0, statut_paiement: "impaye",
    type_reservation: "sejour", montant_final: 100, montant_calcule: 100, abonnement_id: null,
  };
  H.lignesFacture = [];
  H.comptesLignes = [];
  H.paiements = [];
  H.compteurs = {};
  H.suppressions.length = 0;
  H.rpcAppels.length = 0;
  H.roleCourant = "admin";
});

describe("garde-fou de suppression : le lien facture est dans facture_reservations", () => {
  it("une facture active bloque la suppression (même sans factures.reservation_id)", async () => {
    H.lignesFacture = [{ facture_annulee: false }];
    const res = await supprimerReservationDefinitivement(fd());
    expect(res.error).toContain("Une facture est liée");
    expect(H.suppressions).toHaveLength(0);
  });

  it("une facture annulée bloque aussi : elle doit rester traçable", async () => {
    H.lignesFacture = [{ facture_annulee: true }];
    const res = await supprimerReservationDefinitivement(fd());
    expect(res.error).toContain("annulée référence encore");
    expect(H.suppressions).toHaveLength(0);
  });

  it("un mouvement dans le journal des paiements bloque la suppression", async () => {
    H.compteurs.paiements_resa = 1;
    const res = await supprimerReservationDefinitivement(fd());
    expect(res.error).toContain("journal des paiements");
    expect(H.suppressions).toHaveLength(0);
  });

  it("sans facture ni paiement ni avoir, la suppression va jusqu'au bout", async () => {
    // Le redirect final est simulé par une exception : on vérifie les suppressions.
    await supprimerReservationDefinitivement(fd()).catch(() => {});
    expect(H.suppressions).toContain("reservations");
  });
});

describe("traçabilité de l'auteur des écritures", () => {
  it("synchroniserComptaResa transmet created_by à passer_ecriture", async () => {
    H.reservation = { ...H.reservation, statut: "terminee" };
    H.paiements = [{ mode: "cash", montant: 100 }];

    await synchroniserComptaResa("r1", "2026-06-01", "profil-42");

    const appel = H.rpcAppels.find((a) => a.nom === "passer_ecriture");
    expect(appel).toBeTruthy();
    expect(appel!.args.p_created_by).toBe("profil-42");
  });

  it("sans auteur (traitement automatique), created_by vaut null", async () => {
    H.reservation = { ...H.reservation, statut: "terminee" };
    H.paiements = [{ mode: "cash", montant: 100 }];

    await synchroniserComptaResa("r1", "2026-06-01");

    const appel = H.rpcAppels.find((a) => a.nom === "passer_ecriture");
    expect(appel!.args.p_created_by).toBeNull();
  });
});

describe("resynchronisation comptable : admin uniquement", () => {
  it("un employé est refusé", async () => {
    H.roleCourant = "employe";
    await expect(resynchroniserCompta("r1")).rejects.toThrow("Accès réservé à l'admin");
  });

  it("un admin passe", async () => {
    H.roleCourant = "admin";
    await expect(resynchroniserCompta("r1")).resolves.toBeUndefined();
  });
});
