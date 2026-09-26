import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Les photos de chiens ne survivent pas à ce qu'elles illustrent (APP 28).
 *
 * Une photo de chien est une donnée personnelle rattachée à un propriétaire
 * identifiable — c'est tout l'objet du lot 24, qui a rendu le bucket privé. Mais
 * privé n'est pas effacé : jusqu'ici, remplacer une photo ou supprimer une fiche
 * laissait l'objet dans le bucket, plus référencé par rien. Invisible, et
 * toujours là.
 *
 * ── CE QUE CE FICHIER GARDE SURTOUT : L'ORDRE ─────────────────────────────
 *
 * L'ancienne photo part APRÈS que la nouvelle est déposée ET enregistrée. Dans
 * l'autre ordre, une panne entre les deux laisse le chien sans photo — et la
 * photo perdue pour de bon, puisqu'elle était la seule. C'est la différence
 * entre un octet oublié dans un bucket et une image que la cliente ne retrouvera
 * jamais.
 */

const H = vi.hoisted(() => ({
  /** Les objets présents dans le bucket, par chemin. */
  bucket: new Set<string>(),
  /** Les suppressions demandées, dans l'ordre. */
  retires: [] as string[],
  /** Le bucket refuse-t-il la suppression ? (B.3) */
  refuseSuppression: false,
  /** Les messages envoyés à Sentry : l'échec doit être journalisé. */
  journal: [] as string[],
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: (e: unknown) => { H.journal.push(String(e)); },
  captureMessage: (m: string) => { H.journal.push(m); },
}));

vi.mock("@/src/lib/supabase-admin", () => ({
  supabaseAdmin: {
    storage: {
      from: () => ({
        remove: async (chemins: string[]) => {
          H.retires.push(...chemins);
          if (H.refuseSuppression) {
            return { data: null, error: { message: "objet verrouillé" } };
          }
          for (const c of chemins) H.bucket.delete(c);
          return { data: chemins.map((c) => ({ name: c })), error: null };
        },
      }),
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
    }),
  },
}));

vi.mock("@/src/lib/garde", () => ({ lireAppelant: async () => null }));

const { oublierPhotoChien } = await import("@/src/lib/photoChien");

beforeEach(() => {
  H.bucket.clear();
  H.retires.length = 0;
  H.journal.length = 0;
  H.refuseSuppression = false;
});

describe("oublier une photo", () => {
  it("retire l'objet du bucket", async () => {
    H.bucket.add("abc/1700000000.webp");
    const r = await oublierPhotoChien("abc/1700000000.webp", { motif: "remplacement" });
    expect(r.supprime).toBe(true);
    expect(H.retires).toEqual(["abc/1700000000.webp"]);
    expect(H.bucket.has("abc/1700000000.webp")).toBe(false);
  });

  it("un chemin vide n'est pas une anomalie : un chien peut n'avoir jamais eu de photo", async () => {
    for (const vide of [null, undefined, "", "   "]) {
      const r = await oublierPhotoChien(vide, { motif: "suppression" });
      expect(r.supprime).toBe(false);
    }
    expect(H.retires, "rien ne doit partir vers le bucket").toEqual([]);
    expect(H.journal, "et rien ne doit être signalé").toEqual([]);
  });

  it("un échec du bucket est JOURNALISÉ, et ne lève pas", async () => {
    /**
     * B.3. Le geste de l'utilisateur a déjà réussi quand on arrive ici : la
     * nouvelle photo est enregistrée, ou la fiche est supprimée. Lever ferait
     * afficher une erreur pour une opération parfaitement réussie, et
     * inviterait la cliente à refaire un geste déjà fait.
     */
    H.refuseSuppression = true;
    H.bucket.add("abc/1.webp");

    const r = await oublierPhotoChien("abc/1.webp", { chienId: "abc", motif: "remplacement" });

    expect(r.supprime, "l'échec est rendu, pas lancé").toBe(false);
    expect(H.bucket.has("abc/1.webp"), "l'objet reste à nettoyer").toBe(true);
    // Et on sait LEQUEL : sans le chemin dans le message, le ménage est
    // impossible à rattraper.
    expect(H.journal.join(" ")).toContain("abc/1.webp");
    expect(H.journal.join(" ")).toContain("remplacement");
  });
});

describe("l'ordre, relu dans le code", () => {
  const src = (c: string) => readFileSync(join(__dirname, "..", c), "utf8");

  it("au remplacement : l'ancien part APRÈS l'enregistrement du nouveau", () => {
    /**
     * Le test qui compte. On lit les positions dans le fichier : le dépôt, puis
     * l'`update` de la fiche, puis seulement l'oubli de l'ancien.
     *
     * Dans l'autre ordre, une panne entre la suppression et l'enregistrement
     * laisserait le chien sans photo, définitivement.
     */
    const route = src("app/api/chiens/[id]/photo/route.ts");
    const depot = route.indexOf("await deposerImage(");
    const enregistrement = route.indexOf("photo_principale: depot.chemin");
    const oubli = route.indexOf("oublierPhotoChien(ancienChemin");

    expect(depot, "le dépôt doit exister").toBeGreaterThan(0);
    expect(enregistrement, "l'enregistrement doit exister").toBeGreaterThan(0);
    expect(oubli, "l'oubli doit exister").toBeGreaterThan(0);
    expect(enregistrement, "enregistrer AVANT d'oublier").toBeGreaterThan(depot);
    expect(oubli, "oublier APRÈS avoir enregistré").toBeGreaterThan(enregistrement);
  });

  it("l'ancien chemin est lu AVANT le dépôt : après, il a disparu de la fiche", () => {
    const route = src("app/api/chiens/[id]/photo/route.ts");
    expect(route.indexOf("const ancienChemin"))
      .toBeLessThan(route.indexOf("await deposerImage("));
  });

  it("on n'oublie pas la photo qu'on vient d'enregistrer", () => {
    // Si le dépôt écrasait le même chemin, supprimer « l'ancien » supprimerait
    // le nouveau. La condition l'empêche.
    expect(src("app/api/chiens/[id]/photo/route.ts"))
      .toContain("ancienChemin !== depot.chemin");
  });

  it("à la suppression d'un chien : le chemin est relevé par le DELETE lui-même", () => {
    /**
     * `.select("id, photo_principale")` sur le DELETE : c'est la seule façon
     * d'avoir le chemin ET la preuve que la ligne a bien été supprimée. Lire
     * avant, puis supprimer, laisserait une fenêtre où la photo change.
     */
    const actions = src("app/(admin)/(espace-clients)/chiens/[id]/actions.ts");
    expect(actions).toContain('.select("id, photo_principale")');
    expect(actions).toContain("motif: \"suppression du chien\"");
    // Après le contrôle du nombre de lignes : si la suppression a échoué, la
    // photo doit rester — le chien est toujours là.
    // On vise l'APPEL, pas l'import qui le précède en tête de fichier.
    expect(actions.indexOf("await oublierPhotoChien("))
      .toBeGreaterThan(actions.indexOf("n'a pas pu être supprimée"));
  });

  it("à la suppression d'un client : les chiens sont relevés AVANT la cascade", () => {
    /**
     * La suppression de la fiche emporte les chiens. Après coup, plus rien ne dit
     * quels objets du bucket leur appartenaient : ils y resteraient pour
     * toujours — des photos de chiens dont le propriétaire a demandé
     * l'effacement.
     */
    const actions = src("app/(admin)/(espace-clients)/clients/[id]/actions.ts");
    const releve = actions.indexOf("chiensDuClient");
    const suppression = actions.indexOf('.from("clients")\n    .delete()'.replace("\n", actions.includes("\r\n") ? "\r\n" : "\n"));
    expect(releve, "les chiens doivent être relevés").toBeGreaterThan(0);
    expect(suppression, "le DELETE doit exister").toBeGreaterThan(0);
    expect(releve, "relever AVANT de supprimer").toBeLessThan(suppression);
    expect(actions).toContain("motif: \"suppression du client\"");
  });

  it("un seul module porte la suppression dans ce bucket", () => {
    // La même règle que pour la signature (lot 24) : deux portes, c'est une
    // porte de trop. Un `remove` écrit ailleurs échapperait au journal.
    const photoChien = src("src/lib/photoChien.ts");
    expect(photoChien).toContain("storage.from(BUCKET_CHIENS).remove");
    for (const chemin of [
      "app/api/chiens/[id]/photo/route.ts",
      "app/(admin)/(espace-clients)/chiens/[id]/actions.ts",
      "app/(admin)/(espace-clients)/clients/[id]/actions.ts",
    ]) {
      expect(src(chemin), `${chemin} ne doit pas appeler remove() directement`)
        .not.toMatch(/storage[\s\S]{0,80}\.remove\(/);
    }
  });
});
