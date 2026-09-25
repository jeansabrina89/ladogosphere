import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * L'écran « modifier mon chien » de l'espace client appartient au propriétaire.
 *
 * La garde était une lecture faite avec le client de SESSION : si le chien
 * remontait, c'est qu'on y avait droit. Pour un client, vrai — la politique
 * `client_select_chiens` ne lui rend que les siens. Pour le personnel, faux :
 * `personnel_select_chiens` lui ouvre le SELECT sur TOUS les chiens. Un
 * employé passait donc cette garde pour n'importe quel chien, et l'écriture
 * qui suit se fait avec la clé de service, hors RLS.
 *
 * Un employé SANS `perm_chiens_modifier` pouvait ainsi changer le nom, le
 * poids ou les allergies du chien de n'importe qui. Avec la permission non
 * plus : le personnel passe par l'écran d'administration, qui a sa propre
 * garde. Cette action-ci n'est pas une porte de service.
 */

const H = vi.hoisted(() => ({
  /** Le rôle de l'appelant, tel que le verrait RLS. */
  role: "client" as "client" | "employe" | "admin",
  /** L'utilisateur de la session. */
  userId: "u-client-a" as string | null,
  /** Les fiches clients, par auth_user_id. */
  fiches: new Map<string, { id: string }>(),
  /** Les chiens, par identifiant. */
  chiens: new Map<string, { id: string; client_id: string; nom: string }>(),
  /** Ce qui a été écrit sur la table chiens. */
  ecritures: [] as Record<string, unknown>[],
}));

vi.mock("@sentry/nextjs", () => ({ captureException: () => {}, captureMessage: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); },
}));
vi.mock("@/src/lib/journalEvenements", () => ({ tracerEvenement: async () => {} }));
vi.mock("@/src/lib/cohabitationDb", () => ({ appliquerCohabitationClient: async () => {} }));

/**
 * Le client de SESSION, avec RLS simulée telle qu'elle est en base :
 *   - `client_select_chiens`    → le client ne voit que les siens ;
 *   - `personnel_select_chiens` → le personnel voit TOUS les chiens.
 */
vi.mock("@/src/lib/supabase-server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: H.userId ? { id: H.userId } : null } }) },
    from: (nom: string) => {
      const filtres: Record<string, string> = {};
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (c: string, v: string) => { filtres[c] = v; return chain; },
        maybeSingle: async () => {
          if (nom !== "chiens") return { data: null, error: null };
          const chien = H.chiens.get(filtres.id);
          if (!chien) return { data: null, error: null };
          if (H.role !== "client") return { data: { id: chien.id }, error: null };
          const fiche = H.userId ? H.fiches.get(H.userId) : null;
          return { data: fiche && chien.client_id === fiche.id ? { id: chien.id } : null, error: null };
        },
      };
      return chain;
    },
  }),
}));

vi.mock("@/src/lib/supabase-admin", () => {
  const table = (nom: string) => {
    const filtres: Record<string, string> = {};
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (c: string, v: string) => { filtres[c] = v; return chain; },
      update: (v: Record<string, unknown>) => ({
        eq: async (c: string, val: string) => {
          if (nom === "chiens") H.ecritures.push({ ...v, [c]: val });
          return { error: null };
        },
      }),
      maybeSingle: async () => {
        if (nom === "clients") {
          const fiche = [...H.fiches.entries()].find(([auth]) => auth === filtres.auth_user_id);
          return { data: fiche ? fiche[1] : null, error: null };
        }
        if (nom === "chiens") return { data: H.chiens.get(filtres.id) ?? null, error: null };
        return { data: null, error: null };
      },
    };
    return chain;
  };
  return { supabaseAdmin: { from: table } };
});

import { modifierChienClient } from "@/app/(client)/mon-compte/chiens/[id]/modifier/actions";

const CHIEN_DE_A = "chien-a";
const CHIEN_DE_B = "chien-b";

beforeEach(() => {
  H.role = "client";
  H.userId = "u-client-a";
  H.ecritures.length = 0;
  H.fiches.clear();
  H.fiches.set("u-client-a", { id: "fiche-a" });
  H.fiches.set("u-client-b", { id: "fiche-b" });
  H.chiens.clear();
  H.chiens.set(CHIEN_DE_A, { id: CHIEN_DE_A, client_id: "fiche-a", nom: "Pixel" });
  H.chiens.set(CHIEN_DE_B, { id: CHIEN_DE_B, client_id: "fiche-b", nom: "Nala" });
});

const formulaire = () => {
  const fd = new FormData();
  fd.set("nom", "Renommé");
  fd.set("race", "Berger");
  fd.set("couleur", "noir");
  fd.set("poids", "22");
  fd.set("sexe", "M");
  fd.set("sterilisation", "oui");
  fd.set("numero_puce", "");
  return fd;
};

/** L'action redirige quand elle réussit : la redirection EST le succès. */
const appeler = async (chienId: string) => {
  try {
    const res = await modifierChienClient(chienId, { erreur: null, champ: null, valeurs: {} }, formulaire());
    return { redirige: false, erreur: res?.erreur ?? null };
  } catch (e) {
    const m = (e as Error).message;
    if (m.startsWith("REDIRECT:")) return { redirige: true, erreur: null };
    throw e;
  }
};

describe("modifier un chien depuis l'espace client", () => {
  it("le propriétaire modifie le sien", async () => {
    const r = await appeler(CHIEN_DE_A);
    expect(r.redirige, "le propriétaire a été refusé sur son propre chien").toBe(true);
    expect(H.ecritures).toHaveLength(1);
  });

  it("un client ne touche pas au chien d'un autre", async () => {
    const r = await appeler(CHIEN_DE_B);
    expect(r.erreur).toBeTruthy();
    expect(H.ecritures).toEqual([]);
  });

  it("un employé SANS perm_chiens_modifier est refusé", async () => {
    H.role = "employe";
    H.userId = "u-employe";

    const r = await appeler(CHIEN_DE_A);

    expect(
      H.ecritures,
      "un employé a modifié le chien d'un client par l'écran de l'espace client, sans aucune permission",
    ).toEqual([]);
    expect(r.erreur).toBeTruthy();
  });

  it("un employé AVEC perm_chiens_modifier est refusé lui aussi", async () => {
    // La permission existe, mais elle ouvre l'écran d'ADMINISTRATION, qui a sa
    // propre garde. Cette action-ci n'est pas une porte de service.
    H.role = "employe";
    H.userId = "u-employe-habilite";

    const r = await appeler(CHIEN_DE_A);

    expect(H.ecritures).toEqual([]);
    expect(r.erreur).toBeTruthy();
  });

  it("l'administratrice non plus ne passe pas par cette porte", async () => {
    H.role = "admin";
    H.userId = "u-admin";
    const r = await appeler(CHIEN_DE_A);
    expect(H.ecritures).toEqual([]);
    expect(r.erreur).toBeTruthy();
  });

  it("un employé qui a une fiche INTERNE est refusé sur le chien d'un client", async () => {
    // Le cas qui compte vraiment. Le personnel a des fiches `interne` — c'est
    // par elles qu'il réserve pour son propre chien. Refuser « qui n'a pas de
    // fiche client » ne l'arrête donc pas : seule la comparaison entre le
    // propriétaire du chien et SA fiche le fait.
    H.role = "employe";
    H.userId = "u-employe-interne";
    H.fiches.set("u-employe-interne", { id: "fiche-interne" });

    const r = await appeler(CHIEN_DE_A);

    expect(
      H.ecritures,
      "un employé muni d'une fiche interne a modifié le chien d'un client",
    ).toEqual([]);
    expect(r.erreur).toBeTruthy();
  });

  it("et il modifie bien SON propre chien", async () => {
    // La contrepartie : l'employé est un propriétaire comme un autre pour le
    // chien qui est à lui. Le refus porte sur l'appartenance, pas sur le rôle.
    H.role = "employe";
    H.userId = "u-employe-interne";
    H.fiches.set("u-employe-interne", { id: "fiche-interne" });
    H.chiens.set("chien-interne", { id: "chien-interne", client_id: "fiche-interne", nom: "Titan" });

    const r = await appeler("chien-interne");

    expect(r.redirige, "l'employé a été refusé sur son propre chien").toBe(true);
    expect(H.ecritures).toHaveLength(1);
  });
});
