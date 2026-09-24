import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * C-06b — annuler deux fois le même paiement.
 *
 * La contre-passation était insérée sans rien vérifier. Deux clics sur un
 * réseau lent, ou deux annulations demandées à quelques minutes d'écart,
 * donnaient deux lignes négatives : le solde du client partait en négatif, et
 * en mode « avoir », deux avoirs étaient crédités pour un seul versement.
 *
 * Qui peut l'atteindre : tout compte portant `perm_encaissements` — employé ou
 * administratrice. Le double clic ne demande aucune malveillance.
 *
 * Le verrou est en base : un index unique partiel sur `annule_de`. Ce test
 * simule cette contrainte, et vérifie que l'action la traduit en une phrase
 * plutôt qu'en erreur brute.
 */

const H = vi.hoisted(() => ({
  paiements: new Map<string, Record<string, unknown>>(),
  /** Les lignes insérées, dans l'ordre. */
  inserts: [] as Record<string, unknown>[],
  /** Les mouvements d'avoir créés. */
  avoirs: [] as Record<string, unknown>[],
  /** Les `annule_de` déjà pris : c'est l'index unique de la base. */
  annulesDe: new Set<string>(),
}));

vi.mock("@sentry/nextjs", () => ({ captureException: () => {}, captureMessage: () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/src/lib/verifierPermission", () => ({
  verifierPermission: async () => ({ userId: "u-employe" }),
}));
vi.mock("@/src/lib/journalEvenements", () => ({ tracerEvenement: async () => {} }));
vi.mock("@/src/lib/comptaFacture", () => ({
  rafraichirPaiementFacture: async () => {}, recalculerResteFacture: async () => ({ reste: 0 }),
  synchroniserComptaFacture: async () => {},
}));
vi.mock("@/src/lib/comptaResa", () => ({ synchroniserComptaResa: async () => {} }));
vi.mock("@/src/lib/paiementReservation", () => ({
  factureOuverteDeReservation: async () => null,
  recalculerPaiementReservation: async () => ({ reste: 0 }),
  recalculerPaiementsDeFacture: async () => {},
}));
vi.mock("@/src/lib/avoirs", () => ({ getSoldeAvoir: async () => 0 }));
vi.mock("@/src/lib/factureDocument", () => ({
  finaliserEmission: async () => ({}), envoyerFactureParEmail: async () => ({}),
  genererPdfFacture: async () => null, BUCKET_FACTURES: "factures",
}));
vi.mock("@/src/lib/exercices", () => ({ anneesExercicesOuverts: async () => [2026] }));

vi.mock("@/src/lib/supabase-admin", () => {
  const from = (table: string) => {
    const filtres: Record<string, string> = {};
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (col: string, val: string) => { filtres[col] = val; return chain; },
      not: () => chain,
      in: () => chain,
      order: () => chain,
      maybeSingle: async () => ({ data: H.paiements.get(filtres.id) ?? null, error: null }),
      insert: async (ligne: Record<string, unknown>) => {
        if (table === "avoirs_mouvements") { H.avoirs.push(ligne); return { error: null }; }
        // L'INDEX UNIQUE de la base : une seule annulation par paiement.
        const cible = ligne.annule_de as string | undefined;
        if (cible) {
          if (H.annulesDe.has(cible)) {
            return { error: { code: "23505", message: "duplicate key value violates unique constraint \"paiement_une_seule_annulation\"" } };
          }
          H.annulesDe.add(cible);
        }
        H.inserts.push(ligne);
        return { error: null };
      },
      then: (r: (v: unknown) => void) => r({ data: [], error: null, count: 0 }),
    };
    return chain;
  };
  return { supabaseAdmin: { from, rpc: async () => ({ data: 0, error: null }) } };
});

import { annulerPaiement } from "@/app/(admin)/(espace-comptabilite)/factures/actions";

const PAIEMENT = "pay-1";

beforeEach(() => {
  H.paiements.clear();
  H.inserts.length = 0;
  H.avoirs.length = 0;
  H.annulesDe.clear();
  H.paiements.set(PAIEMENT, {
    id: PAIEMENT, facture_id: "fac-1", reservation_id: null, client_id: "cl-1",
    mode: "cash", montant: 120, arrondi: 0, date_paiement: "2026-09-01",
  });
});

const formulaire = (destination = "rembourser") => {
  const fd = new FormData();
  fd.set("paiement_id", PAIEMENT);
  fd.set("motif", "erreur de saisie");
  fd.set("destination", destination);
  return fd;
};

describe("C-06b : un paiement ne s'annule qu'une fois", () => {
  it("deux appels SUCCESSIFS ne créent qu'une contre-passation", async () => {
    const premier = await annulerPaiement(formulaire());
    const second = await annulerPaiement(formulaire());

    expect(premier.ok).toBe(true);
    expect(
      H.inserts.filter((l) => Number(l.montant) < 0).length,
      "le paiement a été contre-passé deux fois : le solde du client part en négatif",
    ).toBe(1);
    // Le refus se dit en français, pas en violation de contrainte.
    expect(second.error).toBe("Ce paiement est déjà annulé.");
    expect(second.error).not.toMatch(/duplicate|constraint|23505/);
  });

  it("deux appels SIMULTANÉS ne créent qu'une contre-passation", async () => {
    const [a, b] = await Promise.all([
      annulerPaiement(formulaire()),
      annulerPaiement(formulaire()),
    ]);

    expect(H.inserts.filter((l) => Number(l.montant) < 0)).toHaveLength(1);
    // L'un passe, l'autre est refusé — jamais les deux.
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect([a.error, b.error].filter(Boolean)).toEqual(["Ce paiement est déjà annulé."]);
  });

  it("en mode « avoir » : une seule annulation, un seul avoir", async () => {
    await annulerPaiement(formulaire("avoir"));
    await annulerPaiement(formulaire("avoir"));

    expect(
      H.avoirs,
      "deux avoirs ont été crédités pour un seul versement",
    ).toHaveLength(1);
    expect(Number(H.avoirs[0].montant)).toBe(120);
  });

  it("la contre-passation DÉSIGNE le paiement qu'elle annule", async () => {
    await annulerPaiement(formulaire());
    const contrePassation = H.inserts.find((l) => Number(l.montant) < 0);
    // Sans ce lien, aucun index ne peut exprimer « une seule annulation ».
    expect(contrePassation?.annule_de).toBe(PAIEMENT);
  });
});
