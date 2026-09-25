import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Qui a validé, et quand.
 *
 * Avant le 26 septembre 2026, la base ne le disait nulle part : `timbrage` ne
 * portait qu'un booléen, `demandes_vacances` qu'un statut, et aucune des deux
 * routes n'écrivait au journal. On savait QUE c'était validé, jamais PAR QUI.
 *
 * Le valideur vient de la SESSION. C'est le point que ces tests gardent : une
 * valeur glissée dans le corps de la requête ne doit rien pouvoir changer,
 * sans quoi la trace dirait ce que l'appelant veut qu'elle dise, et une trace
 * qu'on peut écrire soi-même ne prouve rien.
 */

const H = vi.hoisted(() => ({
  role: "admin" as "admin" | "employe",
  userId: "u-sabrina" as string,
  monEmployeId: "emp-sabrina" as string | null,
  permission: true,
  /** Les mises à jour de `timbrage`. */
  timbrages: [] as Record<string, unknown>[],
  /** Les insertions de `timbrage` (les « Vacances (auto) »). */
  timbragesCrees: [] as Record<string, unknown>[],
  /** Les mises à jour de `demandes_vacances`. */
  vacances: [] as Record<string, unknown>[],
  demandes: new Map<string, Record<string, unknown>>(),
  /** Les jours de planning à basculer en vacances. */
  planning: [] as { id: string; date: string; statut: string }[],
}));

vi.mock("@sentry/nextjs", () => ({ captureException: () => {}, captureMessage: () => {} }));
vi.mock("@/src/utils/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: H.userId } } }) } }),
}));
vi.mock("@/src/lib/garde", () => ({
  lireAppelant: async () => ({ userId: H.userId, role: H.role, actif: true }),
}));
vi.mock("@/src/lib/apiAuth", () => ({
  exigerPersonnel: async () => null,
  exigerPermissionApi: async () =>
    H.permission ? null : new Response(JSON.stringify({ error: "refus" }), { status: 403 }),
}));
vi.mock("@/src/lib/journalEvenements", () => ({ tracerEvenement: async () => {} }));
vi.mock("@/src/lib/corpsRequete", () => ({
  lireCorpsJson: async (req: { json: () => Promise<unknown> }) => ({
    ok: true as const, corps: await req.json(),
  }),
}));

vi.mock("@/src/lib/supabase-admin", () => {
  const table = (nom: string) => {
    const filtres: Record<string, string> = {};
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (c: string, v: string) => { filtres[c] = v; return chain; },
      in: () => chain, gte: () => chain, lte: () => chain, or: () => chain, order: () => chain,
      delete: () => {
        // Le chemin « défaire » enchaîne eq().gte().lte().eq() : la chaîne
        // doit se laisser dérouler entièrement avant d'être attendue.
        const suite: Record<string, unknown> = {
          eq: () => suite, gte: () => suite, lte: () => suite, in: () => suite,
          then: (r: (x: unknown) => void) => Promise.resolve({ error: null }).then(r),
        };
        return suite;
      },
      insert: async (v: Record<string, unknown>) => {
        if (nom === "timbrage") H.timbragesCrees.push(v);
        return { error: null };
      },
      upsert: async () => ({ error: null }),
      update: (v: Record<string, unknown>) => {
        const poser = () => {
          if (nom === "timbrage") H.timbrages.push({ ...v, ...filtres });
          if (nom === "demandes_vacances") H.vacances.push({ ...v, ...filtres });
          return Promise.resolve({ error: null });
        };
        const suite: Record<string, unknown> = {
          eq: (c: string, val: string) => { filtres[c] = val; return suite; },
          gte: () => suite, lte: () => suite, in: () => suite,
          then: (r: (x: unknown) => void) => poser().then(r),
        };
        return suite;
      },
      maybeSingle: async () => ({
        data: nom === "employes_rh"
          ? (H.monEmployeId ? { id: H.monEmployeId, taux_travail: 100 } : null)
          : (H.demandes.get(filtres.id) ?? null),
        error: null,
      }),
      single: async () => ({ data: H.demandes.get(filtres.id) ?? null, error: null }),
      then: (r: (v: unknown) => void) =>
        r({ data: nom === "planning_employes" ? H.planning : [], error: null }),
    };
    return chain;
  };
  return { supabaseAdmin: { from: table, rpc: async () => ({ data: null, error: null }) } };
});

const requete = (corps: unknown) => ({ json: async () => corps }) as never;

beforeEach(() => {
  H.role = "admin";
  H.userId = "u-sabrina";
  H.monEmployeId = "emp-sabrina";
  H.permission = true;
  H.timbrages.length = 0;
  H.timbragesCrees.length = 0;
  H.vacances.length = 0;
  H.planning.length = 0;
  H.demandes.clear();
  H.demandes.set("dem-1", {
    id: "dem-1", employe_id: "emp-autre", date_debut: "2026-11-02", date_fin: "2026-11-06",
  });
});

describe("timbrage : la validation dit qui l'a faite", () => {
  const patch = async (corps: Record<string, unknown>) => {
    const { PATCH } = await import("@/app/api/rh/timbrage/route");
    return PATCH(requete({ employe_id: "emp-autre", mois: "2026-09", ...corps }));
  };

  it("valider inscrit l'appelant et l'horodatage", async () => {
    const avant = Date.now();
    const r = await patch({ valide_admin: true });

    expect(r.status).toBe(200);
    expect(H.timbrages).toHaveLength(1);
    expect(H.timbrages[0].valide_par, "la ligne est validée sans qu'on sache par qui")
      .toBe("u-sabrina");
    const quand = new Date(H.timbrages[0].valide_le as string).getTime();
    expect(quand).toBeGreaterThanOrEqual(avant - 1000);
  });

  it("dévalider efface les deux", async () => {
    // Une ligne repassée à « non validée » n'a plus de valideur : garder
    // l'ancien laisserait croire qu'il l'a voulu ainsi.
    const r = await patch({ valide_admin: false });

    expect(r.status).toBe(200);
    expect(H.timbrages[0].valide_admin).toBe(false);
    expect(H.timbrages[0].valide_par).toBeNull();
    expect(H.timbrages[0].valide_le).toBeNull();
  });

  it("une valeur envoyée dans le corps de la requête est ignorée", async () => {
    const r = await patch({ valide_admin: true, valide_par: "u-quelqu-un-dautre", valide_le: "1999-01-01" });

    expect(r.status).toBe(200);
    expect(
      H.timbrages[0].valide_par,
      "le valideur vient du corps de la requête : la trace dit ce que l'appelant veut",
    ).toBe("u-sabrina");
    expect(H.timbrages[0].valide_le).not.toBe("1999-01-01");
  });

  it("un employé valideur laisse SON nom, pas celui de l'admin", async () => {
    H.role = "employe";
    H.userId = "u-employe";
    H.monEmployeId = "emp-employe";

    const r = await patch({ valide_admin: true });

    expect(r.status).toBe(200);
    expect(H.timbrages[0].valide_par).toBe("u-employe");
  });
});

describe("vacances : le traitement dit qui a tranché", () => {
  const patch = async (corps: Record<string, unknown>) => {
    const { PATCH } = await import("@/app/api/rh/vacances/route");
    return PATCH(requete({ id: "dem-1", note_admin: null, ...corps }));
  };

  it("accepter inscrit traite_par et traite_le", async () => {
    const r = await patch({ statut: "acceptee" });

    expect(r.status).not.toBe(403);
    expect(H.vacances[0].traite_par, "la demande est acceptée sans qu'on sache par qui")
      .toBe("u-sabrina");
    expect(H.vacances[0].traite_le).toBeTruthy();
  });

  it("refuser aussi : « traité » couvre les deux", async () => {
    const r = await patch({ statut: "refusee" });

    expect(r.status).not.toBe(403);
    expect(H.vacances[0].traite_par).toBe("u-sabrina");
    expect(H.vacances[0].traite_le).toBeTruthy();
  });

  it("remettre en attente efface le traitement", async () => {
    await patch({ statut: "en_attente" });
    expect(H.vacances[0].traite_par).toBeNull();
    expect(H.vacances[0].traite_le).toBeNull();
  });

  it("une valeur envoyée dans le corps est ignorée", async () => {
    await patch({ statut: "acceptee", traite_par: "u-quelqu-un-dautre" });
    expect(H.vacances[0].traite_par).toBe("u-sabrina");
  });

  it("les timbrages « Vacances (auto) » portent celui qui a accepté", async () => {
    // 27 des 29 lignes validées de la base sont de celles-là : nées validées,
    // sans que personne ne clique. Sans ce report, elles resteraient sans
    // valideur, et la colonne ne servirait presque à rien.
    H.planning.push({ id: "p1", date: "2026-11-02", statut: "travail" });
    H.planning.push({ id: "p2", date: "2026-11-03", statut: "travail" });

    await patch({ statut: "acceptee" });

    expect(H.timbragesCrees.length).toBeGreaterThan(0);
    for (const ligne of H.timbragesCrees) {
      expect(ligne.note).toBe("Vacances (auto)");
      expect(
        ligne.valide_par,
        "un timbrage de vacances naît validé par personne",
      ).toBe("u-sabrina");
      expect(ligne.valide_le).toBeTruthy();
    }
  });
});
