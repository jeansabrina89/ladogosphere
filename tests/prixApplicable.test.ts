import { describe, it, expect } from "vitest";
import {
  AVERTISSEMENT_SOUS_PRIX_ACHAT,
  apercuMarge,
  cibleAtteinte,
  enPeriode,
  formatPourcentage,
  libelleRemise,
  mentionCumulEvite,
  mentionDateLimite,
  prixApplicable,
  prixDansContexte,
  promotionsApplicables,
  refusPromotion,
  remiseLigne,
  rubriquesBoutique,
  type ArticlePrix,
  type Promotion,
} from "@/src/lib/prixLogique";

/**
 * La fonction unique de prix.
 *
 * Une seule règle porte tout : sur une ligne, une action et la remise membre ne
 * s'additionnent JAMAIS. La plus avantageuse pour le client s'applique, seule.
 */

const JOUR = "2026-10-05";

function promo(p: Partial<Promotion> & { id: string }): Promotion {
  return {
    nom: "Action du mois",
    type: "action",
    pourcentage: 20,
    date_debut: "2026-10-01",
    date_fin: "2026-10-31",
    cible: "tous",
    texte: null,
    actif: true,
    ordre: 0,
    ...p,
  };
}

function friandise(p: Partial<ArticlePrix> = {}): ArticlePrix {
  return {
    id: "art-friandise",
    prix_vente: 10,
    categorie: "friandises",
    remise_membre_exclue: false,
    promotions: [],
    remise_membre_pourcent: 10,
    ...p,
  };
}

const MEMBRE = { estMembre: true };
const NON_MEMBRE = { estMembre: false };

// ── Une remise à la fois ───────────────────────────────────────────────────

describe("une seule remise", () => {
  it("l’action seule : 10.00 à −20 % font 8.00", () => {
    const r = prixApplicable({
      article: friandise({ promotions: [promo({ id: "p1" })] }),
      client: NON_MEMBRE,
      date: JOUR,
    });
    expect(r.prixBase).toBe(10);
    expect(r.pourcentage).toBe(20);
    expect(r.remise).toBe(2);
    expect(r.prixFinal).toBe(8);
    expect(r.origine).toBe("action");
    expect(r.libelle).toBe("Action du mois −20 %");
    expect(r.cumulEvite).toBe(false);
  });

  it("la remise membre seule : 10.00 à −10 % font 9.00", () => {
    const r = prixApplicable({ article: friandise(), client: MEMBRE, date: JOUR });
    expect(r.prixFinal).toBe(9);
    expect(r.origine).toBe("membre");
    expect(r.libelle).toBe("Remise membre −10 %");
  });

  it("aucune remise : le prix de base est le prix", () => {
    const r = prixApplicable({ article: friandise(), client: NON_MEMBRE, date: JOUR });
    expect(r.prixFinal).toBe(10);
    expect(r.remise).toBe(0);
    expect(r.origine).toBeNull();
    expect(r.libelle).toBeNull();
    expect(remiseLigne(r)).toBeNull();
  });
});

// ── Le non-cumul, la règle qui compte ─────────────────────────────────────

describe("action et remise membre : jamais l’addition", () => {
  it("l’exemple de Sabrina : friandise à 10.00, action −20 %, client membre → 8.00", () => {
    const r = prixApplicable({
      article: friandise({ promotions: [promo({ id: "p1" })] }),
      client: MEMBRE,
      date: JOUR,
    });
    // −20 % puis −10 % feraient 7.20. Ce n'est PAS ce qu'on applique.
    expect(r.prixFinal).toBe(8);
    expect(r.pourcentage).toBe(20);
    expect(r.origine).toBe("action");
    expect(r.candidats).toHaveLength(2);
    expect(r.cumulEvite).toBe(true);
  });

  it("la remise membre l’emporte quand elle est la plus avantageuse", () => {
    const r = prixApplicable({
      article: friandise({
        promotions: [promo({ id: "p1", pourcentage: 5 })],
        remise_membre_pourcent: 15,
      }),
      client: MEMBRE,
      date: JOUR,
    });
    expect(r.prixFinal).toBe(8.5);
    expect(r.origine).toBe("membre");
    expect(r.cumulEvite).toBe(true);
  });

  it("dit à Sabrina laquelle s’est appliquée, et ce qui a été écarté", () => {
    const r = prixApplicable({
      article: friandise({ promotions: [promo({ id: "p1" })] }),
      client: MEMBRE,
      date: JOUR,
    });
    expect(mentionCumulEvite(r)).toBe(
      "Action du mois −20 % s'applique — Remise membre −10 % ne s'y ajoute pas. " +
      "Le client garde la plus avantageuse."
    );
  });

  it("ne dit rien quand il n’y avait rien à arbitrer", () => {
    const r = prixApplicable({ article: friandise(), client: MEMBRE, date: JOUR });
    expect(mentionCumulEvite(r)).toBeNull();
  });
});

describe("deux actions sur un même article", () => {
  it("la plus avantageuse s’applique, une seule fois", () => {
    const r = prixApplicable({
      article: friandise({
        promotions: [
          promo({ id: "p1", nom: "Action du mois", pourcentage: 20 }),
          promo({ id: "p2", nom: "Anti-gaspillage", type: "anti_gaspillage", pourcentage: 30 }),
        ],
      }),
      client: NON_MEMBRE,
      date: JOUR,
    });
    // −20 % puis −30 % feraient 5.60. On applique 30 %, et rien d'autre.
    expect(r.prixFinal).toBe(7);
    expect(r.origine).toBe("anti_gaspillage");
    expect(r.libelle).toBe("Anti-gaspillage −30 %");
    expect(r.cumulEvite).toBe(true);
  });

  it("l’ordre des rubriques ne change pas le résultat", () => {
    const deux = [
      promo({ id: "p2", nom: "Anti-gaspillage", type: "anti_gaspillage", pourcentage: 30 }),
      promo({ id: "p1", nom: "Action du mois", pourcentage: 20 }),
    ];
    const r = prixApplicable({
      article: friandise({ promotions: deux }),
      client: MEMBRE,
      date: JOUR,
    });
    expect(r.prixFinal).toBe(7);
    expect(r.candidats.map((c) => c.pourcentage)).toEqual([30, 20, 10]);
  });
});

// ── Cible, période, type ──────────────────────────────────────────────────

describe("une action réservée aux membres", () => {
  const article = friandise({ promotions: [promo({ id: "p1", cible: "membres" })] });

  it("ne se voit pas d’un visiteur non connecté : ni prix barré, ni mention", () => {
    const r = prixApplicable({ article, client: null, date: JOUR });
    expect(r.prixFinal).toBe(10);
    expect(r.remise).toBe(0);
    expect(r.libelle).toBeNull();
    expect(r.candidats).toHaveLength(0);
  });

  it("ne se voit pas non plus d’un client connecté sans adhésion", () => {
    const r = prixApplicable({ article, client: NON_MEMBRE, date: JOUR });
    expect(r.libelle).toBeNull();
    expect(r.prixFinal).toBe(10);
  });

  it("s’applique au membre", () => {
    const r = prixApplicable({ article, client: MEMBRE, date: JOUR });
    expect(r.prixFinal).toBe(8);
    expect(r.origine).toBe("action");
  });

  it("la cible se décide à part, et se relit", () => {
    expect(cibleAtteinte({ cible: "membres" }, null)).toBe(false);
    expect(cibleAtteinte({ cible: "membres" }, MEMBRE)).toBe(true);
    expect(cibleAtteinte({ cible: "tous" }, null)).toBe(true);
  });
});

describe("hors période", () => {
  const passee = promo({ id: "p1", date_debut: "2026-09-01", date_fin: "2026-09-30" });

  it("ne s’applique pas : le prix redevient le prix de base", () => {
    const r = prixApplicable({
      article: friandise({ promotions: [passee] }),
      client: NON_MEMBRE,
      date: JOUR,
    });
    expect(r.prixFinal).toBe(10);
    expect(r.libelle).toBeNull();
  });

  it("les bornes sont incluses des deux côtés", () => {
    expect(enPeriode({ date_debut: "2026-10-01", date_fin: "2026-10-31" }, "2026-10-01")).toBe(true);
    expect(enPeriode({ date_debut: "2026-10-01", date_fin: "2026-10-31" }, "2026-10-31")).toBe(true);
    expect(enPeriode({ date_debut: "2026-10-01", date_fin: "2026-10-31" }, "2026-09-30")).toBe(false);
    expect(enPeriode({ date_debut: "2026-10-01", date_fin: "2026-10-31" }, "2026-11-01")).toBe(false);
  });

  it("une rubrique désactivée ne s’applique pas davantage", () => {
    const r = prixApplicable({
      article: friandise({ promotions: [promo({ id: "p1", actif: false })] }),
      client: NON_MEMBRE,
      date: JOUR,
    });
    expect(r.prixFinal).toBe(10);
  });
});

describe("les Nouveautés mettent en avant, elles ne remisent pas", () => {
  it("n’ont pas de pourcentage, donc ne changent aucun prix", () => {
    const r = prixApplicable({
      article: friandise({
        promotions: [promo({ id: "p1", type: "nouveaute", nom: "Nouveautés", pourcentage: null })],
      }),
      client: NON_MEMBRE,
      date: JOUR,
    });
    expect(r.prixFinal).toBe(10);
    expect(r.candidats).toHaveLength(0);
  });

  it("restent pourtant des rubriques applicables : c'est leur raison d'être", () => {
    const rubrique = promo({ id: "p1", type: "nouveaute", pourcentage: null });
    expect(promotionsApplicables([rubrique], null, JOUR)).toHaveLength(1);
  });
});

// ── L'exclusion de la remise membre ───────────────────────────────────────

describe("exclusion de la remise membre", () => {
  it("une catégorie exclue (0 %) n’ouvre aucune remise, et n’en annonce aucune", () => {
    const r = prixApplicable({
      article: friandise({ remise_membre_pourcent: 0 }),
      client: MEMBRE,
      date: JOUR,
    });
    expect(r.prixFinal).toBe(10);
    expect(r.libelle).toBeNull();
    expect(r.candidats).toHaveLength(0);
  });

  it("un article exclu individuellement n’en montre rien non plus", () => {
    const r = prixApplicable({
      article: friandise({ remise_membre_exclue: true }),
      client: MEMBRE,
      date: JOUR,
    });
    expect(r.prixFinal).toBe(10);
    expect(r.libelle).toBeNull();
  });

  it("mais une action continue de s’y appliquer : ce sont deux choses", () => {
    const r = prixApplicable({
      article: friandise({ remise_membre_exclue: true, promotions: [promo({ id: "p1" })] }),
      client: MEMBRE,
      date: JOUR,
    });
    expect(r.prixFinal).toBe(8);
    expect(r.origine).toBe("action");
    expect(r.cumulEvite).toBe(false);
  });

  it("une catégorie à un autre taux que 10 % s’applique telle quelle", () => {
    const r = prixApplicable({
      article: friandise({ prix_vente: 40, remise_membre_pourcent: 5 }),
      client: MEMBRE,
      date: JOUR,
    });
    expect(r.prixFinal).toBe(38);
    expect(r.libelle).toBe("Remise membre −5 %");
  });

  it("un taux à décimale s’écrit à la française", () => {
    expect(formatPourcentage(7.5)).toBe("7,5");
    expect(formatPourcentage(20)).toBe("20");
    expect(libelleRemise("Action du mois", 7.5)).toBe("Action du mois −7,5 %");
  });
});

// ── Ce qui se fige sur la ligne ───────────────────────────────────────────

describe("la remise figée sur la ligne", () => {
  it("porte le prix de base réel, le taux et l’origine nommée", () => {
    const r = prixApplicable({
      article: friandise({ promotions: [promo({ id: "p1" })] }),
      client: MEMBRE,
      date: JOUR,
    });
    expect(remiseLigne(r)).toEqual({
      prix_base: 10,
      remise_pourcentage: 20,
      remise_origine: "action",
      remise_libelle: "Action du mois −20 %",
    });
  });

  it("le prix de base est celui de l’article, jamais un prix gonflé", () => {
    const r = prixApplicable({
      article: friandise({ prix_vente: "10.00", promotions: [promo({ id: "p1" })] }),
      client: NON_MEMBRE,
      date: JOUR,
    });
    // Le comparatif est bien le prix pratiqué hors action : 10.00, pas 12.50.
    expect(r.prixBase).toBe(10);
  });
});

// ── Le même calcul, côté navigateur ───────────────────────────────────────

describe("le contexte mis à plat", () => {
  it("donne exactement le même prix que la fonction directe", () => {
    const ctx = {
      date: JOUR,
      promotionsParArticle: { "art-friandise": [promo({ id: "p1" })] },
      remiseParCategorie: { friandises: 10 },
    };
    const plat = prixDansContexte(
      ctx,
      { id: "art-friandise", prix_vente: 10, categorie: "friandises" },
      MEMBRE
    );
    const direct = prixApplicable({
      article: friandise({ promotions: [promo({ id: "p1" })] }),
      client: MEMBRE,
      date: JOUR,
    });
    expect(plat.prixFinal).toBe(direct.prixFinal);
    expect(plat.libelle).toBe(direct.libelle);
  });

  it("une catégorie absente de la carte est une catégorie exclue", () => {
    const plat = prixDansContexte(
      { date: JOUR, promotionsParArticle: {}, remiseParCategorie: {} },
      { id: "a", prix_vente: 10, categorie: "friandises" },
      MEMBRE
    );
    expect(plat.prixFinal).toBe(10);
    expect(plat.libelle).toBeNull();
  });
});

// ── Les rubriques de la boutique ──────────────────────────────────────────

describe("les rubriques affichées", () => {
  const nouveautes = promo({ id: "p1", nom: "Nouveautés", type: "nouveaute", pourcentage: null, ordre: 1 });
  const action = promo({ id: "p2", nom: "Action du mois", ordre: 0 });

  it("une rubrique vide ne s’affiche pas", () => {
    const rubriques = rubriquesBoutique(
      [nouveautes, action],
      new Map([["p2", [{ id: "a1" }]]]),
      null,
      JOUR
    );
    expect(rubriques.map((r) => r.promotion.id)).toEqual(["p2"]);
  });

  it("l’ordre choisi par Sabrina est respecté", () => {
    const rubriques = rubriquesBoutique(
      [nouveautes, action],
      new Map([["p1", [{ id: "a1" }]], ["p2", [{ id: "a2" }]]]),
      null,
      JOUR
    );
    expect(rubriques.map((r) => r.promotion.nom)).toEqual(["Action du mois", "Nouveautés"]);
  });

  it("une rubrique « membres » n’existe pas pour un visiteur", () => {
    const reservee = promo({ id: "p3", cible: "membres" });
    const pour = (client: { estMembre: boolean } | null) =>
      rubriquesBoutique([reservee], new Map([["p3", [{ id: "a1" }]]]), client, JOUR);
    expect(pour(null)).toHaveLength(0);
    expect(pour(NON_MEMBRE)).toHaveLength(0);
    expect(pour(MEMBRE)).toHaveLength(1);
  });

  it("une rubrique hors période ne s’affiche pas", () => {
    const finie = promo({ id: "p4", date_debut: "2026-01-01", date_fin: "2026-01-31" });
    expect(rubriquesBoutique([finie], new Map([["p4", [{ id: "a1" }]]]), null, JOUR)).toHaveLength(0);
  });
});

// ── L'anti-gaspillage ─────────────────────────────────────────────────────

describe("la date limite", () => {
  it("s’écrit « À écouler avant le 12 octobre »", () => {
    expect(mentionDateLimite("2026-10-12")).toBe("À écouler avant le 12 octobre");
    expect(mentionDateLimite("2026-08-01")).toBe("À écouler avant le 1 août");
  });

  it("ne dit rien sans date", () => {
    expect(mentionDateLimite(null)).toBeNull();
    expect(mentionDateLimite("")).toBeNull();
    expect(mentionDateLimite("pas une date")).toBeNull();
  });
});

// ── La marge pendant la saisie ────────────────────────────────────────────

describe("l’aperçu de marge", () => {
  it("montre le prix remisé et ce qui reste", () => {
    const m = apercuMarge({ prixVente: 10, prixAchat: 6, pourcentage: 20 });
    expect(m.prixRemise).toBe(8);
    expect(m.marge).toBe(2);
    expect(m.sousLePrixDAchat).toBe(false);
  });

  it("prévient quand on passerait sous le prix d’achat — sans bloquer", () => {
    const m = apercuMarge({ prixVente: 10, prixAchat: 9, pourcentage: 30 });
    expect(m.prixRemise).toBe(7);
    expect(m.marge).toBe(-2);
    expect(m.sousLePrixDAchat).toBe(true);
    expect(AVERTISSEMENT_SOUS_PRIX_ACHAT).toContain("à perte");
  });

  it("ne prévient de rien quand le prix d’achat n’est pas renseigné", () => {
    const m = apercuMarge({ prixVente: 10, prixAchat: null, pourcentage: 30 });
    expect(m.marge).toBeNull();
    expect(m.sousLePrixDAchat).toBe(false);
  });
});

// ── Les refus de saisie ───────────────────────────────────────────────────

describe("refus de saisie d’une rubrique", () => {
  const base = {
    nom: "Action du mois", type: "action", pourcentage: 20,
    date_debut: "2026-10-01", date_fin: "2026-10-31", cible: "tous",
  };

  it("accepte une action bien formée", () => {
    expect(refusPromotion(base)).toBeNull();
  });

  it("exige un pourcentage sur une action", () => {
    expect(refusPromotion({ ...base, pourcentage: null })?.champ).toBe("pourcentage");
    expect(refusPromotion({ ...base, pourcentage: 0 })?.champ).toBe("pourcentage");
  });

  it("exige un pourcentage sur un anti-gaspillage", () => {
    expect(refusPromotion({ ...base, type: "anti_gaspillage", pourcentage: null })?.champ)
      .toBe("pourcentage");
  });

  it("refuse un pourcentage sur une nouveauté", () => {
    const refus = refusPromotion({ ...base, type: "nouveaute", pourcentage: 10 });
    expect(refus?.champ).toBe("pourcentage");
    expect(refus?.message).toContain("sans remiser");
  });

  it("accepte une nouveauté sans pourcentage", () => {
    expect(refusPromotion({ ...base, type: "nouveaute", pourcentage: null })).toBeNull();
  });

  it("refuse une fin avant le début", () => {
    expect(refusPromotion({ ...base, date_fin: "2026-09-01" })?.champ).toBe("date_fin");
  });

  it("refuse une cible inventée", () => {
    expect(refusPromotion({ ...base, cible: "vip" })?.champ).toBe("cible");
  });

  it("refuse un pourcentage au-delà de 100", () => {
    expect(refusPromotion({ ...base, pourcentage: 120 })?.champ).toBe("pourcentage");
  });
});
