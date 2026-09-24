import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Le chien d'un autre client, posé sur la prestation d'un locataire.
 *
 * `ajouterPrestation` lit `client_id` ET `chien_id` du formulaire. Le client
 * est relu — est-il bien locataire d'un box ? — mais le chien ne l'est
 * jamais. Une prestation pouvait donc porter le chien de quelqu'un d'autre :
 * au planning du jour, l'équipe voyait un nom de chien qui n'appartenait pas
 * au box indiqué.
 *
 * Qui peut l'atteindre : une employée portant `perm_prestations` ET
 * `perm_encaissements` (la garde de facturation exige les deux), ou
 * l'administratrice. Ni client, ni anonyme.
 */

const H = vi.hoisted(() => ({
  clients: new Map<string, Record<string, unknown>>(),
  chiens: new Map<string, Record<string, unknown>>(),
  prestations: new Map<string, Record<string, unknown>>(),
  /** Les lignes écrites dans `taches_prestations`. */
  taches: [] as Record<string, unknown>[],
}));

vi.mock("@sentry/nextjs", () => ({ captureException: () => {}, captureMessage: () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/src/lib/verifierPermission", () => ({
  verifierPermission: async () => ({ userId: "u-employe" }),
}));
vi.mock("@/src/lib/journalEvenements", () => ({ tracerEvenement: async () => {} }));

vi.mock("@/src/lib/supabase-admin", () => {
  const table = (nom: string) => {
    const filtres: Record<string, string> = {};
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (c: string, v: string) => { filtres[c] = v; return chain; },
      in: () => chain,
      gte: () => chain,
      lte: () => chain,
      order: () => chain,
      limit: () => chain,
      insert: async (lignes: Record<string, unknown>[]) => {
        if (nom === "taches_prestations") {
          for (const l of Array.isArray(lignes) ? lignes : [lignes]) H.taches.push(l);
        }
        return { error: null };
      },
      update: () => ({ eq: async () => ({ error: null }) }),
      maybeSingle: async () => {
        const source =
          nom === "clients" ? H.clients : nom === "chiens" ? H.chiens : H.prestations;
        return { data: source.get(filtres.id) ?? null, error: null };
      },
      single: async () => ({ data: null, error: null }),
      then: (r: (v: unknown) => void) => r({ data: [], error: null }),
    };
    return chain;
  };
  return { supabaseAdmin: { from: table, rpc: async () => ({ data: null, error: null }) } };
});

import { ajouterPrestation } from "@/app/(admin)/(espace-prestations)/prestations/actions";

const CLIENT_A = "client-a";
const CLIENT_B = "client-b";
const CHIEN_DE_B = "chien-de-b";
const CHIEN_DE_A = "chien-de-a";
const PRESTATION = "prest-1";

beforeEach(() => {
  H.clients.clear();
  H.chiens.clear();
  H.prestations.clear();
  H.taches.length = 0;
  // Les deux sont locataires : la garde « locataire de box » ne bloque rien.
  H.clients.set(CLIENT_A, { id: CLIENT_A, locataire_box: true, box_loue: "B1" });
  H.clients.set(CLIENT_B, { id: CLIENT_B, locataire_box: true, box_loue: "B2" });
  H.chiens.set(CHIEN_DE_A, { id: CHIEN_DE_A, client_id: CLIENT_A, nom: "Pixel" });
  H.chiens.set(CHIEN_DE_B, { id: CHIEN_DE_B, client_id: CLIENT_B, nom: "Nala" });
  H.prestations.set(PRESTATION, {
    id: PRESTATION, unite: "unite", prix: 20, taux_tva: 8.1, motif_tva: null, actif: true,
  });
});

const formulaire = (clientId: string, chienId: string | null) => {
  const fd = new FormData();
  fd.set("client_id", clientId);
  fd.set("prestation_id", PRESTATION);
  if (chienId) fd.set("chien_id", chienId);
  fd.set("date_debut", "2026-10-01");
  return fd;
};

describe("une prestation ne porte que le chien de son client", () => {
  it("le chien du client B est refusé sur une prestation du client A", async () => {
    const res = await ajouterPrestation(formulaire(CLIENT_A, CHIEN_DE_B));

    expect(
      H.taches,
      "une prestation a été créée avec le chien d'un autre client : le planning montrera un chien qui n'est pas dans ce box",
    ).toEqual([]);
    expect(res.error).toBeTruthy();
    expect(res.error).toMatch(/chien/i);
  });

  it("le chien du client A passe, comme avant", async () => {
    const res = await ajouterPrestation(formulaire(CLIENT_A, CHIEN_DE_A));

    expect(res.error).toBeUndefined();
    expect(H.taches).toHaveLength(1);
    expect(H.taches[0].chien_id).toBe(CHIEN_DE_A);
    expect(H.taches[0].client_id).toBe(CLIENT_A);
  });

  it("sans chien, la prestation reste possible", async () => {
    // Toutes les prestations ne visent pas un chien : le champ est facultatif.
    const res = await ajouterPrestation(formulaire(CLIENT_A, null));
    expect(res.error).toBeUndefined();
    expect(H.taches).toHaveLength(1);
    expect(H.taches[0].chien_id).toBeNull();
  });

  it("un chien qui n'existe pas est refusé, sans rien écrire", async () => {
    const res = await ajouterPrestation(formulaire(CLIENT_A, "chien-fantome"));
    expect(res.error).toBeTruthy();
    expect(H.taches).toEqual([]);
  });
});
