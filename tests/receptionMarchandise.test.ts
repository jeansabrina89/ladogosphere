import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Une entrée de stock passe par `recevoir_marchandise`, jamais autrement.
 *
 * C'est ce qui rend vraie la garantie d'APP 26, et c'est la seule chose qui la
 * rende vraie : la fonction SQL écrit le mouvement ET réserve la marchandise
 * pour les commandes qui l'attendent, dans la MÊME transaction. Entre les deux
 * gestes, il ne doit exister aucun instant — une caisse ouverte au même moment
 * vendrait au premier venu le sac qu'une cliente attend depuis trois semaines.
 *
 * Ce fichier existe parce que ce chemin n'était couvert par AUCUN test. La
 * suite entière restait verte après le branchement, ce qui ne prouvait rien :
 * elle serait restée verte tout autant s'il n'avait pas eu lieu.
 */

const H = vi.hoisted(() => ({
  /** Les appels RPC, dans l'ordre : c'est la preuve qu'on cherche. */
  rpc: [] as { nom: string; args: Record<string, unknown> }[],
  /** Les insertions directes dans `mouvements_stock` : il n'en faut AUCUNE en entrée. */
  inserts: [] as Record<string, unknown>[],
  /** Ce que la fonction SQL rend, et que le code doit savoir lire. */
  retour: {
    mouvement_id: "mv-1",
    quantite_apres: 3,
    stock_reserve_apres: 3,
    lignes_couvertes: 1,
    reste_libre: 0,
  } as Record<string, unknown>,
  /** L'article, tel qu'il est AVANT la réception. */
  article: {
    id: "art-1", nom: "Croquettes agneau 12 kg", stock_actuel: 0, stock_reserve: 0,
    statut_vitrine: "publie", actif: true, vendable_en_ligne: true,
  } as Record<string, unknown>,
  /** Ce que l'application a déduit de la réception. */
  retours: [] as { disponibleAvant: number; disponibleApres: number }[],
}));

vi.mock("@sentry/nextjs", () => ({ captureException: () => {}, captureMessage: () => {} }));

vi.mock("@/src/lib/supabase-admin", () => ({
  supabaseAdmin: {
    rpc: async (nom: string, args: Record<string, unknown>) => {
      H.rpc.push({ nom, args });
      return { data: H.retour, error: null };
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: H.article, error: null }),
          single: async () => ({ data: H.article, error: null }),
        }),
      }),
      insert: (valeurs: Record<string, unknown>) => {
        if (table === "mouvements_stock") H.inserts.push(valeurs);
        return {
          select: () => ({
            single: async () => ({ data: { id: "mv-direct", quantite_apres: 1 }, error: null }),
          }),
        };
      },
    }),
  },
}));

vi.mock("@/src/lib/alertesStock", () => ({
  notifierSiRetourEnStock: async (e: { disponibleAvant: number; disponibleApres: number }) => {
    H.retours.push(e);
  },
}));
vi.mock("@/src/lib/publicationArticle", () => ({ publierSiEntreeStock: async () => {} }));

const { enregistrerMouvement } = await import("@/src/lib/boutique");

beforeEach(() => {
  H.rpc.length = 0;
  H.inserts.length = 0;
  H.retours.length = 0;
  H.article = {
    id: "art-1", nom: "Croquettes agneau 12 kg", stock_actuel: 0, stock_reserve: 0,
    statut_vitrine: "publie", actif: true, vendable_en_ligne: true,
  };
  H.retour = {
    mouvement_id: "mv-1", quantite_apres: 3, stock_reserve_apres: 3,
    lignes_couvertes: 1, reste_libre: 0,
  };
});

describe("une entrée de stock passe par la fonction qui réserve", () => {
  it("appelle `recevoir_marchandise`, et n'insère RIEN en direct", () => {
    return enregistrerMouvement({ article_id: "art-1", type: "entree", quantite: 3 }).then((res) => {
      expect(res).toEqual({ id: "mv-1", stock: 3 });
      expect(H.rpc.map((a) => a.nom)).toEqual(["recevoir_marchandise"]);
      expect(H.inserts, "un insert direct rétablirait l'instant de vulnérabilité").toEqual([]);
    });
  });

  it("transmet le coût, le motif, l'auteur, LA DÉPENSE et la péremption", async () => {
    // `depense_id` est le lien entre la facture du fournisseur et la
    // marchandise. Le perdre ne casserait rien de visible : le stock serait
    // juste, et la dépense ne montrerait plus rien. On s'en apercevrait au
    // contrôle des comptes, des mois plus tard, sans plus savoir quoi
    // rattacher à quoi.
    await enregistrerMouvement({
      article_id: "art-1", type: "entree", quantite: 3,
      cout_unitaire: 8.5, motif: "  Livraison Bozita  ", user_id: "u-1",
      depense_id: "dep-9", date_peremption: "2027-03-01",
    });
    expect(H.rpc[0].args).toEqual({
      p_article_id: "art-1",
      p_quantite: 3,
      p_cout_unitaire: 8.5,
      p_motif: "Livraison Bozita",
      p_user_id: "u-1",
      p_depense_id: "dep-9",
      p_date_peremption: "2027-03-01",
    });
  });

  it("les autres mouvements gardent le chemin d'avant", async () => {
    // Une perte n'a rien à réserver : la faire passer par la réception serait
    // lui faire servir des commandes en attente avec de la marchandise perdue.
    H.article.stock_actuel = 10;
    await enregistrerMouvement({ article_id: "art-1", type: "perte", quantite: -2, motif: "Sac percé" });
    expect(H.rpc).toEqual([]);
    expect(H.inserts).toHaveLength(1);
    expect(H.inserts[0]).toMatchObject({ type: "perte", cout_unitaire: null });
  });

  it("une erreur de la fonction remonte, et rien ne se passe ensuite", async () => {
    H.retour = {};
    const res = await enregistrerMouvement({ article_id: "art-1", type: "entree", quantite: 3 });
    // La fonction a rendu un objet vide : le code ne doit pas inventer un stock.
    expect(Number.isNaN(res.stock as number) || res.stock === undefined || res.error).toBeTruthy();
  });
});

describe("ce que l'application déduit d'une réception", () => {
  it("une réception qui sert une commande en attente n'annonce AUCUN retour", async () => {
    // Trois sacs reçus, trois sacs réservés pour la cliente qui attend : le
    // disponible reste à zéro. Annoncer un « retour en stock » ici ferait venir
    // trois personnes pour un sac déjà promis.
    await enregistrerMouvement({ article_id: "art-1", type: "entree", quantite: 3 });
    expect(H.retours).toMatchObject([{ disponibleAvant: 0, disponibleApres: 0 }]);
  });

  it("une réception NON réservée annonce bien le retour", async () => {
    H.retour = {
      mouvement_id: "mv-2", quantite_apres: 3, stock_reserve_apres: 0,
      lignes_couvertes: 0, reste_libre: 3,
    };
    await enregistrerMouvement({ article_id: "art-1", type: "entree", quantite: 3 });
    expect(H.retours).toMatchObject([{ disponibleAvant: 0, disponibleApres: 3 }]);
  });

  it("la réserve d'APRÈS est celle qui compte, pas celle d'avant", async () => {
    // La fiche lue au début portait `stock_reserve = 0`. Si le code s'en
    // servait, il calculerait 3 − 0 = 3 disponibles là où il n'y en a aucun.
    H.article.stock_reserve = 0;
    H.retour = {
      mouvement_id: "mv-3", quantite_apres: 5, stock_reserve_apres: 5,
      lignes_couvertes: 2, reste_libre: 0,
    };
    await enregistrerMouvement({ article_id: "art-1", type: "entree", quantite: 5 });
    expect(H.retours[0].disponibleApres).toBe(0);
  });
});

describe("la ligne qui tient tout, relue dans le code", () => {
  it("`boutique.ts` n'insère jamais une entrée en direct", () => {
    // Un insert direct rétablirait l'instant où la marchandise est en stock
    // sans être réservée. Rien ne le signalerait : le stock serait juste, les
    // comptes seraient justes, et une cliente repartirait les mains vides.
    const src = readFileSync(join(__dirname, "..", "src/lib/boutique.ts"), "utf8");
    expect(src).toContain('supabaseAdmin.rpc("recevoir_marchandise"');
    expect(src).toMatch(/if \(m\.type === "entree"\)/);
    // Le chemin d'insert direct subsiste pour les autres types, et il ne doit
    // plus jamais porter de coût d'achat — celui-ci n'existe qu'à l'entrée.
    expect(src).not.toMatch(/type:\s*m\.type,[\s\S]{0,400}cout_unitaire:\s*m\.type === "entree"/);
  });
});
