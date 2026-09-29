import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  mentionRemiseMembre,
  mentionRemiseMembreArticle,
  rayonRemise,
  type RemiseRayon,
} from "@/src/lib/venteEnLigneLogique";
import { CATEGORIES_ARTICLE } from "@/src/lib/boutiqueLogique";
import { TEXTES_PUBLICS_REMISE_MEMBRE } from "@/src/lib/remiseMembreLogique";

/**
 * APP 43 — la mention de la remise membre dit la vérité, rayon par rayon.
 *
 * ── CE QU'ELLE DISAIT, ET POURQUOI C'ÉTAIT FAUX ───────────────────────────
 *
 * « Membres : −10 % sur la boutique ». Les DEUX moitiés pouvaient mentir. Le
 * taux se règle rayon par rayon depuis APP 27 — il n'y a plus « un » taux. Et
 * « la boutique » cesse d'être vraie dès qu'un rayon est exclu : une cliente
 * lisait la promesse en tête du catalogue, ajoutait une litière exclue, et
 * voyait la remise ne pas venir à la validation.
 *
 * Une promesse faite au visiteur puis retirée au paiement est une petite
 * trahison. On nomme donc ce qui est remisé, sans chiffrer ce qui varie.
 */

/** Tous les rayons du magasin, remisés par défaut. */
const TOUS = (): RemiseRayon[] =>
  CATEGORIES_ARTICLE.map((c) => ({ categorie: c.valeur as string, pourcentage: 10, actif: true }));

/** Seuls ces rayons sont remisés ; les autres sont exclus. */
const SEULEMENT = (...categories: string[]): RemiseRayon[] =>
  TOUS().map((r) => (categories.includes(r.categorie) ? r : { ...r, actif: false }));

// ── Les cas du point 7 ─────────────────────────────────────────────────────

describe("la mention, cas par cas", () => {
  it("l'alimentation seule : les TROIS rayons deviennent un seul mot", () => {
    /**
     * Sèche, humide, complète : trois rayons en magasin, un seul mot dans la
     * bouche d'une cliente. « Remise sur l'alimentation sèche, l'alimentation
     * humide et l'alimentation complète » est exact et illisible.
     */
    expect(
      mentionRemiseMembre(
        SEULEMENT("alimentation_seche", "alimentation_humide", "alimentation_complete"),
      ),
    ).toBe("Membres : remise sur l'alimentation");
  });

  it("UN SEUL rayon d'alimentation : le même mot, pas un de plus", () => {
    // On ne dit pas « l'alimentation sèche » : la cliente n'a pas à connaître
    // notre découpage de rayons pour savoir où porte la remise.
    expect(mentionRemiseMembre(SEULEMENT("alimentation_humide")))
      .toBe("Membres : remise sur l'alimentation");
  });

  it("l'alimentation et la litière", () => {
    expect(
      mentionRemiseMembre(SEULEMENT(
        "alimentation_seche", "alimentation_humide", "alimentation_complete", "litiere",
      )),
    ).toBe("Membres : remise sur l'alimentation et la litière");
  });

  it("trois morceaux : des virgules, puis « et » — jamais de virgule avant « et »", () => {
    expect(mentionRemiseMembre(SEULEMENT("alimentation_seche", "litiere", "jouets")))
      .toBe("Membres : remise sur l'alimentation, la litière et les jouets");
  });

  it("TOUS les rayons : la phrase courte dit mieux la même chose", () => {
    expect(mentionRemiseMembre(TOUS())).toBe("Membres : remise sur toute la boutique");
  });

  it("AUCUN rayon : pas de mention du tout", () => {
    // Pas de phrase vide, pas de « remise sur rien » : l'écran n'affiche rien.
    expect(mentionRemiseMembre(SEULEMENT())).toBeNull();
    expect(mentionRemiseMembre([])).toBeNull();
  });

  it("un rayon à 0 % ne compte pas", () => {
    const rayons = TOUS().map((r) =>
      r.categorie === "litiere" ? r : { ...r, pourcentage: 0 });
    expect(mentionRemiseMembre(rayons)).toBe("Membres : remise sur la litière");
  });

  it("un rayon inactif ne compte pas non plus, même à 10 %", () => {
    const rayons = TOUS().map((r) =>
      r.categorie === "jouets" ? r : { ...r, actif: false });
    expect(mentionRemiseMembre(rayons)).toBe("Membres : remise sur les jouets");
  });

  it("tous à 0 % : rien", () => {
    expect(mentionRemiseMembre(TOUS().map((r) => ({ ...r, pourcentage: 0 })))).toBeNull();
  });

  it("l'ordre est celui du MAGASIN, jamais celui du réglage ni l'alphabet", () => {
    // Les jouets viennent après la litière en rayon ; les citer dans l'ordre du
    // tableau reçu ferait lire deux phrases différentes pour un même réglage.
    const desordre = [
      { categorie: "jouets", pourcentage: 10, actif: true },
      { categorie: "litiere", pourcentage: 10, actif: true },
    ];
    expect(mentionRemiseMembre(desordre))
      .toBe("Membres : remise sur la litière et les jouets");
  });

  it("AUCUN POURCENTAGE n'apparaît, jamais", () => {
    /**
     * C'est le cœur du lot : le taux varie d'un rayon à l'autre, et l'annoncer
     * d'un seul chiffre serait faux pour tous les autres.
     */
    for (const rayons of [TOUS(), SEULEMENT("litiere"), SEULEMENT("alimentation_seche", "jouets")]) {
      const m = mentionRemiseMembre(rayons) ?? "";
      expect(m, m).not.toMatch(/\d/);
      expect(m, m).not.toContain("%");
    }
  });

  it("un rayon sans ligne de réglage compte comme remisé", () => {
    // `actif` absent : c'est le régime par défaut. Un rayon ajouté hier ne doit
    // pas disparaître de la mention en attendant qu'on lui écrive sa ligne.
    expect(rayonRemise({ categorie: "litiere", pourcentage: 10 })).toBe(true);
    expect(rayonRemise({ categorie: "litiere", pourcentage: 0 })).toBe(false);
    expect(rayonRemise({ categorie: "litiere", pourcentage: 10, actif: false })).toBe(false);
  });
});

describe("chaque rayon sait se nommer", () => {
  it("TOUS les rayons du magasin ont leur forme définie", () => {
    /**
     * Un rayon neuf sans sa forme sortirait de la phrase en silence : la
     * mention dirait « remise sur la litière » alors que les mangeoires le sont
     * aussi. Le test les essaie un par un.
     */
    for (const c of CATEGORIES_ARTICLE) {
      const m = mentionRemiseMembre(SEULEMENT(c.valeur as string));
      expect(m, `${c.valeur} doit se nommer`).not.toBeNull();
      expect(m, `${c.valeur} ne doit pas rendre une phrase vide`)
        .not.toBe("Membres : remise sur ");
    }
  });

  it("les formes se lisent en français, article défini compris", () => {
    expect(mentionRemiseMembre(SEULEMENT("friandises")))
      .toBe("Membres : remise sur les friandises et snacks");
    expect(mentionRemiseMembre(SEULEMENT("soins")))
      .toBe("Membres : remise sur les soins et l'hygiène");
    expect(mentionRemiseMembre(SEULEMENT("mastication")))
      .toBe("Membres : remise sur la mastication");
    expect(mentionRemiseMembre(SEULEMENT("cages_enclos")))
      .toBe("Membres : remise sur les cages et enclos");
  });
});

// ── Le point 8 : la fiche d'un article ─────────────────────────────────────

describe("sur une fiche, la mention ne parle que de CET article", () => {
  it("rayon remisé : la mention apparaît", () => {
    expect(
      mentionRemiseMembreArticle({ categorie: "litiere" }, SEULEMENT("litiere")),
    ).toBe("Membres : remise sur cet article");
  });

  it("rayon NON remisé : rien", () => {
    /**
     * Dire « remise sur la boutique » devant un article qui en est exclu serait
     * faux au pire endroit : celui où l'on décide d'acheter.
     */
    expect(
      mentionRemiseMembreArticle({ categorie: "jouets" }, SEULEMENT("litiere")),
    ).toBeNull();
  });

  it("article EXCLU de la remise : rien, même dans un rayon remisé", () => {
    expect(
      mentionRemiseMembreArticle(
        { categorie: "litiere", remise_membre_exclue: true },
        SEULEMENT("litiere"),
      ),
    ).toBeNull();
  });

  it("elle ne nomme JAMAIS les autres rayons", () => {
    // Sur une fiche produit, la liste des rayons remisés serait du bruit.
    const m = mentionRemiseMembreArticle({ categorie: "litiere" }, TOUS()) ?? "";
    expect(m).toBe("Membres : remise sur cet article");
    expect(m).not.toContain("alimentation");
  });

  it("un article sans catégorie connue : rien", () => {
    expect(mentionRemiseMembreArticle({ categorie: null }, TOUS())).toBeNull();
    expect(mentionRemiseMembreArticle({ categorie: "rayon_inconnu" }, TOUS())).toBeNull();
  });
});

// ── Ce que les écrans en font ──────────────────────────────────────────────

const lire = (relatif: string) => readFileSync(join(process.cwd(), relatif), "utf8");

describe("les écrans appellent la fonction, et rien d'autre", () => {
  it("le catalogue, le panier et la fiche lisent les RAYONS", () => {
    for (const f of [
      "app/(public)/catalogue/page.tsx",
      "app/(public)/catalogue/panier/page.tsx",
      "app/(public)/catalogue/[id]/page.tsx",
    ]) {
      expect(lire(f), f).toContain("lireRayonsRemises()");
      expect(lire(f), f).not.toContain("remisePourcent");
    }
  });

  it("la fiche appelle la fonction DE LA FICHE", () => {
    const src = lire("app/(public)/catalogue/[id]/page.tsx");
    expect(src).toContain("mentionRemiseMembreArticle(article,");
  });

  it("AUCUN écran n'écrit la phrase en dur", () => {
    for (const f of [
      "app/(public)/catalogue/page.tsx",
      "app/(public)/catalogue/panier/page.tsx",
      "app/(public)/catalogue/[id]/page.tsx",
    ]) {
      expect(lire(f), f).not.toContain("sur la boutique");
      expect(lire(f), f).not.toMatch(/Membres\s*:\s*−/);
    }
  });
});

describe("le paramètre remise_membre_pourcent n'est plus lu", () => {
  it("il a quitté la requête des paramètres de la boutique", () => {
    /**
     * Il ne servait plus qu'à écrire « −10 % ». Le CALCUL n'en dépendait déjà
     * plus : il lit `remise_membre_categories` rayon par rayon depuis APP 27.
     * Un paramètre lu pour une phrase que le calcul contredit est un mensonge
     * qui attend son heure.
     */
    const src = lire("src/lib/venteEnLigne.ts");
    const requete = src.slice(src.indexOf("export async function lireParametresEnLigne"));
    expect(requete).not.toMatch(/"remise_membre_pourcent"/);
    expect(requete).not.toContain("remisePourcent:");
  });

  it("le CALCUL, lui, lit toujours les rayons et l'exclusion", () => {
    // C'est le constat A.2, gardé : si le calcul revenait au paramètre, la
    // mention et le prix se remettraient à diverger.
    const prix = lire("src/lib/prix.ts");
    expect(prix).toContain('from("remise_membre_categories")');
    expect(prix).toMatch(/remiseParCategorie\.get\(article\.categorie/);
    expect(prix).toMatch(/remise_membre_exclue: article\.remise_membre_exclue/);
  });

  it("la clé n'est PAS supprimée de la base", () => {
    // Elle est dans l'historique du journal des gestes : l'effacer rendrait ces
    // traces illisibles. Aucune migration de ce lot ne la touche.
    const src = lire("src/lib/venteEnLigne.ts");
    expect(src).toMatch(/remise_membre_pourcent/);
    expect(src).toMatch(/RESTE en base|reste en base/);
  });
});

describe("la liste des textes publics suit", () => {
  it("celui de l'application en est SORTI : il se construit tout seul", () => {
    const ou = TEXTES_PUBLICS_REMISE_MEMBRE.map((t) => t.ou).join(" | ");
    expect(ou).not.toContain("Boutique en ligne");
    for (const t of TEXTES_PUBLICS_REMISE_MEMBRE) {
      expect(t.texte, t.ou).not.toBe("Membres : −10 % sur la boutique");
    }
  });

  it("les deux DOCUMENTS y restent, eux", () => {
    /**
     * Une page du site vitrine et des conditions remises au client : ils ne se
     * corrigent pas par effet de bord. On les rappelle pour que Sabrina sache
     * ce qu'il faudra reprendre à la main.
     */
    expect(TEXTES_PUBLICS_REMISE_MEMBRE).toHaveLength(2);
    expect(TEXTES_PUBLICS_REMISE_MEMBRE.map((t) => t.ou)).toEqual([
      "Site vitrine, page Adhésion",
      "Conditions d'adhésion remises au client",
    ]);
  });
});
