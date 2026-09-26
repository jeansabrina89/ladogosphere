import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Archiver ou supprimer une fiche chien : les jumeaux d'`archiverClient`.
 *
 * Mêmes deux défauts, trouvés au balayage mécanique du 23-bis :
 *   - aucune garde ;
 *   - un UPDATE que RLS filtre ne renvoie pas d'erreur, il touche zéro ligne
 *     et dit que tout va bien. `archiverChien` traçait donc un événement
 *     « archive » pour une archive qui n'avait pas eu lieu, puis redirigeait
 *     comme si c'était fait.
 *
 * La permission retenue est `exigerAdmin()`, pour les DEUX gestes — parce que
 * l'écran l'a déjà tranché : `chiens/[id]/page.tsx:275-276` n'affiche les deux
 * boutons que sous `perms.isAdmin`. La route ne fait que dire ce que l'écran
 * dit déjà. `perm_chiens_modifier` ouvre la fiche, pas son retrait.
 */

const H = vi.hoisted(() => ({
  role: "admin" as "admin" | "employe" | "client",
  chiens: new Set<string>(),
  ecritures: [] as { op: string; id: string }[],
  journal: [] as Record<string, unknown>[],
  /**
   * RLS élargie au personnel — le jour où une politique `personnel_all_chiens`
   * est ajoutée. C'est le cas où SEULE la garde protège.
   */
  rlsPermissive: false,
}));

class AccesRefuseTest extends Error {}

vi.mock("@sentry/nextjs", () => ({ captureException: () => {}, captureMessage: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); },
}));
vi.mock("@/src/lib/garde", () => ({
  exigerAdmin: async () => {
    if (H.role !== "admin") throw new AccesRefuseTest("Accès réservé à l'admin");
    return { userId: "u-admin", role: "admin", isAdmin: true, actif: true };
  },
}));
vi.mock("@/src/lib/journalEvenements", () => ({
  tracerEvenement: async (e: Record<string, unknown>) => { H.journal.push(e); },
}));
vi.mock("@/src/lib/permissions", () => ({ idUtilisateurCourant: async () => "u-admin" }));

/*
 * La clé de service, pour le seul bucket des photos (APP 28).
 *
 * Depuis APP 28, supprimer un chien retire aussi sa photo du bucket : les
 * actions importent donc `oublierPhotoChien`, qui tient la clé de service. Sans
 * ce simulacre, le module réel tente de se construire et la suite échoue sur
 * « supabaseUrl is required » — un échec de décor, qui ne dit rien de la garde.
 *
 * Ce simulacre n'affaiblit RIEN de ce que ce fichier garde : la garde et le
 * compte de lignes passent par le client de SESSION, simulé plus bas. Le
 * stockage, lui, ne décide de rien — il ne fait que nettoyer après coup.
 */
vi.mock("@/src/lib/supabase-admin", () => ({
  supabaseAdmin: {
    storage: { from: () => ({ remove: async () => ({ data: [], error: null }) }) },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: null }), single: async () => ({ data: null }) }),
      }),
    }),
  },
}));

/** Le client de SESSION : seule `admin_all_chiens` permet UPDATE et DELETE. */
vi.mock("@/src/utils/supabase/server", () => ({
  createClient: async () => ({
    from: () => {
      const ecrire = (op: string, id: string) => {
        const permis =
          (H.role === "admin" || (H.rlsPermissive && H.role === "employe")) && H.chiens.has(id);
        if (permis) H.ecritures.push({ op, id });
        return { data: permis ? [{ id }] : [], error: null };
      };
      const brancher = (op: string) => ({
        eq: (_c: string, id: string) => {
          const suite = {
            select: async () => ecrire(op, id),
            then: (r: (v: unknown) => void) =>
              Promise.resolve(r({ error: ecrire(op, id).error })),
          };
          return suite;
        },
      });
      return { update: () => brancher("update"), delete: () => brancher("delete") };
    },
  }),
}));

const CHIEN = "chien-existant";

beforeEach(() => {
  H.role = "admin";
  H.chiens.clear();
  H.chiens.add(CHIEN);
  H.ecritures.length = 0;
  H.journal.length = 0;
  H.rlsPermissive = false;
});

async function appeler(quoi: "archiver" | "supprimer", id: string) {
  const mod = await import("@/app/(admin)/(espace-clients)/chiens/[id]/actions");
  const fd = new FormData();
  fd.set("id", id);
  if (quoi === "archiver") fd.set("actif", "true");
  try {
    await (quoi === "archiver" ? mod.archiverChien(fd) : mod.supprimerChien(fd));
    return { redirige: false, refus: null as string | null };
  } catch (e) {
    const m = (e as Error).message;
    if (m.startsWith("REDIRECT:")) return { redirige: true, refus: null };
    return { redirige: false, refus: m };
  }
}

describe("archiver une fiche chien", () => {
  it("un employé est refusé, et le journal reste muet", async () => {
    H.role = "employe";

    const r = await appeler("archiver", CHIEN);

    expect(H.ecritures, "un non-admin a modifié une fiche chien").toEqual([]);
    expect(H.journal, "le journal porte une archive qui n'a pas eu lieu").toEqual([]);
    expect(r.redirige, "l'écran a annoncé un succès").toBe(false);
    expect(r.refus).toBeTruthy();
  });

  it("l'administratrice archive, et le journal en porte une trace", async () => {
    const r = await appeler("archiver", CHIEN);
    expect(r.redirige).toBe(true);
    expect(H.ecritures).toHaveLength(1);
    expect(H.journal).toHaveLength(1);
    expect(H.journal[0].evenement).toBe("archive");
  });

  it("un identifiant inexistant est une erreur, pas un succès muet", async () => {
    const r = await appeler("archiver", "chien-fantome");

    expect(H.ecritures).toEqual([]);
    expect(
      H.journal,
      "aucune ligne n'a bougé, et le journal dit pourtant qu'elle a été archivée",
    ).toEqual([]);
    expect(r.redirige).toBe(false);
    expect(r.refus).toBeTruthy();
  });
});

describe("supprimer une fiche chien", () => {
  it("un employé est refusé", async () => {
    H.role = "employe";
    const r = await appeler("supprimer", CHIEN);
    expect(H.ecritures, "un non-admin a supprimé une fiche chien").toEqual([]);
    expect(r.redirige).toBe(false);
    expect(r.refus).toBeTruthy();
  });

  it("l'administratrice supprime", async () => {
    const r = await appeler("supprimer", CHIEN);
    expect(r.redirige).toBe(true);
    expect(H.ecritures).toHaveLength(1);
  });

  it("un identifiant inexistant est une erreur", async () => {
    const r = await appeler("supprimer", "chien-fantome");
    expect(H.ecritures).toEqual([]);
    expect(r.redirige, "l'écran a annoncé une suppression qui n'a pas eu lieu").toBe(false);
    expect(r.refus).toBeTruthy();
  });
});

describe("la garde seule, quand RLS ne protège plus", () => {
  /**
   * Le compte de lignes suffit TANT QUE RLS refuse l'écriture au personnel.
   * Le jour où une politique `personnel_all_chiens` est ajoutée, l'UPDATE
   * passerait, le compte serait de 1, le journal dirait vrai — et un employé
   * aurait archivé une fiche. C'est la garde, et elle seule, qui l'arrête.
   * (Au 23-bis, sans ces cas, la mutation de la garde était passée au vert.)
   */
  it("un employé n'archive pas, même si RLS le laissait passer", async () => {
    H.role = "employe";
    H.rlsPermissive = true;

    const r = await appeler("archiver", CHIEN);

    expect(
      H.ecritures,
      "un employé a archivé une fiche chien : rien ne l'a arrêté avant l'écriture",
    ).toEqual([]);
    expect(H.journal).toEqual([]);
    expect(r.refus).toMatch(/admin/i);
  });

  it("un employé ne supprime pas, même si RLS le laissait passer", async () => {
    H.role = "employe";
    H.rlsPermissive = true;

    const r = await appeler("supprimer", CHIEN);

    expect(
      H.ecritures,
      "un employé a supprimé une fiche chien : rien ne l'a arrêté avant l'écriture",
    ).toEqual([]);
    expect(r.refus).toMatch(/admin/i);
  });

  it("le refus dit la bonne raison, et pas « introuvable »", async () => {
    H.role = "employe";
    const r = await appeler("archiver", CHIEN);
    expect(r.refus).toMatch(/admin/i);
    expect(r.refus).not.toMatch(/introuvable/i);
  });
});
