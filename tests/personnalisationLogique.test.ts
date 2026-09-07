import { describe, it, expect } from "vitest";
import {
  TYPES_GROUPE,
  libelleTypeGroupe,
  valeursActives,
  valeurRetenue,
  choixParDefaut,
  detailPrix,
  prixTotal,
  delaiTotal,
  libelleDelai,
  datePromise,
  groupesManquants,
  messageManquants,
  refusConfiguration,
  bornerTexte,
  caracteresRestants,
  figerChoix,
  composantsAConsommer,
  statutSuivant,
  estEnRetard,
  libelleStatutCommande,
  libelleDepuisNomFichier,
  normaliserCouleur,
  type OptionGroupe,
  type ChoixParGroupe,
} from "@/src/lib/personnalisationLogique";

function valeur(over: Partial<Parameters<typeof valeursActives>[0]["valeurs"][number]> = {}) {
  return {
    id: "v",
    libelle: "Valeur",
    image_path: null,
    code_couleur: null,
    supplement_prix: 0,
    supplement_delai_jours: 0,
    composant_article_id: null,
    composant_quantite: null,
    actif: true,
    ordre: 1,
    defaut: false,
    ...over,
  };
}

/** Le collier du parcours : largeur, deux couleurs, gravure, puce NFC. */
const groupes: OptionGroupe[] = [
  {
    id: "g1", nom: "Largeur", type: "liste", obligatoire: true, ordre: 1, aide: null, max_caracteres: null,
    valeurs: [
      valeur({ id: "l20", libelle: "20 mm", ordre: 1, defaut: true }),
      valeur({ id: "l25", libelle: "25 mm", ordre: 2, supplement_prix: 4 }),
      valeur({ id: "l30", libelle: "30 mm", ordre: 3, supplement_prix: 8, supplement_delai_jours: 2 }),
    ],
  },
  {
    id: "g2", nom: "Couleur de la sangle", type: "couleur", obligatoire: true, ordre: 2,
    aide: "La teinte se juge en grand : touchez une vignette.", max_caracteres: null,
    valeurs: [
      valeur({ id: "bleu", libelle: "Bleu nuit", code_couleur: "#1b2b5e", ordre: 1,
               composant_article_id: "sangle-bleue", composant_quantite: 1.2 }),
      valeur({ id: "rouge", libelle: "Rouge brique", code_couleur: "#a8453a", ordre: 2,
               supplement_prix: 2, composant_article_id: "sangle-rouge", composant_quantite: 1.2 }),
      valeur({ id: "retire", libelle: "Vert sapin", ordre: 3, actif: false }),
    ],
  },
  {
    id: "g3", nom: "Gravure", type: "texte", obligatoire: false, ordre: 3,
    aide: null, max_caracteres: 20, valeurs: [],
  },
  {
    id: "g4", nom: "Avec puce NFC", type: "booleen", obligatoire: true, ordre: 4,
    aide: null, max_caracteres: null,
    valeurs: [valeur({ id: "nfc", libelle: "Puce NFC", supplement_prix: 12,
                       supplement_delai_jours: 3, composant_article_id: "puce", composant_quantite: 1 })],
  },
];

const complet: ChoixParGroupe = {
  g1: { valeur_id: "l25" },
  g2: { valeur_id: "bleu" },
  g3: { texte: "Rex" },
  g4: { booleen: true },
};

describe("catalogue d'options", () => {
  it("nomme les quatre types de groupe", () => {
    expect(TYPES_GROUPE).toHaveLength(4);
    expect(libelleTypeGroupe("couleur")).toBe("Couleur");
    expect(libelleTypeGroupe("booleen")).toBe("Oui / non");
    expect(libelleTypeGroupe("autre")).toBe("—");
  });

  it("une valeur désactivée reste en base mais pas à l'écran", () => {
    expect(valeursActives(groupes[1]).map((v) => v.id)).toEqual(["bleu", "rouge"]);
    expect(valeurRetenue(groupes[1], { g2: { valeur_id: "retire" } })).toBeNull();
  });

  it("part des valeurs marquées par défaut", () => {
    const depart = choixParDefaut(groupes);
    expect(depart.g1).toEqual({ valeur_id: "l20" });
    expect(depart.g2).toBeUndefined();
    expect(depart.g3).toEqual({ texte: "" });
    expect(depart.g4).toEqual({ booleen: false });
  });
});

describe("prix", () => {
  it("additionne les suppléments au prix de base", () => {
    // 60 de base + 4 (25 mm) + 0 (bleu) + 12 (NFC)
    expect(prixTotal(60, groupes, complet)).toBe(76);
  });

  it("détaille chaque supplément, dans l'ordre des groupes", () => {
    expect(detailPrix(groupes, { ...complet, g2: { valeur_id: "rouge" } })).toEqual([
      { groupe: "Largeur", libelle: "25 mm", supplement: 4 },
      { groupe: "Couleur de la sangle", libelle: "Rouge brique", supplement: 2 },
      { groupe: "Avec puce NFC", libelle: "Puce NFC", supplement: 12 },
    ]);
  });

  it("un choix sans supplément n'apparaît pas au détail", () => {
    const detail = detailPrix(groupes, { g1: { valeur_id: "l20" }, g2: { valeur_id: "bleu" } });
    expect(detail).toEqual([]);
    expect(prixTotal(60, groupes, { g1: { valeur_id: "l20" }, g2: { valeur_id: "bleu" } })).toBe(60);
  });

  it("le non d'un « oui / non » ne coûte rien", () => {
    expect(prixTotal(60, groupes, { ...complet, g4: { booleen: false } })).toBe(64);
  });

  it("un prix de base absent ne casse rien", () => {
    expect(prixTotal(null, groupes, complet)).toBe(16);
  });
});

describe("délai", () => {
  it("allonge le délai de base des choix qui le demandent", () => {
    // 10 de base + 0 (25 mm) + 3 (NFC)
    expect(delaiTotal(10, groupes, complet)).toBe(13);
    // 30 mm ajoute 2 jours de plus
    expect(delaiTotal(10, groupes, { ...complet, g1: { valeur_id: "l30" } })).toBe(15);
    expect(delaiTotal(10, groupes, { ...complet, g4: { booleen: false } })).toBe(10);
  });

  it("s'annonce en français", () => {
    expect(libelleDelai(13)).toBe("Environ 13 jours ouvrables");
    expect(libelleDelai(1)).toBe("Environ 1 jour ouvrable");
    expect(libelleDelai(0)).toBe("Disponible tout de suite");
  });

  it("compte la date promise en jours ouvrables", () => {
    // Lundi 7 septembre 2026 + 5 jours ouvrables = lundi 14.
    expect(datePromise("2026-09-07", 5)).toBe("2026-09-14");
    // Vendredi + 1 jour ouvrable = lundi.
    expect(datePromise("2026-09-11", 1)).toBe("2026-09-14");
    expect(datePromise("2026-09-07", 0)).toBe("2026-09-07");
  });
});

describe("options obligatoires", () => {
  it("signale ce qui manque, dans l'ordre des groupes", () => {
    expect(groupesManquants(groupes, {})).toEqual(["Largeur", "Couleur de la sangle"]);
    expect(groupesManquants(groupes, { g1: { valeur_id: "l20" } })).toEqual(["Couleur de la sangle"]);
    expect(groupesManquants(groupes, complet)).toEqual([]);
  });

  it("un « oui / non » est toujours répondu, même par non", () => {
    const sansNfc = { ...complet, g4: { booleen: false } };
    expect(groupesManquants(groupes, sansNfc)).toEqual([]);
  });

  it("un texte facultatif laissé vide ne manque pas", () => {
    expect(groupesManquants(groupes, { ...complet, g3: { texte: "" } })).toEqual([]);
  });

  it("un texte obligatoire vide manque", () => {
    const avecTexteObligatoire = groupes.map((g) =>
      g.id === "g3" ? { ...g, obligatoire: true } : g
    );
    expect(groupesManquants(avecTexteObligatoire, { ...complet, g3: { texte: "  " } }))
      .toEqual(["Gravure"]);
  });

  it("le message dit quoi choisir", () => {
    expect(messageManquants([])).toBeNull();
    expect(messageManquants(["Largeur"])).toBe("Il reste à choisir : Largeur.");
    expect(messageManquants(["Largeur", "Couleur"])).toBe("Il reste à choisir : Largeur, Couleur.");
  });

  it("refuse la validation tant qu'il manque quelque chose", () => {
    expect(refusConfiguration(groupes, {})).toBe(
      "Il reste à choisir : Largeur, Couleur de la sangle."
    );
    expect(refusConfiguration(groupes, complet)).toBeNull();
  });

  it("refuse un texte plus long que sa borne", () => {
    expect(refusConfiguration(groupes, { ...complet, g3: { texte: "x".repeat(21) } }))
      .toBe("« Gravure » dépasse 20 caractères.");
  });
});

describe("texte gravé", () => {
  it("borne la longueur sans rien interpréter", () => {
    expect(bornerTexte("Rex", 20)).toBe("Rex");
    expect(bornerTexte("x".repeat(30), 20)).toHaveLength(20);
    expect(bornerTexte("Rex", null)).toBe("Rex");
    expect(bornerTexte(null, 20)).toBe("");
    // Ce qui est saisi reste tel quel : c'est du texte, il sera échappé.
    expect(bornerTexte("<b>Rex</b> & Cie", 40)).toBe("<b>Rex</b> & Cie");
    // Les sauts de ligne sont conservés.
    expect(bornerTexte("Rex\nMax", 40)).toBe("Rex\nMax");
  });

  it("compte les caractères restants", () => {
    expect(caracteresRestants("Rex", 20)).toBe(17);
    expect(caracteresRestants("", 20)).toBe(20);
    expect(caracteresRestants("Rex", null)).toBeNull();
  });
});

describe("figement des choix", () => {
  it("copie libellés, couleurs, suppléments et fournitures", () => {
    expect(figerChoix(groupes, complet)).toEqual([
      {
        groupe_nom: "Largeur", valeur_libelle: "25 mm", valeur_texte: null, code_couleur: null,
        supplement_prix: 4, ordre: 1, composant_article_id: null, composant_quantite: null,
      },
      {
        groupe_nom: "Couleur de la sangle", valeur_libelle: "Bleu nuit", valeur_texte: null,
        code_couleur: "#1b2b5e", supplement_prix: 0, ordre: 2,
        composant_article_id: "sangle-bleue", composant_quantite: 1.2,
      },
      {
        groupe_nom: "Gravure", valeur_libelle: "Rex", valeur_texte: "Rex", code_couleur: null,
        supplement_prix: 0, ordre: 3, composant_article_id: null, composant_quantite: null,
      },
      {
        groupe_nom: "Avec puce NFC", valeur_libelle: "Puce NFC", valeur_texte: null,
        code_couleur: null, supplement_prix: 12, ordre: 4,
        composant_article_id: "puce", composant_quantite: 1,
      },
    ]);
  });

  it("le catalogue peut changer ensuite : la copie ne bouge pas", () => {
    const figes = figerChoix(groupes, complet);

    // Le prix du 25 mm double, la couleur est renommée et désactivée.
    const apres: OptionGroupe[] = groupes.map((g) => ({
      ...g,
      valeurs: g.valeurs.map((v) =>
        v.id === "l25" ? { ...v, supplement_prix: 8 } :
        v.id === "bleu" ? { ...v, libelle: "Bleu marine", actif: false } : v
      ),
    }));

    expect(figes[0].supplement_prix).toBe(4);
    expect(figes[1].valeur_libelle).toBe("Bleu nuit");
    // Le nouveau catalogue, lui, dit autre chose — c'est bien deux choses.
    expect(prixTotal(60, apres, complet)).toBe(80);
  });

  it("un texte vide ne produit aucun choix figé", () => {
    const figes = figerChoix(groupes, { ...complet, g3: { texte: "   " } });
    expect(figes.map((f) => f.groupe_nom)).not.toContain("Gravure");
  });

  it("un « non » ne produit aucun choix figé", () => {
    const figes = figerChoix(groupes, { ...complet, g4: { booleen: false } });
    expect(figes.map((f) => f.groupe_nom)).not.toContain("Avec puce NFC");
  });

  it("le texte figé est borné", () => {
    const figes = figerChoix(groupes, { ...complet, g3: { texte: "x".repeat(40) } });
    expect(figes.find((f) => f.groupe_nom === "Gravure")?.valeur_texte).toHaveLength(20);
  });
});

describe("fournitures consommées à la fabrication", () => {
  it("ne retient que les choix qui portent une fourniture", () => {
    expect(composantsAConsommer(figerChoix(groupes, complet))).toEqual([
      { article_id: "sangle-bleue", quantite: 1.2 },
      { article_id: "puce", quantite: 1 },
    ]);
  });

  it("additionne deux choix qui consomment la même fourniture", () => {
    expect(composantsAConsommer([
      { composant_article_id: "sangle", composant_quantite: 1.2 },
      { composant_article_id: "sangle", composant_quantite: 0.8 },
      { composant_article_id: null, composant_quantite: 3 },
      { composant_article_id: "puce", composant_quantite: null },
    ])).toEqual([{ article_id: "sangle", quantite: 2 }]);
  });

  it("sans fourniture liée, il ne se passe rien", () => {
    const sansComposant = groupes.map((g) => ({
      ...g,
      valeurs: g.valeurs.map((v) => ({ ...v, composant_article_id: null, composant_quantite: null })),
    }));
    expect(composantsAConsommer(figerChoix(sansComposant, complet))).toEqual([]);
  });
});

describe("suivi de fabrication", () => {
  it("enchaîne les statuts en une touche", () => {
    expect(statutSuivant("a_faire")).toBe("en_cours");
    expect(statutSuivant("en_cours")).toBe("prete");
    expect(statutSuivant("prete")).toBe("remise");
    expect(statutSuivant("remise")).toBeNull();
    expect(statutSuivant("annulee")).toBeNull();
  });

  it("nomme les statuts en français", () => {
    expect(libelleStatutCommande("a_faire")).toBe("À faire");
    expect(libelleStatutCommande("prete")).toBe("Prête");
    expect(libelleStatutCommande("inconnu")).toBe("—");
  });

  it("signale le retard, et seulement quand il compte", () => {
    expect(estEnRetard("2026-09-01", "a_faire", "2026-09-07")).toBe(true);
    expect(estEnRetard("2026-09-07", "a_faire", "2026-09-07")).toBe(false);
    expect(estEnRetard("2026-09-01", "remise", "2026-09-07")).toBe(false);
    expect(estEnRetard("2026-09-01", "annulee", "2026-09-07")).toBe(false);
    expect(estEnRetard(null, "a_faire", "2026-09-07")).toBe(false);
  });
});

describe("saisie en série des coloris", () => {
  it("tire le libellé du nom de fichier", () => {
    expect(libelleDepuisNomFichier("bleu-nuit.jpg")).toBe("Bleu nuit");
    expect(libelleDepuisNomFichier("rouge_brique.HEIC")).toBe("Rouge brique");
    expect(libelleDepuisNomFichier("vert sapin.webp")).toBe("Vert sapin");
    expect(libelleDepuisNomFichier("IMG_4821.jpeg")).toBe("IMG 4821");
    expect(libelleDepuisNomFichier(".png")).toBe("Sans nom");
  });

  it("normalise un hexadécimal, avec ou sans dièse", () => {
    expect(normaliserCouleur("1B2B5E")).toBe("#1b2b5e");
    expect(normaliserCouleur("#A8453A")).toBe("#a8453a");
    expect(normaliserCouleur("bleu")).toBeNull();
    expect(normaliserCouleur("#12345")).toBeNull();
    expect(normaliserCouleur("")).toBeNull();
    expect(normaliserCouleur(null)).toBeNull();
  });
});
