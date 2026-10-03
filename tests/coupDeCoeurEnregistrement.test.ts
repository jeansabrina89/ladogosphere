import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * APP 62 — cocher ou décocher « Coup de cœur » ÉCRIT la colonne et le JOURNAL.
 *
 * L'action réelle `enregistrerArticle` est appelée, avec la même garde de
 * permission que tous les autres champs de la fiche (`verifierPermissionStock`,
 * niveau gestion). Seuls la base, la garde et le journal sont doublés : ce
 * qu'on vérifie, c'est ce que l'action leur DEMANDE.
 */

type Ligne = Record<string, unknown>;

const H = vi.hoisted(() => ({
  existant: null as Ligne | null,
  maj: [] as { id: unknown; vals: Ligne }[],
  creations: [] as Ligne[],
  journal: [] as Ligne[],
  gardes: [] as unknown[][],
  refusGarde: null as string | null,
}));

vi.mock("@/src/lib/supabase-admin", () => {
  function from(table: string) {
    let op: "update" | "insert" | null = null;
    let vals: Ligne = {};
    const filtres: Ligne = {};
    const chain = {
      select: () => chain,
      update: (v: Ligne) => { op = "update"; vals = v; return chain; },
      insert: (v: Ligne) => { op = "insert"; vals = v; return chain; },
      eq: (c: string, v: unknown) => { filtres[c] = v; return chain; },
      single: () => {
        if (table === "articles" && op === "insert") H.creations.push(vals);
        return Promise.resolve({ data: { id: "nouvel-article" }, error: null });
      },
      then: <T,>(onF: (v: { data: null; error: null }) => T) => {
        if (table === "articles" && op === "update") H.maj.push({ id: filtres.id, vals });
        return Promise.resolve({ data: null, error: null }).then(onF);
      },
    };
    return chain;
  }
  return { supabaseAdmin: { from } };
});

vi.mock("@/src/lib/permissions", () => ({
  verifierPermissionStock: (...a: unknown[]) => {
    H.gardes.push(a);
    return Promise.resolve(H.refusGarde ? { error: H.refusGarde } : { userId: "u-sabrina" });
  },
}));

vi.mock("@/src/lib/boutique", () => ({
  lireArticle: () => Promise.resolve(H.existant),
  enregistrerMouvement: vi.fn(),
  validerInventaire: vi.fn(),
  entrerStockDepuisDepense: vi.fn(),
}));

vi.mock("@/src/lib/tva", () => ({ tauxLegauxEnVigueur: () => Promise.resolve([0, 2.6, 8.1]) }));

vi.mock("@/src/lib/journalEvenements", () => ({
  tracerEvenement: (e: Ligne) => { H.journal.push(e); return Promise.resolve(); },
}));

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); },
}));

const { enregistrerArticle } = await import("@/app/(admin)/boutique/actions");

const ARTICLE = {
  id: "a-1", reference: "ART-0001", nom: "Bozita", categorie: "alimentation_seche",
  composant: false, actif: true, coup_de_coeur: false,
};

/** Le formulaire tel que la fiche l'envoie. */
function formulaire(p: { coche: boolean; montre?: boolean }): FormData {
  const f = new FormData();
  f.set("nom", "Bozita");
  f.set("categorie", "alimentation_seche");
  f.set("taux_tva", "2.6");
  f.set("prix_vente", "12.90");
  f.set("actif", "on");
  f.set("statut_vitrine", "publie");
  if (p.montre !== false) f.set("coup_de_coeur_montre", "1");
  if (p.coche) f.set("coup_de_coeur", "on");
  return f;
}

/** L'action se termine par une redirection : c'est son succès. */
async function enregistrer(id: string | null, f: FormData): Promise<string> {
  try {
    const res = await enregistrerArticle(id, { erreur: null } as never, f);
    return `RETOUR ${JSON.stringify(res)}`;
  } catch (e) {
    return (e as Error).message;
  }
}

beforeEach(() => {
  H.existant = { ...ARTICLE };
  H.maj.length = 0;
  H.creations.length = 0;
  H.journal.length = 0;
  H.gardes.length = 0;
  H.refusGarde = null;
});

describe("cocher « Coup de cœur » sur une fiche existante", () => {
  it("écrit la colonne à vrai, et le journal le dit — avant, après, auteur", async () => {
    expect(await enregistrer("a-1", formulaire({ coche: true }))).toBe("REDIRECT /boutique/articles/a-1");

    expect(H.maj).toHaveLength(1);
    expect(H.maj[0].id).toBe("a-1");
    expect(H.maj[0].vals.coup_de_coeur).toBe(true);

    expect(H.journal).toEqual([{
      entite: "article",
      entiteId: "a-1",
      evenement: "coup_de_coeur_ajoute",
      avant: { coup_de_coeur: false },
      apres: { coup_de_coeur: true },
      userId: "u-sabrina",
    }]);
  });

  it("passe par la MÊME garde que les autres champs de la fiche", async () => {
    await enregistrer("a-1", formulaire({ coche: true }));
    expect(H.gardes).toEqual([["boutique", "gestion"]]);
  });

  it("refusé par la garde : rien n'est écrit, rien n'est journalisé", async () => {
    H.refusGarde = "Accès refusé.";
    const r = await enregistrer("a-1", formulaire({ coche: true }));
    expect(r).toContain("Accès refusé.");
    expect(H.maj).toHaveLength(0);
    expect(H.journal).toHaveLength(0);
  });
});

describe("décocher", () => {
  it("écrit la colonne à faux, et le journal dit « retiré »", async () => {
    H.existant = { ...ARTICLE, coup_de_coeur: true };
    await enregistrer("a-1", formulaire({ coche: false }));

    expect(H.maj[0].vals.coup_de_coeur).toBe(false);
    expect(H.journal).toHaveLength(1);
    expect(H.journal[0].evenement).toBe("coup_de_coeur_retire");
    expect(H.journal[0].avant).toEqual({ coup_de_coeur: true });
    expect(H.journal[0].apres).toEqual({ coup_de_coeur: false });
  });
});

describe("ce qui ne doit PAS se journaliser ni s'écrire", () => {
  it("une fiche réenregistrée sans toucher la case : aucune ligne au journal", async () => {
    H.existant = { ...ARTICLE, coup_de_coeur: true };
    await enregistrer("a-1", formulaire({ coche: true }));
    expect(H.maj[0].vals.coup_de_coeur).toBe(true);
    expect(H.journal).toHaveLength(0);
  });

  it("sans le marqueur (fiche d'atelier) : la colonne n'est pas touchée", async () => {
    H.existant = { ...ARTICLE, coup_de_coeur: true };
    await enregistrer("a-1", formulaire({ coche: false, montre: false }));
    expect("coup_de_coeur" in H.maj[0].vals).toBe(false);
    expect(H.journal).toHaveLength(0);
  });
});

describe("création", () => {
  it("un nouvel article coché naît coup de cœur, et le journal le dit", async () => {
    H.existant = null;
    expect(await enregistrer(null, formulaire({ coche: true })))
      .toBe("REDIRECT /boutique/articles/nouvel-article");
    expect(H.creations[0].coup_de_coeur).toBe(true);
    expect(H.journal).toHaveLength(1);
    expect(H.journal[0]).toMatchObject({
      entiteId: "nouvel-article", evenement: "coup_de_coeur_ajoute",
    });
  });

  it("un nouvel article non coché : colonne à faux, rien au journal", async () => {
    H.existant = null;
    await enregistrer(null, formulaire({ coche: false }));
    expect(H.creations[0].coup_de_coeur).toBe(false);
    expect(H.journal).toHaveLength(0);
  });
});
