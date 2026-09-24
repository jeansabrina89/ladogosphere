import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * C-07b — annuler une réservation sans l'annuler.
 *
 * La route de modification écrivait `statut` tel quel. « 🚫 Annulée » figurait
 * dans la liste déroulante : un employé portant `perm_reservations_modifier`
 * mais PAS `perm_reservations_annuler` passait la réservation à « annulée ».
 *
 * Et le défaut ne se règle pas en ajoutant la permission : même avec elle,
 * cette route ne fait qu'écrire un mot. Ni avoir rendu, ni écriture comptable,
 * ni box libéré — tout cela vit dans `annulerReservation`. Une réservation
 * marquée annulée sans l'être vraiment est pire qu'une annulation refusée.
 *
 * Qui peut l'atteindre : tout compte portant `perm_reservations_modifier`,
 * administratrice comprise. La route REFUSE désormais ce passage à tout le
 * monde, et renvoie vers le bouton qui sait le faire.
 */

const H = vi.hoisted(() => ({
  reservations: new Map<string, Record<string, unknown>>(),
  /** Les écritures faites sur la table `reservations`. */
  misesAJour: [] as Record<string, unknown>[],
  refusPermission: null as string | null,
}));

vi.mock("@sentry/nextjs", () => ({ captureException: () => {}, captureMessage: () => {} }));
vi.mock("@/src/utils/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/src/lib/apiAuth", () => ({
  exigerPermissionApi: async () => (H.refusPermission ? new Response("refus", { status: 403 }) : null),
}));
vi.mock("@/src/lib/journalEvenements", () => ({ tracerEvenement: async () => {} }));
vi.mock("@/src/lib/permissions", () => ({ idUtilisateurCourant: async () => "u-employe" }));
vi.mock("@/app/(admin)/(espace-clients)/reservations/[id]/actions", () => ({
  recalculerMontantSejour: async () => {},
}));
vi.mock("@/src/lib/corpsRequete", () => ({
  lireCorpsFormulaire: async (req: { formData: () => Promise<FormData> }) => ({
    ok: true as const, corps: await req.formData(),
  }),
}));
vi.mock("@/src/lib/comptaResa", () => ({ synchroniserComptaResa: async () => {} }));

vi.mock("@/src/lib/supabase-admin", () => {
  const from = (table: string) => {
    const filtres: Record<string, string> = {};
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (c: string, v: string) => { filtres[c] = v; return chain; },
      in: () => chain,
      order: () => chain,
      delete: () => ({ eq: async () => ({ error: null }) }),
      insert: async () => ({ error: null }),
      update: (valeurs: Record<string, unknown>) => ({
        eq: async () => {
          if (table === "reservations") H.misesAJour.push(valeurs);
          return { error: null };
        },
      }),
      maybeSingle: async () => ({ data: H.reservations.get(filtres.id) ?? null, error: null }),
      single: async () => ({ data: H.reservations.get(filtres.id) ?? null, error: null }),
      then: (r: (v: unknown) => void) => r({ data: [], error: null }),
    };
    return chain;
  };
  return { supabaseAdmin: { from, rpc: async () => ({ data: null, error: null }) } };
});

import { POST } from "@/app/api/reservations/[id]/modifier/route";

const RESA = "resa-1";

function requete(statut: string) {
  const fd = new FormData();
  fd.set("statut", statut);
  fd.set("date_debut", "2026-10-01");
  fd.set("date_fin", "2026-10-05");
  fd.set("type_sejour", "pension");
  return {
    formData: async () => fd,
    headers: new Headers({ "content-type": "multipart/form-data" }),
  } as unknown as Parameters<typeof POST>[0];
}

const appel = (statut: string) =>
  POST(requete(statut), { params: Promise.resolve({ id: RESA }) });

beforeEach(() => {
  H.reservations.clear();
  H.misesAJour.length = 0;
  H.refusPermission = null;
  H.reservations.set(RESA, {
    id: RESA, statut: "validee", type_sejour: "pension", numero: 7,
    box_id: null, commentaire_admin: null, heure_arrivee: null, heure_depart: null,
    date_debut: "2026-10-01", date_fin: "2026-10-05",
  });
});

describe("C-07b : la modification ne peut pas annuler", () => {
  it("un employé qui n'a QUE la permission de modifier ne passe pas à « annulée »", async () => {
    const r = await appel("annulee");

    expect(
      H.misesAJour.some((m) => m.statut === "annulee"),
      "la réservation est passée à « annulée » sans avoir, sans écriture comptable, sans box libéré",
    ).toBe(false);
    expect(r.status).toBe(400);
    const corps = await r.json();
    // Le refus renvoie vers le geste qui sait faire, il ne se contente pas de dire non.
    expect(corps.error).toMatch(/annul/i);
  });

  it("l'administratrice non plus : ce n'est pas une question de permission", async () => {
    // Même avec tous les droits, cette route n'écrit qu'un mot.
    const r = await appel("annulee");
    expect(r.status).toBe(400);
    expect(H.misesAJour.some((m) => m.statut === "annulee")).toBe(false);
  });

  it("les statuts ordinaires passent toujours", async () => {
    for (const statut of ["en_attente", "validee", "refusee", "terminee"]) {
      H.misesAJour.length = 0;
      const r = await appel(statut);
      expect(r.status, statut).not.toBe(400);
      expect(H.misesAJour.some((m) => m.statut === statut), statut).toBe(true);
    }
  });

  it("« Annulée » ne figure plus dans la liste déroulante du formulaire", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync(
      "app/(admin)/(espace-clients)/reservations/[id]/modifier/FormModifierReservation.tsx",
      "utf8",
    );
    // Proposer un choix que la route refuse serait une impasse à l'écran.
    expect(src).not.toContain(`<option value="annulee">`);
  });
});
