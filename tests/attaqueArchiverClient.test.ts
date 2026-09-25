import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Archiver ou supprimer une fiche client : deux gestes sans garde.
 *
 * Aucune des deux actions ne vérifiait qui appelait. RLS arrêtait bien
 * l'écriture — seule `admin_all_clients` permet UPDATE et DELETE sur
 * `clients` — mais **un UPDATE que RLS filtre ne renvoie pas d'erreur** : il
 * touche zéro ligne et dit que tout va bien. `archiverClient` traçait donc un
 * événement « archive » pour une archive qui n'avait pas eu lieu, puis
 * redirigeait comme si c'était fait.
 *
 * Deux couches, deux tests :
 *   1. la garde `exigerAdmin()` : un employé n'entre plus ;
 *   2. le compte de lignes réellement touchées : zéro ligne devient une
 *      erreur, et le journal reste muet.
 */

const H = vi.hoisted(() => ({
  /** Le rôle de l'appelant, tel que la garde le lira. */
  role: "admin" as "admin" | "employe" | "client",
  /** Les fiches clients existantes. */
  clients: new Set<string>(),
  /** Les écritures acceptées par RLS. */
  ecritures: [] as { table: string; op: string; id: string }[],
  /** Les entrées de journal. */
  journal: [] as Record<string, unknown>[],
  /**
   * RLS élargie au personnel — le jour où quelqu'un ajoute une politique
   * `personnel_all_clients`. C'est le cas où SEULE la garde protège.
   */
  rlsPermissive: false,
}));

class AccesRefuseTest extends Error {}

vi.mock("@sentry/nextjs", () => ({ captureException: () => {}, captureMessage: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/src/lib/garde", () => ({
  exigerAdmin: async () => {
    if (H.role !== "admin") throw new AccesRefuseTest("Accès réservé à l'admin");
    return { userId: "u-admin", role: "admin", isAdmin: true, actif: true };
  },
}));
vi.mock("@/src/lib/journalEvenements", () => ({
  tracerEvenement: async (e: Record<string, unknown>) => { H.journal.push(e); },
}));
vi.mock("@/src/lib/permissions", () => ({
  idUtilisateurCourant: async () => "u-admin",
  verifierPermission: async () => ({ userId: "u-admin", isAdmin: true }),
}));
vi.mock("@/src/lib/verifierPermission", () => ({
  verifierPermission: async () => ({ userId: "u-admin", isAdmin: true }),
}));

/**
 * Le client de SESSION, avec RLS simulée : seule `admin_all_clients` permet
 * UPDATE et DELETE. Pour les autres, zéro ligne touchée — SANS erreur, comme
 * en vrai.
 */
const clientSession = () => ({
  auth: { getUser: async () => ({ data: { user: { id: "u-appelant" } } }) },
  from: (table: string) => {
    const ecrire = (op: string, id: string) => {
      const permis =
        (H.role === "admin" || (H.rlsPermissive && H.role === "employe")) && H.clients.has(id);
      if (permis) H.ecritures.push({ table, op, id });
      return { data: permis ? [{ id }] : [], error: null };
    };
    return {
      update: () => ({
        eq: (_c: string, id: string) => {
          const resultat = () => ecrire("update", id);
          const suite = {
            select: async () => resultat(),
            then: (r: (v: unknown) => void) => { const x = resultat(); return Promise.resolve(r({ error: x.error })); },
          };
          return suite;
        },
      }),
      delete: () => ({
        eq: (_c: string, id: string) => {
          const resultat = () => ecrire("delete", id);
          const suite = {
            select: async () => resultat(),
            then: (r: (v: unknown) => void) => { const x = resultat(); return Promise.resolve(r({ error: x.error })); },
          };
          return suite;
        },
      }),
    };
  },
});

vi.mock("@/src/utils/supabase/server", () => ({ createClient: async () => clientSession() }));
vi.mock("@/src/lib/supabase-admin", () => ({
  supabaseAdmin: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }), single: async () => ({ data: null }) }) }) }) },
}));

const CLIENT = "client-existant";

beforeEach(() => {
  H.role = "admin";
  H.clients.clear();
  H.clients.add(CLIENT);
  H.ecritures.length = 0;
  H.journal.length = 0;
  H.rlsPermissive = false;
});

/** Les deux actions redirigent quand elles réussissent. */
async function appeler(quoi: "archiver" | "supprimer", id: string) {
  const mod = await import("@/app/(admin)/(espace-clients)/clients/[id]/actions");
  const fd = new FormData();
  fd.set("id", id);
  if (quoi === "archiver") fd.set("actif", "true");
  try {
    await (quoi === "archiver" ? mod.archiverClient(fd) : mod.supprimerClient(fd));
    return { redirige: false, refus: null as string | null };
  } catch (e) {
    const m = (e as Error).message;
    if (m.startsWith("REDIRECT:")) return { redirige: true, refus: null };
    return { redirige: false, refus: m };
  }
}

describe("archiver une fiche client", () => {
  it("un employé non admin est refusé, et le journal reste muet", async () => {
    H.role = "employe";

    const r = await appeler("archiver", CLIENT);

    expect(H.ecritures, "un non-admin a modifié une fiche client").toEqual([]);
    expect(
      H.journal,
      "le journal porte une archive qui n'a pas eu lieu",
    ).toEqual([]);
    expect(r.redirige, "l'écran a annoncé un succès").toBe(false);
    expect(r.refus).toBeTruthy();
  });

  it("l'administratrice archive, et le journal en porte une trace", async () => {
    const r = await appeler("archiver", CLIENT);
    expect(r.redirige).toBe(true);
    expect(H.ecritures).toHaveLength(1);
    expect(H.journal).toHaveLength(1);
    expect(H.journal[0].evenement).toBe("archive");
  });

  it("un identifiant inexistant est une erreur, pas un succès muet", async () => {
    const r = await appeler("archiver", "client-fantome");

    expect(H.ecritures).toEqual([]);
    expect(
      H.journal,
      "aucune ligne n'a bougé, et le journal dit pourtant qu'elle a été archivée",
    ).toEqual([]);
    expect(r.redirige, "l'écran a annoncé un succès sans rien archiver").toBe(false);
    expect(r.refus).toBeTruthy();
  });
});

describe("supprimer une fiche client", () => {
  it("un employé non admin est refusé", async () => {
    H.role = "employe";
    const r = await appeler("supprimer", CLIENT);
    expect(H.ecritures, "un non-admin a supprimé une fiche client").toEqual([]);
    expect(r.redirige).toBe(false);
    expect(r.refus).toBeTruthy();
  });

  it("l'administratrice supprime", async () => {
    const r = await appeler("supprimer", CLIENT);
    expect(r.redirige).toBe(true);
    expect(H.ecritures).toHaveLength(1);
  });

  it("un identifiant inexistant est une erreur", async () => {
    const r = await appeler("supprimer", "client-fantome");
    expect(H.ecritures).toEqual([]);
    expect(r.redirige, "l'écran a annoncé une suppression qui n'a pas eu lieu").toBe(false);
    expect(r.refus).toBeTruthy();
  });
});

describe("la garde seule, quand RLS ne protège plus", () => {
  /**
   * Le compte de lignes touchées suffit TANT QUE RLS refuse l'écriture au
   * personnel. Le jour où une politique `personnel_all_clients` est ajoutée,
   * il ne suffit plus : l'UPDATE passerait, le compte serait de 1, et le
   * journal dirait vrai — mais un employé aurait archivé une fiche cliente.
   * C'est la garde, et elle seule, qui l'arrête. Ces trois cas la mettent en
   * face de cette situation ; sans eux, retirer la garde ne ferait rougir
   * aucun test (constaté : la première mutation est passée au vert).
   */
  it("un employé n'archive pas, même si RLS le laissait passer", async () => {
    H.role = "employe";
    H.rlsPermissive = true;

    const r = await appeler("archiver", CLIENT);

    expect(
      H.ecritures,
      "un employé a archivé une fiche cliente : rien ne l'a arrêté avant l'écriture",
    ).toEqual([]);
    expect(H.journal).toEqual([]);
    expect(r.refus).toMatch(/admin/i);
  });

  it("un employé ne supprime pas, même si RLS le laissait passer", async () => {
    H.role = "employe";
    H.rlsPermissive = true;

    const r = await appeler("supprimer", CLIENT);

    expect(
      H.ecritures,
      "un employé a supprimé une fiche cliente : rien ne l'a arrêté avant l'écriture",
    ).toEqual([]);
    expect(r.refus).toMatch(/admin/i);
  });

  it("le refus dit la bonne raison, et pas « introuvable »", async () => {
    // Sans la garde, l'employé recevait « cette fiche est introuvable » : un
    // message faux, qui envoie chercher l'erreur au mauvais endroit.
    H.role = "employe";
    const r = await appeler("archiver", CLIENT);
    expect(r.refus).toMatch(/admin/i);
    expect(r.refus).not.toMatch(/introuvable/i);
  });
});
