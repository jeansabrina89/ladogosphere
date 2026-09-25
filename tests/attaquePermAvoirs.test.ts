import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * C-07a — créditer un avoir n'est plus un encaissement.
 *
 * Décision de Sabrina, 26 septembre 2026 : créditer revient à DONNER de
 * l'argent à un client. Encaisser, c'est recevoir. Les deux se faisaient sous
 * la même permission, si bien que toute personne autorisée à tenir la caisse
 * pouvait créditer n'importe qui, de n'importe quel montant.
 *
 * Le geste manuel — créditer, corriger, retirer — passe par `perm_avoirs`.
 * Payer AVEC un avoir reste un encaissement, et ne bouge pas.
 */

const H = vi.hoisted(() => ({
  /** Les permissions de l'appelant. */
  perms: { perm_encaissements: true, perm_avoirs: false } as Record<string, boolean>,
  estAdmin: false,
  /** Les mouvements d'avoir écrits. */
  mouvements: [] as Record<string, unknown>[],
}));

vi.mock("@sentry/nextjs", () => ({ captureException: () => {}, captureMessage: () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: (u: string) => { throw new Error(`REDIRECT:${u}`); } }));

vi.mock("@/src/lib/verifierPermission", () => ({
  verifierPermission: async (perm: string) =>
    H.estAdmin || H.perms[perm]
      ? { userId: "u-appelant", isAdmin: H.estAdmin }
      : { error: `Permission manquante : ${perm}` },
}));
vi.mock("@/src/lib/permissions", () => ({
  idUtilisateurCourant: async () => "u-appelant",
  verifierPermission: async (perm: string) =>
    H.estAdmin || H.perms[perm]
      ? { userId: "u-appelant", isAdmin: H.estAdmin }
      : { error: `Permission manquante : ${perm}` },
}));
vi.mock("@/src/lib/garde", () => ({ exigerAdmin: async () => ({ userId: "u-appelant" }) }));
vi.mock("@/src/lib/journalEvenements", () => ({ tracerEvenement: async () => {} }));
vi.mock("@/src/lib/comptaAvoir", () => ({
  synchroniserComptaAvoir: async () => {}, contrePasserComptaAvoir: async () => {},
}));
vi.mock("@/src/lib/avoirs", () => ({ getSoldeAvoir: async () => 500 }));
vi.mock("@/src/utils/supabase/server", () => ({ createClient: async () => ({}) }));

vi.mock("@/src/lib/supabase-admin", () => {
  const table = (nom: string) => {
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      insert: (v: Record<string, unknown>) => {
        if (nom === "avoirs_mouvements") H.mouvements.push(v);
        return { select: () => ({ single: async () => ({ data: { id: "mvt-1" }, error: null }),
                                  maybeSingle: async () => ({ data: { id: "mvt-1" }, error: null }) }) };
      },
      update: (v: Record<string, unknown>) => ({
        eq: async () => { if (nom === "avoirs_mouvements") H.mouvements.push(v); return { error: null }; },
      }),
      delete: () => ({ eq: async () => { H.mouvements.push({ supprime: true }); return { error: null }; } }),
      single: async () => ({ data: { montant: 100, type: "ajout_manuel", client_id: "client-a" }, error: null }),
      maybeSingle: async () => ({ data: { montant: 100, type: "ajout_manuel", client_id: "client-a" }, error: null }),
    };
    return chain;
  };
  return { supabaseAdmin: { from: table } };
});

const form = (champs: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(champs)) fd.set(k, v);
  return fd;
};

beforeEach(() => {
  H.perms = { perm_encaissements: true, perm_avoirs: false };
  H.estAdmin = false;
  H.mouvements.length = 0;
});

const actions = async () => import("@/app/(admin)/(espace-clients)/clients/[id]/actions");

const GESTES: [string, () => Promise<{ error?: string }>][] = [
  ["créditer", async () => (await actions()).ajouterAvoir(form({ client_id: "client-a", montant: "50", motif: "geste commercial" }))],
  ["retirer", async () => (await actions()).retirerAvoir(form({ client_id: "client-a", montant: "50", motif: "correction" }))],
  ["corriger", async () => (await actions()).modifierMouvementAvoir(form({ mouvement_id: "mvt-1", client_id: "client-a", nouveau_montant: "60", nouveau_motif: "corrigé" }))],
  ["supprimer", async () => (await actions()).supprimerMouvementAvoir(form({ mouvement_id: "mvt-1", client_id: "client-a" }))],
];

describe("créditer un avoir demande perm_avoirs", () => {
  it.each(GESTES)("%s : perm_encaissements SANS perm_avoirs → refus, rien écrit", async (_nom, geste) => {
    const res = await geste();

    expect(
      H.mouvements,
      "la caisse seule a suffi pour donner de l'argent à un client",
    ).toEqual([]);
    expect(res.error).toBeTruthy();
    expect(res.error).toMatch(/perm_avoirs/);
  });

  it.each(GESTES)("%s : avec perm_avoirs → accepté", async (_nom, geste) => {
    H.perms.perm_avoirs = true;
    const res = await geste();
    expect(res.error, `le geste « ${_nom} » est refusé à qui porte pourtant le droit`).toBeFalsy();
    expect(H.mouvements.length).toBeGreaterThan(0);
  });

  it.each(GESTES)("%s : l'administratrice passe", async (_nom, geste) => {
    H.estAdmin = true;
    H.perms = {};
    const res = await geste();
    expect(res.error).toBeFalsy();
  });

  it("payer AVEC un avoir reste sous perm_encaissements", async () => {
    // La contrepartie de la décision : encaisser un paiement réglé par avoir
    // n'est pas une libéralité, c'est un encaissement. Rien ne change là.
    const src = readFileSync(
      join(__dirname, "..", "app", "(admin)", "(espace-comptabilite)", "factures", "actions.ts"),
      "utf8",
    );
    const encaisser = src.slice(src.indexOf("export async function encaisser"));
    const tete = encaisser.slice(0, encaisser.indexOf("formData.get"));
    expect(tete).toContain('verifierPermission("perm_encaissements")');
    expect(tete).not.toContain("perm_avoirs");
  });
});

describe("l'écran et la route disent la même chose", () => {
  /**
   * Comme au lot 22 D : un bouton qui s'affiche pour un geste que la route
   * refuse fait découvrir le refus en cliquant. Ici, l'inverse serait pire —
   * un bouton caché pour qui a le droit.
   */
  const RACINE = join(__dirname, "..");

  it("la permission est au catalogue, donc sur l'écran des permissions", () => {
    // L'écran de la fiche employé est construit depuis DOMAINES : une
    // permission absente du catalogue n'aurait aucune case à cocher.
    const cat = readFileSync(join(RACINE, "src", "lib", "permissionsCatalogue.ts"), "utf8");
    expect(cat).toContain('"perm_avoirs"');
    expect(cat, "la case n'a pas de libellé sur l'écran").toContain('cle: "perm_avoirs"');
  });

  it("le bloc des avoirs de la fiche client est conditionné au MÊME droit", () => {
    const fiche = readFileSync(
      join(RACINE, "app", "(admin)", "(espace-clients)", "clients", "[id]", "page.tsx"),
      "utf8",
    );

    // On lit la CONDITION, pas la présence du mot quelque part dans le
    // fichier : un commentaire qui cite `perm_avoirs` ne protège personne.
    // (Constaté : la première version de ce test restait verte sous mutation.)
    const lignes = fiche.split("\n");
    const iBloc = lignes.findIndex((l) => l.includes("<GestionAvoir"));
    expect(iBloc, "le bloc GestionAvoir a disparu de la fiche client").toBeGreaterThan(0);

    const condition = lignes
      .slice(Math.max(0, iBloc - 4), iBloc)
      .filter((l) => l.includes("perms."))
      .join(" ");

    expect(
      condition,
      "l'écran offre le crédit d'avoir sans regarder perm_avoirs : le clic mènera à un refus",
    ).toContain("perms.perm_avoirs");
    expect(
      condition,
      "l'écran s'ouvre encore sur perm_encaissements : la caisse verrait un bouton que la route refuse",
    ).not.toContain("perms.perm_encaissements");
  });
});
