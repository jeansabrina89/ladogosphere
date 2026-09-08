import { describe, it, expect } from "vitest";
import {
  recalculerTailles,
  libelleDeduction,
  type GroupeTaille,
  type Taille,
} from "@/src/lib/taillesLogique";
import { detailPrix, prixTotal } from "@/src/lib/personnalisationLogique";
import type {
  Dependance, OptionGroupe, OptionValeur,
} from "@/src/lib/personnalisationLogique";

/**
 * Le parcours complet d'un collier : mesure → taille → largeur → coloris.
 * C'est la chaîne que la grille de tailles vient s'insérer au milieu, sans
 * qu'aucun des maillons existants change.
 */

function valeur(id: string, libelle: string, ordre: number, supplement = 0): OptionValeur {
  return {
    id, libelle, ordre, image_path: null, code_couleur: null,
    supplement_prix: supplement, supplement_delai_jours: 0,
    composant_article_id: null, composant_quantite: null, actif: true, defaut: false,
  };
}

function taille(id: string, libelle: string, min: number, ordre: number, supplement = 0): Taille {
  return { ...valeur(id, libelle, ordre, supplement), borne_min: min, borne_max: null };
}

const COU: GroupeTaille = {
  id: "g-cou", nom: "Tour de cou", type: "mesure", obligatoire: true, ordre: 1,
  aide: null, max_caracteres: null, depend_de_groupe_id: null,
  unite: "cm", valeur_min: 15, valeur_max: 90, valeurs: [],
};

const TAILLE: GroupeTaille = {
  id: "g-taille", nom: "Taille", type: "taille", obligatoire: true, ordre: 2,
  aide: null, max_caracteres: null, depend_de_groupe_id: null,
  unite: "cm", mode_taille: "seuils", mesure_groupe_id: "g-cou",
  valeurs: [
    taille("xxs", "XXS", 0, 1),
    taille("xs", "XS", 21, 2),
    taille("s", "S", 27, 3),
    taille("m", "M", 33, 4, 3),
    taille("l", "L", 41, 5, 6),
    taille("xl", "XL", 51, 6, 9),
    taille("xxl", "XXL", 65, 7, 12),
  ],
};

const LARGEUR: OptionGroupe = {
  id: "g-largeur", nom: "Largeur", type: "liste", obligatoire: true, ordre: 3,
  aide: null, max_caracteres: null, depend_de_groupe_id: "g-taille",
  valeurs: [valeur("l19", "19 mm", 1), valeur("l25", "25 mm", 2, 2), valeur("l38", "38 mm", 3, 4)],
};

const COLORIS: OptionGroupe = {
  id: "g-coloris", nom: "Coloris", type: "couleur", obligatoire: true, ordre: 4,
  aide: null, max_caracteres: null, depend_de_groupe_id: "g-largeur",
  valeurs: [valeur("ocre", "Ocre", 1), valeur("noir", "Noir", 2)],
};

const GROUPES: GroupeTaille[] = [COU, TAILLE, LARGEUR, COLORIS];

/** M et L proposent les trois largeurs ; XXL seulement le 38. */
const DEPENDANCES: Dependance[] = [
  ...["l19", "l25", "l38"].map((l) => ({ valeur_id: l, valeur_requise_id: "m" })),
  ...["l19", "l25", "l38"].map((l) => ({ valeur_id: l, valeur_requise_id: "l" })),
  { valeur_id: "l38", valeur_requise_id: "xxl" },
  // L'ocre n'existe pas en 38 mm.
  { valeur_id: "ocre", valeur_requise_id: "l19" },
  { valeur_id: "ocre", valeur_requise_id: "l25" },
  { valeur_id: "noir", valeur_requise_id: "l19" },
  { valeur_id: "noir", valeur_requise_id: "l25" },
  { valeur_id: "noir", valeur_requise_id: "l38" },
];

describe("recalcul de la taille depuis la mesure", () => {
  it("déduit la taille de la mesure saisie et le dit", () => {
    const r = recalculerTailles(GROUPES, { "g-cou": { nombre: 38 } }, DEPENDANCES);
    expect(r.choix["g-taille"].valeur_id).toBe("m");
    expect(r.messages.join(" ")).toContain("38 cm → M");
  });

  it("l'écrit en clair pour le client", () => {
    expect(libelleDeduction(TAILLE, COU, 38, TAILLE.valeurs[3] as Taille))
      .toBe("Tour de cou 38 cm → taille M");
  });

  it("20,5 donne XXS et non XS ; 21 donne XS", () => {
    expect(recalculerTailles(GROUPES, { "g-cou": { nombre: 20.5 } }, DEPENDANCES)
      .choix["g-taille"].valeur_id).toBe("xxs");
    expect(recalculerTailles(GROUPES, { "g-cou": { nombre: 21 } }, DEPENDANCES)
      .choix["g-taille"].valeur_id).toBe("xs");
  });

  it("n'écrase jamais une taille posée à la main", () => {
    const r = recalculerTailles(GROUPES, {
      "g-cou": { nombre: 38 },
      "g-taille": { valeur_id: "l", taille_choisie_directement: true },
    }, DEPENDANCES);
    // 38 cm donnerait M, mais le client a dit L : on ne le contredit pas.
    expect(r.choix["g-taille"].valeur_id).toBe("l");
  });

  it("laisse la mesure vide quand la taille est choisie directement", () => {
    const r = recalculerTailles(GROUPES, {
      "g-taille": { valeur_id: "l", taille_choisie_directement: true },
      "g-largeur": { valeur_id: "l25" },
    }, DEPENDANCES);
    expect(r.choix["g-taille"].valeur_id).toBe("l");
    expect(r.choix["g-largeur"].valeur_id).toBe("l25");
    expect(r.messages).toEqual([]);
  });

  it("changer la mesure efface le coloris devenu impossible, en nommant ce qui a changé", () => {
    const depart = recalculerTailles(GROUPES, {
      "g-cou": { nombre: 38 },
      "g-largeur": { valeur_id: "l25" },
      "g-coloris": { valeur_id: "ocre" },
    }, DEPENDANCES);
    expect(depart.choix["g-coloris"].valeur_id).toBe("ocre");

    // 70 cm → XXL (65 et plus), qui ne propose que le 38 mm ; l'ocre n'existe
    // pas en 38. Le collier passe donc de 25 mm ocre à rien du tout, et le dit.
    const apres = recalculerTailles(
      GROUPES,
      { ...depart.choix, "g-cou": { nombre: 70 } },
      DEPENDANCES
    );

    expect(apres.choix["g-taille"].valeur_id).toBe("xxl");
    expect(apres.choix["g-largeur"].valeur_id ?? null).toBeNull();
    expect(apres.choix["g-coloris"].valeur_id ?? null).toBeNull();

    const dit = apres.messages.join(" ");
    expect(dit).toContain("70 cm → XXL");
    expect(dit).toContain("Largeur");
    expect(dit).toContain("25 mm");
  });

  it("efface la taille et le dit quand la mesure sort de la grille", () => {
    const basse: GroupeTaille[] = [
      COU,
      { ...TAILLE, valeurs: [taille("s", "S", 27, 1)] },
    ];
    const r = recalculerTailles(basse, {
      "g-cou": { nombre: 10 }, "g-taille": { valeur_id: "s" },
    });
    expect(r.choix["g-taille"].valeur_id ?? null).toBeNull();
    expect(r.messages.join(" ")).toContain("en dessous");
  });

  it("ne touche à rien sur un parcours sans grille de tailles", () => {
    const r = recalculerTailles([LARGEUR, COLORIS], { "g-largeur": { valeur_id: "l25" } }, []);
    expect(r.choix["g-largeur"].valeur_id).toBe("l25");
    expect(r.messages).toEqual([]);
  });
});

describe("le prix suit la taille et la largeur", () => {
  it("compte le supplément porté par la taille", () => {
    const r = recalculerTailles(GROUPES, { "g-cou": { nombre: 45 } }, DEPENDANCES);
    expect(r.choix["g-taille"].valeur_id).toBe("l");
    expect(detailPrix(GROUPES, r.choix, DEPENDANCES).find((d) => d.groupe === "Taille")?.supplement)
      .toBe(6);
  });

  it("détaille ligne par ligne, comme le client doit le lire", () => {
    const r = recalculerTailles(GROUPES, {
      "g-cou": { nombre: 45 }, "g-largeur": { valeur_id: "l38" },
    }, DEPENDANCES);
    const lignes = detailPrix(GROUPES, r.choix, DEPENDANCES)
      .map((d) => `${d.groupe} : ${d.libelle} +${d.supplement.toFixed(2)}`);
    expect(lignes).toContain("Taille : L +6.00");
    expect(lignes).toContain("Largeur : 38 mm +4.00");
    expect(prixTotal(45, GROUPES, r.choix, DEPENDANCES)).toBe(55);
  });

  it("le supplément de combinaison REMPLACE celui de la largeur, il ne s'y ajoute pas", () => {
    // En taille L, le 38 mm coûte 9 au lieu de ses 4 habituels.
    const avecCombinaison: Dependance[] = DEPENDANCES.map((d) =>
      d.valeur_id === "l38" && d.valeur_requise_id === "l"
        ? { ...d, supplement_prix: 9 }
        : d
    );
    const r = recalculerTailles(GROUPES, {
      "g-cou": { nombre: 45 }, "g-largeur": { valeur_id: "l38" },
    }, avecCombinaison);

    const largeur = detailPrix(GROUPES, r.choix, avecCombinaison)
      .find((d) => d.groupe === "Largeur")!;
    expect(largeur.supplement).toBe(9);
    expect(largeur.contexte).toBe("L");
    // 45 + 6 (taille) + 9 (combinaison) = 60, et non 45 + 6 + 4 + 9.
    expect(prixTotal(45, GROUPES, r.choix, avecCombinaison)).toBe(60);
  });
});
