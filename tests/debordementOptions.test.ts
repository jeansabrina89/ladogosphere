import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Garde-fou contre le débordement des lignes d'options.
 *
 * Ce défaut est revenu deux fois. Sa cause est toujours la même : un élément
 * de grille ou de flex garde son plancher implicite (`min-width: auto`, la
 * largeur minimale de son contenu) et refuse de rétrécir ; il sort alors de sa
 * carte, emportant les actions hors de portée.
 *
 * On rend le composant avec un contenu RÉALISTE — 7 largeurs, 70 coloris aux
 * noms longs, et une matrice de dépendances de 7 colonnes, comme la « Gamme
 * BioThane » — puis on relit le balisage produit. Trois valeurs courtes ne
 * prouveraient rien.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock("@/src/lib/supabase-admin", () => ({ supabaseAdmin: {} }));
vi.mock("@/src/lib/permissions", () => ({
  verifierPermissionBoutique: async () => ({ userId: "u" }),
}));

import GestionOptions from "@/app/components/options/GestionOptions";
import type { Dependance, OptionGroupe, OptionValeur } from "@/src/lib/personnalisationLogique";

/** La largeur utile d'une carte max-w-3xl : 768 − 2 × 24 de padding. */
const LARGEUR_UTILE = 720;
/** La plus petite fenêtre visée, moins les marges de page et de carte. */
const LARGEUR_UTILE_MOBILE = 293;

const LIBELLE_LONG = "Bleu nuit métallisé réfléchissant profond";

function valeur(id: string, libelle: string, ordre: number): OptionValeur {
  return {
    id, libelle, ordre, image_path: `coloris/${id}.webp`, code_couleur: "#1B2B5E",
    supplement_prix: 6, supplement_delai_jours: 0,
    composant_article_id: null, composant_quantite: null, actif: true, defaut: false,
  };
}

const LARGEUR: OptionGroupe = {
  id: "g-largeur", nom: "Largeur", type: "liste", obligatoire: true, ordre: 1,
  aide: null, max_caracteres: null, depend_de_groupe_id: null,
  valeurs: ["9 mm", "13 mm", "16 mm", "19 mm", "25 mm", "38 mm", "50 mm"]
    .map((l, i) => valeur(`l${i}`, l, i + 1)),
};

/** 70 coloris aux noms longs, comme la vraie gamme. */
const COULEUR: OptionGroupe = {
  id: "g-couleur", nom: "Couleur de la partie gravée", type: "couleur",
  obligatoire: true, ordre: 2, aide: null, max_caracteres: null,
  depend_de_groupe_id: "g-largeur",
  valeurs: Array.from({ length: 70 }, (_, i) =>
    valeur(`c${i}`, `${LIBELLE_LONG} ${i + 1}`, i + 1)),
};

/** Chaque coloris disponible dans chaque largeur : la matrice est pleine. */
const DEPENDANCES: Dependance[] = COULEUR.valeurs.flatMap((c) =>
  LARGEUR.valeurs.map((l) => ({ valeur_id: c.id, valeur_requise_id: l.id }))
);

const html = renderToStaticMarkup(
  React.createElement(GestionOptions, {
    porteur: "modele:m-1",
    groupes: [LARGEUR, COULEUR],
    dependances: DEPENDANCES,
    fournitures: [],
    sources: [],
    portee: "Ce modèle sert à 3 articles : Collier, Laisse, Harnais.",
  } as never)
);

/** Les styles inline du balisage produit, un par élément. */
const styles = [...html.matchAll(/style="([^"]*)"/g)].map((m) => m[1]);

const planchers = (st: string): number | null => {
  const m = st.match(/min-width:(\d+)px/);
  return m ? Number(m[1]) : null;
};

describe("le contenu de recette est bien celui du vrai modèle", () => {
  it("rend 7 largeurs, 70 coloris et une matrice de 7 colonnes", () => {
    expect(html).toContain("9 mm");
    expect(html).toContain("50 mm");
    expect(html).toContain(`${LIBELLE_LONG} 70`);
    // La matrice : 70 lignes × 7 colonnes de cases à cocher.
    const cases = (html.match(/type="checkbox"/g) ?? []).length;
    expect(cases).toBe(70 * 7);
  });
});

describe("aucune ligne ne peut refuser de rétrécir", () => {
  it("la rangée d'actions se replie au lieu de déborder", () => {
    // flex-shrink:0 sur la rangée d'actions est précisément ce qui la faisait
    // sortir de la carte à 375 px : elle doit pouvoir se replier.
    const rangees = styles.filter((st) => st.includes("margin-left:auto") && st.includes("flex-wrap:wrap"));
    expect(rangees.length).toBeGreaterThan(0);
    for (const st of rangees) {
      expect(st, `rangée d'actions figée : ${st}`).not.toContain("flex-shrink:0");
      expect(st, `rangée d'actions sans min-width:0 : ${st}`).toContain("min-width:0");
    }
  });

  it("la carte d'un groupe peut descendre sous la largeur de la matrice", () => {
    // Sans min-width:0, elle s'étire à la largeur du tableau et sort de la grille.
    const cartes = styles.filter(
      (st) => st.includes("border-radius:16px") && st.includes("padding:14px")
    );
    expect(cartes.length).toBeGreaterThan(0);
    for (const st of cartes) {
      expect(st, `carte de groupe sans min-width:0 : ${st}`).toContain("min-width:0");
    }
  });

  it("la grille qui les porte ne pose pas de plancher non plus", () => {
    const grilles = styles.filter((st) => /display:grid/.test(st) && /gap:16px/.test(st));
    expect(grilles.length).toBeGreaterThan(0);
    for (const st of grilles) {
      expect(st, `grille sans min-width:0 : ${st}`).toContain("min-width:0");
    }
  });
});

describe("aucun plancher plus large que son conteneur", () => {
  it("rien ne dépasse la largeur utile d'une carte sur grand écran", () => {
    const trop = styles
      .map(planchers)
      .filter((v): v is number => v !== null && v > LARGEUR_UTILE);
    expect(trop, `planchers au-delà de ${LARGEUR_UTILE}px : ${JSON.stringify(trop)}`).toEqual([]);
  });

  it("aucun plancher hors matrice ne dépasse la largeur utile d'un téléphone", () => {
    // Le tableau de la matrice défile dans son propre conteneur : ses colonnes
    // ont le droit d'être larges. Tout le reste doit tenir à 375 px.
    const horsMatrice = styles.filter((st) => !st.includes("vertical-align:middle"));
    const trop = horsMatrice
      .map(planchers)
      .filter((v): v is number => v !== null && v > LARGEUR_UTILE_MOBILE);
    expect(trop, `planchers au-delà de ${LARGEUR_UTILE_MOBILE}px : ${JSON.stringify(trop)}`).toEqual([]);
  });

  it("les flex-basis restent en dessous de la largeur utile d'un téléphone", () => {
    // Un flex-basis trop grand ne déborde pas s'il peut rétrécir, mais il
    // annonce une intention : au-delà, on n'a plus rien à quoi se raccrocher.
    const bases = [...html.matchAll(/flex:1 1 (\d+)px/g)].map((m) => Number(m[1]));
    expect(bases.length).toBeGreaterThan(0);
    expect(bases.filter((b) => b > LARGEUR_UTILE_MOBILE)).toEqual([]);
  });
});

describe("le tableau de la matrice défile, la page non", () => {
  it("le tableau large est enfermé dans un conteneur de défilement", () => {
    expect(html).toContain('class="overflow-x-auto"');
    // Et ce conteneur précède bien le tableau.
    const i = html.indexOf('class="overflow-x-auto"');
    const j = html.indexOf("<table", i);
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
  });

  it("aucun overflow-x n'a été posé sur une rangée d'actions", () => {
    // On ne fait pas défiler une barre d'outils : si quelqu'un cachait le
    // problème comme ça, ce test le dirait.
    for (const st of styles.filter((s) => s.includes("margin-left:auto"))) {
      expect(st).not.toContain("overflow-x");
    }
  });
});
