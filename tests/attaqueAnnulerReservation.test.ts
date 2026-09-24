import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * C-06a — le client de l'avoir venait du FORMULAIRE.
 *
 * QUI PEUT L'ATTEINDRE, vérifié avant d'écrire une ligne : personne d'autre
 * que le personnel. `annulerReservation` n'est appelée que depuis
 * `BoutonAnnuler.tsx`, dans l'espace d'administration, derrière
 * `perm_reservations_annuler`. L'espace client passe par une autre fonction,
 * `annulerReservationPersonnel`, qui prend l'identifiant du client dans la
 * SESSION et ne lit aucun formulaire.
 *
 * L'attaque décrite au brief — un client A qui vise la réservation d'un client
 * B — n'arrive donc pas jusqu'ici : la garde de permission la refuse. Le test
 * le montre plutôt que de le supposer.
 *
 * L'attaque qui arrive, elle, est celle d'un compte AUTORISÉ qui forge le
 * champ caché : l'avoir d'une réservation payée est alors crédité au client
 * qu'il désigne, pas à celui qui a payé.
 */

const H = vi.hoisted(() => ({
  reservations: new Map<string, Record<string, unknown>>(),
  avoirs: [] as Record<string, unknown>[],
  paiements: [] as Record<string, unknown>[],
  /** La permission accordée à l'appelant de ce test. */
  refusPermission: null as string | null,
}));

vi.mock("@sentry/nextjs", () => ({ captureException: () => {}, captureMessage: () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: () => {} }));
vi.mock("@/src/lib/verifierPermission", () => ({
  verifierPermission: async () =>
    H.refusPermission ? { error: H.refusPermission } : { userId: "u-employe" },
}));
vi.mock("@/src/lib/journalEvenements", () => ({ tracerEvenement: async () => {} }));
vi.mock("@/src/lib/comptaResa", () => ({ synchroniserComptaResa: async () => {} }));
vi.mock("@/src/lib/paiementReservation", () => ({ recalculerPaiementReservation: async () => ({ reste: 0 }) }));
vi.mock("@/src/lib/avoirs", () => ({
  getAvoirAppliqueReservation: async () => 0,
  getSoldeAvoir: async () => 0,
}));

vi.mock("@/src/lib/supabase-admin", () => {
  const from = (table: string) => {
    const filtres: Record<string, string> = {};
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (col: string, val: string) => { filtres[col] = val; return chain; },
      in: () => chain,
      order: () => chain,
      update: () => ({ eq: async () => ({ error: null }) }),
      delete: () => ({ eq: async () => ({ error: null }) }),
      insert: async (ligne: Record<string, unknown>) => {
        if (table === "avoirs_mouvements") H.avoirs.push(ligne);
        if (table === "paiements_resa") H.paiements.push(ligne);
        return { error: null };
      },
      single: async () => ({ data: H.reservations.get(filtres.id) ?? null, error: null }),
      maybeSingle: async () => ({ data: H.reservations.get(filtres.id) ?? null, error: null }),
      then: (r: (v: unknown) => void) => r({ data: [], error: null }),
    };
    return chain;
  };
  return { supabaseAdmin: { from, rpc: async () => ({ data: null, error: null }) } };
});

import { annulerReservation } from "@/app/(admin)/(espace-clients)/reservations/[id]/modifier/actions";

const RESA_DE_B = "resa-de-b";
const CLIENT_A = "client-a";
const CLIENT_B = "client-b";

beforeEach(() => {
  H.reservations.clear();
  H.avoirs.length = 0;
  H.paiements.length = 0;
  H.refusPermission = null;
  H.reservations.set(RESA_DE_B, {
    id: RESA_DE_B, client_id: CLIENT_B, montant_paye: 300, numero: 42, statut: "validee",
  });
});

const formulaire = (clientIdForge: string) => {
  const fd = new FormData();
  fd.set("id", RESA_DE_B);
  fd.set("client_id", clientIdForge);
  fd.set("mettre_en_avoir", "true");
  return fd;
};

describe("C-06a : l'avoir suit la réservation, pas le formulaire", () => {
  it("un compte SANS la permission n'arrive pas jusqu'ici", async () => {
    // C'est ce qui met les clients hors de portée : ils n'ont pas la permission.
    H.refusPermission = "Accès refusé";
    await expect(annulerReservation(formulaire(CLIENT_A))).rejects.toThrow(/refusé/i);
    expect(H.avoirs).toEqual([]);
  });

  it("un client_id forgé ne détourne pas l'avoir", async () => {
    // Le formulaire désigne A ; la réservation appartient à B.
    await annulerReservation(formulaire(CLIENT_A));

    const crediteurs = H.avoirs.map((a) => a.client_id);
    expect(
      crediteurs,
      "l'avoir a été crédité au client désigné par le formulaire, pas à celui qui a payé",
    ).toEqual([CLIENT_B]);
    expect(crediteurs).not.toContain(CLIENT_A);
  });

  it("le mouvement de paiement suit le même client", async () => {
    await annulerReservation(formulaire(CLIENT_A));
    for (const p of H.paiements) expect(p.client_id).toBe(CLIENT_B);
  });

  it("l'annulation ordinaire, sans forgerie, crédite bien le client de la réservation", async () => {
    await annulerReservation(formulaire(CLIENT_B));
    expect(H.avoirs.map((a) => a.client_id)).toEqual([CLIENT_B]);
  });
});
