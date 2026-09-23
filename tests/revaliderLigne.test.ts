import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  revaliderLigne,
  refusNombreDeLignes,
  refusPrixModifie,
  choixDepuisConfiguration,
  PANIER_QUANTITE_MAX,
  PANIER_LIGNES_MAX,
  type ArticleCatalogue,
  type Catalogue,
} from "@/src/lib/panier/revaliderLigne";
import type { OptionGroupe, OptionValeur } from "@/src/lib/personnalisationLogique";

/**
 * La revalidation d'une ligne de panier, contre un catalogue EN MÉMOIRE : ce
 * que le navigateur envoie n'est qu'un jeu d'identifiants, et tout le reste —
 * prix, suppléments, poids, libellés — sort du catalogue.
 */

const ART = "11111111-1111-4111-8111-111111111111";
const COLLIER = "22222222-2222-4222-8222-222222222222";
const G_LARGEUR = "33333333-3333-4333-8333-333333333333";
const G_GRAVURE = "44444444-4444-4444-8444-444444444444";
const V_16 = "55555555-5555-4555-8555-555555555555";
const V_50 = "66666666-6666-4666-8666-666666666666";
const V_AUTRE = "77777777-7777-4777-8777-777777777777";

function valeur(id: string, libelle: string, ordre: number, supplement = 0): OptionValeur {
  return {
    id, libelle, ordre, image_path: null, code_couleur: null,
    supplement_prix: supplement, supplement_delai_jours: 0,
    composant_article_id: null, composant_quantite: null, actif: true, defaut: false,
  };
}

function groupe(p: Partial<OptionGroupe> & { id: string; nom: string }): OptionGroupe {
  return {
    type: "liste", obligatoire: false, ordre: 1, aide: null, max_caracteres: null,
    depend_de_groupe_id: null, valeurs: [], ...p,
  };
}

function article(p: Partial<ArticleCatalogue> = {}): ArticleCatalogue {
  return {
    id: ART, nom: "Laisse 2 m", prix_vente: 43, taux_tva: 0, secteur_tdfn: "commerce",
    type_article: "standard", poids_grammes: 250, stock_disponible: 5, ...p,
  };
}

/** Le catalogue de référence : une laisse ordinaire, un collier sur mesure. */
function catalogue(p: { articles?: ArticleCatalogue[]; prixFinal?: number } = {}): Catalogue {
  const liste = p.articles ?? [
    article(),
    article({ id: COLLIER, nom: "collier 23", prix_vente: 43, type_article: "personnalisable", stock_disponible: 0, poids_grammes: 90 }),
  ];
  return {
    articles: new Map(liste.map((a) => [a.id, a])),
    options: new Map([[COLLIER, {
      groupes: [
        groupe({
          id: G_LARGEUR, nom: "Largeur", ordre: 1, obligatoire: true,
          valeurs: [valeur(V_16, "16 mm", 1), valeur(V_50, "50 mm", 2, 5)],
        }),
        groupe({
          id: G_GRAVURE, nom: "Gravure", type: "texte", ordre: 2, max_caracteres: 20,
        }),
      ],
      dependances: [],
    }]]),
    prixArticle: (a) => ({
      prixFinal: p.prixFinal ?? a.prix_vente,
      prix_base: null, remise_pourcentage: null, remise_origine: null, remise_libelle: null,
    }),
  };
}

const AUTRE_GROUPE = groupe({ id: G_GRAVURE, nom: "Gravure", valeurs: [valeur(V_AUTRE, "Ailleurs", 1)] });

describe("revaliderLigne", () => {
  it("option inconnue : OPTION_INCONNUE", () => {
    const res = revaliderLigne(
      { article_id: COLLIER, quantite: 1, choix: { [G_LARGEUR]: { valeur_id: "88888888-8888-4888-8888-888888888888" } } },
      catalogue(),
    );
    expect(res).toMatchObject({ ok: false, code: "OPTION_INCONNUE", champ: G_LARGEUR });
  });

  it("valeur d'un autre groupe : OPTION_INCOMPATIBLE", () => {
    const cat = catalogue();
    cat.options.get(COLLIER)!.groupes.push(AUTRE_GROUPE);
    const res = revaliderLigne(
      { article_id: COLLIER, quantite: 1, choix: { [G_LARGEUR]: { valeur_id: V_AUTRE } } },
      cat,
    );
    expect(res).toMatchObject({ ok: false, code: "OPTION_INCOMPATIBLE", champ: G_LARGEUR });
  });

  it("groupe cité deux fois : OPTION_DOUBLON", () => {
    const res = revaliderLigne(
      {
        article_id: COLLIER, quantite: 1,
        choix: [{ groupe_id: G_LARGEUR, valeur_id: V_16 }, { groupe_id: G_LARGEUR, valeur_id: V_50 }],
      },
      catalogue(),
    );
    expect(res).toMatchObject({ ok: false, code: "OPTION_DOUBLON", champ: G_LARGEUR });
  });

  it("groupe obligatoire absent : OPTION_MANQUANTE", () => {
    const res = revaliderLigne(
      { article_id: COLLIER, quantite: 1, choix: { [G_GRAVURE]: { texte: "Pixel" } } },
      catalogue(),
    );
    expect(res).toMatchObject({ ok: false, code: "OPTION_MANQUANTE", champ: G_LARGEUR });
  });

  it("quantité 999 : le plafond d'abord, le stock ensuite", () => {
    // Stock 5 : le plafond (20) tombe avant, c'est lui qu'on annonce.
    expect(revaliderLigne({ article_id: ART, quantite: 999 }, catalogue()))
      .toMatchObject({ ok: false, code: "QUANTITE_PLAFOND", champ: "quantite" });
    // Sous le plafond mais au-dessus du stock : QUANTITE_STOCK.
    expect(revaliderLigne({ article_id: ART, quantite: 6 }, catalogue()))
      .toMatchObject({ ok: false, code: "QUANTITE_STOCK", champ: "quantite" });
    expect(PANIER_QUANTITE_MAX).toBe(20);
  });

  it("quantité 0, -1, 1.5, « 3 » : QUANTITE_INVALIDE", () => {
    for (const q of [0, -1, 1.5, "3", null, undefined, NaN] as unknown[]) {
      expect(revaliderLigne({ article_id: ART, quantite: q as number }, catalogue()))
        .toMatchObject({ ok: false, code: "QUANTITE_INVALIDE", champ: "quantite" });
    }
  });

  it("un prix envoyé par le navigateur est ignoré : la ligne sort à 43.00", () => {
    const res = revaliderLigne({ article_id: ART, quantite: 2, prix_unitaire: 0.01 }, catalogue());
    expect(res).toMatchObject({ ok: true, prix_unitaire: 43, montant: 86, prixClientIgnore: true });
  });

  it("article inactif ou dépublié : ARTICLE_INDISPONIBLE", () => {
    // Le catalogue ne contient QUE ce qui est vendable : absent = refusé.
    const res = revaliderLigne({ article_id: ART, quantite: 1 }, catalogue({ articles: [] }));
    expect(res).toMatchObject({ ok: false, code: "ARTICLE_INDISPONIBLE", champ: "article_id" });
  });

  it("combinaison complète et valide : prix = base + suppléments, poids reporté", () => {
    const res = revaliderLigne(
      {
        article_id: COLLIER, quantite: 1,
        choix: { [G_LARGEUR]: { valeur_id: V_50 }, [G_GRAVURE]: { texte: "Pixel" } },
      },
      catalogue(),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.prix_unitaire).toBe(48); // 43 + 5 de supplément
    expect(res.montant).toBe(48);
    expect(res.libelle).toBe("collier 23 — sur mesure");
    expect(res.poids_grammes).toBe(90);
    expect(res.quantite).toBe(1);
    expect(res.configuration?.map((c) => [c.groupe_nom, c.valeur_libelle]))
      .toEqual([["Largeur", "50 mm"], ["Gravure", "Pixel"]]);
    // Les identifiants voyagent avec les libellés : c'est ce qui permet de
    // revalider la même ligne à la confirmation.
    expect(res.configuration?.[0]).toMatchObject({ groupe_id: G_LARGEUR, valeur_id: V_50 });
  });

  it("une ligne ordinaire ne prend pas d'options, une ligne sur mesure en exige", () => {
    expect(revaliderLigne({ article_id: ART, quantite: 1, choix: { [G_LARGEUR]: { valeur_id: V_16 } } }, catalogue()))
      .toMatchObject({ ok: false, code: "ARTICLE_CONFIGURABLE" });
    expect(revaliderLigne({ article_id: COLLIER, quantite: 1 }, catalogue()))
      .toMatchObject({ ok: false, code: "ARTICLE_CONFIGURABLE" });
    // Panier d'une version précédente : libellés figés, sans identifiants.
    expect(revaliderLigne({ article_id: COLLIER, quantite: 1, configuration: [{ groupe_nom: "Largeur" }] }, catalogue()))
      .toMatchObject({ ok: false, code: "CONFIGURATION_ILLISIBLE" });
  });

  it("le sur-mesure reste à l'unité, quoi que demande le navigateur", () => {
    const res = revaliderLigne(
      { article_id: COLLIER, quantite: 7, choix: { [G_LARGEUR]: { valeur_id: V_16 } } },
      catalogue(),
    );
    expect(res).toMatchObject({ ok: true, quantite: 1 });
  });

  it("le prix du catalogue l'emporte, remise d'adhésion comprise", () => {
    const res = revaliderLigne({ article_id: ART, quantite: 2 }, catalogue({ prixFinal: 38.7 }));
    expect(res).toMatchObject({ ok: true, prix_unitaire: 38.7, montant: 77.4 });
  });
});

describe("les garde-fous du panier entier", () => {
  it("plus de 50 lignes : LIGNES_MAX", () => {
    expect(refusNombreDeLignes(PANIER_LIGNES_MAX)).toBeNull();
    expect(refusNombreDeLignes(PANIER_LIGNES_MAX + 1)).toMatchObject({ ok: false, code: "LIGNES_MAX" });
  });

  it("un prix qui bouge entre la mise au panier et la validation : PRIX_MODIFIE", () => {
    expect(refusPrixModifie(43, 43)).toBeNull();
    expect(refusPrixModifie(43, 39)).toMatchObject({ ok: false, code: "PRIX_MODIFIE" });
  });

  it("les identifiants se relisent dans une configuration figée, et seulement s'ils y sont", () => {
    expect(choixDepuisConfiguration([{ groupe_id: G_LARGEUR, valeur_id: V_16, groupe_nom: "Largeur" }]))
      .toEqual({ [G_LARGEUR]: { valeur_id: V_16, texte: null, nombre: null } });
    expect(choixDepuisConfiguration([{ groupe_nom: "Largeur", valeur_libelle: "16 mm" }])).toBeUndefined();
    expect(choixDepuisConfiguration(null)).toBeUndefined();
  });
});

// ── Le branchement, là où il compte ────────────────────────────────────────

describe("les deux portes passent par la revalidation", () => {
  const lire = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");

  it("la fusion : tout ou rien, et le prix du navigateur n'est jamais lu", () => {
    const src = lire("app", "(public)", "catalogue", "actionsFusion.ts");
    expect(src).toContain("revaliderLigne(");
    expect(src).toMatch(/if \(!res\.ok\) return \{ error: res\.message, code: res\.code, champ: res\.champ \};/);
    expect(src).toContain("prix_client_ignore");
    // Les lignes déjà au compte sont nommées, pas effacées.
    expect(src).toContain("invalides.push(");
    expect(src).not.toMatch(/\.delete\(\)/);
  });

  it("la validation rejoue la même fonction, et refuse un prix qui a bougé", () => {
    const src = lire("app", "(public)", "catalogue", "actions.ts");
    expect(src).toContain("async function revaliderAvantValidation");
    expect(src).toContain("refusPrixModifie(");
    expect(src).toContain("chargerCatalogue(");
    // Le total part des lignes relues en base, jamais d'un montant envoyé.
    expect(src).toContain("totalCommande({ lignes, fraisPort: option.frais })");
  });

  it("la mise au panier aussi, pour l'article simple comme pour le configuré", () => {
    const src = lire("app", "(public)", "catalogue", "actions.ts");
    const ajouter = src.slice(src.indexOf("export async function ajouterAuPanier"), src.indexOf("export async function changerQuantite"));
    expect(ajouter).toContain("revaliderLigne({ article_id: articleId, quantite: voulue }, catalogue)");
    expect(ajouter).toContain("relue.prix_unitaire");
  });

  it("le catalogue se charge en une fois, avec les règles de la vitrine", () => {
    const src = lire("src", "lib", "panier", "catalogue.ts");
    expect(src).toContain('.eq("actif", true)');
    expect(src).toContain('.eq("vendable_en_ligne", true)');
    expect(src).toContain('.eq("statut_vitrine", "publie")');
    expect(src).toContain(".in(\"id\", ids)");
    expect(src).toContain("lireCatalogueOptions");
  });
});
