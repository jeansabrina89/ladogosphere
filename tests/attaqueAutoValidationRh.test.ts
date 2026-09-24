import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * C-07c — valider ses propres heures, approuver ses propres vacances.
 *
 * Décision de Sabrina, 24 septembre 2026 : un employé portant le droit de
 * valider ne valide PAS ce qu'il a lui-même saisi. L'administratrice, si :
 * personne au-dessus d'elle ne le ferait à sa place.
 *
 * Ce qui ne change pas : la SAISIE de son propre timbrage. Se pointer
 * soi-même est le geste normal, et le contournement de permission qui le
 * permet est voulu. Seule la VALIDATION change.
 *
 * Le timbrage portait pire que ce que le recensement disait : le chemin
 * « c'est moi » sautait la vérification de permission ENTIÈREMENT, donc un
 * employé sans `perm_timbrage_equipe` validait déjà son propre mois.
 */

const H = vi.hoisted(() => ({
  /** Le rôle de l'appelant : "admin" ou "employe". */
  role: "employe" as string,
  /** L'identifiant employé de l'appelant. */
  monEmployeId: "emp-moi" as string | null,
  /** La permission de validation est-elle accordée ? */
  permission: true,
  /** Les écritures faites. */
  timbrages: [] as Record<string, unknown>[],
  vacances: [] as Record<string, unknown>[],
  /** Les demandes de vacances en base. */
  demandes: new Map<string, Record<string, unknown>>(),
}));

vi.mock("@sentry/nextjs", () => ({ captureException: () => {}, captureMessage: () => {} }));
vi.mock("@/src/utils/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "u-moi" } } }) } }),
}));
vi.mock("@/src/lib/garde", () => ({
  lireAppelant: async () => ({ userId: "u-moi", role: H.role, actif: true }),
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
  lireCorpsFormulaire: async () => ({ ok: true as const, corps: new FormData() }),
}));

vi.mock("@/src/lib/supabase-admin", () => {
  const table = (nom: string) => {
    const filtres: Record<string, string> = {};
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (c: string, v: string) => { filtres[c] = v; return chain; },
      in: () => chain, gte: () => chain, lte: () => chain, or: () => chain, order: () => chain,
      delete: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
      insert: async () => ({ error: null }),
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
      then: (r: (v: unknown) => void) => r({ data: [], error: null }),
    };
    return chain;
  };
  return { supabaseAdmin: { from: table, rpc: async () => ({ data: null, error: null }) } };
});

const requete = (corps: unknown) => ({ json: async () => corps }) as never;

beforeEach(() => {
  H.role = "employe";
  H.monEmployeId = "emp-moi";
  H.permission = true;
  H.timbrages.length = 0;
  H.vacances.length = 0;
  H.demandes.clear();
  H.demandes.set("dem-moi", { id: "dem-moi", employe_id: "emp-moi", date_debut: "2026-10-01", date_fin: "2026-10-05" });
  H.demandes.set("dem-collegue", { id: "dem-collegue", employe_id: "emp-collegue", date_debut: "2026-10-01", date_fin: "2026-10-05" });
});

describe("timbrage : valider ses propres heures", () => {
  const valider = async (employeId: string) => {
    const { PATCH } = await import("@/app/api/rh/timbrage/route");
    return PATCH(requete({ employe_id: employeId, mois: "2026-09", valide_admin: true }));
  };

  it("un employé valideur ne valide PAS son propre mois", async () => {
    const r = await valider("emp-moi");

    expect(
      H.timbrages,
      "l'employé a validé ses propres heures : personne d'autre n'a regardé",
    ).toEqual([]);
    expect(r.status).toBe(403);
    const corps = await r.json();
    expect(corps.error).toMatch(/autre responsable/i);
  });

  it("il valide bien celui d'un collègue", async () => {
    const r = await valider("emp-collegue");
    expect(r.status).toBe(200);
    expect(H.timbrages).toHaveLength(1);
  });

  it("l'administratrice valide le sien : personne au-dessus d'elle", async () => {
    H.role = "admin";
    const r = await valider("emp-moi");
    expect(r.status).toBe(200);
    expect(H.timbrages).toHaveLength(1);
  });

  it("sans le droit de valider, celui d'un collègue reste refusé", async () => {
    H.permission = false;
    const r = await valider("emp-collegue");
    expect(r.status).toBe(403);
    expect(H.timbrages).toEqual([]);
  });

  it("sans le droit de valider, le sien l'est aussi", async () => {
    // Le chemin « c'est moi » sautait la permission entièrement.
    H.permission = false;
    const r = await valider("emp-moi");
    expect(r.status).toBe(403);
    expect(H.timbrages).toEqual([]);
  });
});

describe("vacances : approuver ses propres congés", () => {
  const approuver = async (demandeId: string) => {
    const { PATCH } = await import("@/app/api/rh/vacances/route");
    return PATCH(requete({ id: demandeId, statut: "acceptee", note_admin: null }));
  };

  it("un employé valideur n'approuve PAS sa propre demande", async () => {
    const r = await approuver("dem-moi");

    expect(
      H.vacances,
      "l'employé a approuvé ses propres vacances",
    ).toEqual([]);
    expect(r.status).toBe(403);
    const corps = await r.json();
    expect(corps.error).toMatch(/autre responsable/i);
  });

  it("il approuve bien celle d'un collègue", async () => {
    const r = await approuver("dem-collegue");
    expect(r.status).not.toBe(403);
    expect(H.vacances.length).toBeGreaterThan(0);
  });

  it("l'administratrice approuve la sienne", async () => {
    H.role = "admin";
    const r = await approuver("dem-moi");
    expect(r.status).not.toBe(403);
    expect(H.vacances.length).toBeGreaterThan(0);
  });

  it("sans le droit, rien ne passe", async () => {
    H.permission = false;
    const r = await approuver("dem-collegue");
    expect(r.status).toBe(403);
    expect(H.vacances).toEqual([]);
  });
});

describe("l'écran n'offre pas le geste que la route refuse", () => {
  /**
   * La route refuse désormais qu'un employé valide ses propres lignes. Un
   * écran qui lui montrerait quand même le bouton lui ferait découvrir le
   * refus en cliquant. On vérifie donc l'autre bout : tout composant qui
   * envoie un PATCH vers ces deux routes vit sous une page gardée par
   * `exigerAdminPage()` — l'administratrice seule, aucun employé.
   */
  const racine = path.join(__dirname, "..", "app");

  const tousLesTsx = (dossier: string): string[] =>
    fs.readdirSync(dossier, { withFileTypes: true }).flatMap((e) => {
      const chemin = path.join(dossier, e.name);
      if (e.isDirectory()) return tousLesTsx(chemin);
      return e.name.endsWith(".tsx") ? [chemin] : [];
    });

  /** La page la plus proche au-dessus d'un composant, en remontant jusqu'à app/. */
  const pageGardienne = (fichier: string): string | null => {
    let d = path.dirname(fichier);
    while (d.startsWith(racine)) {
      const p = path.join(d, "page.tsx");
      if (fs.existsSync(p)) return p;
      d = path.dirname(d);
    }
    return null;
  };

  const emetteurs = tousLesTsx(racine).filter((f) => {
    const src = fs.readFileSync(f, "utf8");
    return /\/api\/rh\/(timbrage|vacances)/.test(src) && /method:\s*"PATCH"/.test(src);
  });

  it("il y a bien des écrans qui valident (sinon le test ne prouve rien)", () => {
    expect(emetteurs.length).toBeGreaterThan(0);
  });

  it.each(emetteurs)("%s est sous une page réservée à l'administratrice", (fichier) => {
    const page = pageGardienne(fichier);
    expect(page, `aucune page au-dessus de ${fichier}`).not.toBeNull();
    expect(
      fs.readFileSync(page!, "utf8"),
      `${path.relative(racine, page!)} laisse entrer un employé sur un écran qui valide`,
    ).toMatch(/exigerAdminPage\(/);
  });
});
