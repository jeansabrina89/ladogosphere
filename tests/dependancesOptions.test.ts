import { describe, it, expect } from "vitest";
import {
  etatDesGroupes,
  valeurDisponible,
  valeursChoisies,
  nettoyerChoixInvalides,
  refusConfigurationAvecDependances,
  enumererFr,
  type ChoixParGroupe,
  type Dependance,
  type OptionGroupe,
  type OptionValeur,
} from "@/src/lib/personnalisationLogique";

function valeur(id: string, libelle: string, ordre: number): OptionValeur {
  return {
    id, libelle, ordre,
    image_path: null, code_couleur: null,
    supplement_prix: 0, supplement_delai_jours: 0,
    composant_article_id: null, composant_quantite: null,
    actif: true, defaut: false,
  };
}

/** Le collier du parcours : trois largeurs, six coloris, un fermoir. */
const LARGEUR: OptionGroupe = {
  id: "g-largeur", nom: "Largeur", type: "liste", obligatoire: true, ordre: 1,
  aide: null, max_caracteres: null, depend_de_groupe_id: null,
  valeurs: [valeur("l19", "19 mm", 1), valeur("l22", "22 mm", 2), valeur("l25", "25 mm", 3)],
};

const COULEUR: OptionGroupe = {
  id: "g-couleur", nom: "Couleur de la sangle", type: "couleur", obligatoire: true, ordre: 2,
  aide: null, max_caracteres: null, depend_de_groupe_id: "g-largeur",
  valeurs: [
    valeur("c1", "Bleu nuit", 1),
    valeur("c2", "Rouge brique", 2),
    valeur("c3", "Vert sapin", 3),
    valeur("c4", "Gris perle", 4),
    valeur("c5", "Ocre", 5),      // réservé au 19 mm
    valeur("c6", "Prune", 6),     // réservé au 19 mm
  ],
};

const FERMOIR: OptionGroupe = {
  id: "g-fermoir", nom: "Fermoir", type: "liste", obligatoire: true, ordre: 3,
  aide: null, max_caracteres: null, depend_de_groupe_id: "g-couleur",
  valeurs: [valeur("f1", "Laiton", 1), valeur("f2", "Acier", 2)],
};

const GROUPES = [LARGEUR, COULEUR, FERMOIR];

/** Quatre coloris dans les trois largeurs, deux réservés au 19 mm. */
const DEPENDANCES: Dependance[] = [
  ...["c1", "c2", "c3", "c4"].flatMap((c) =>
    ["l19", "l22", "l25"].map((l) => ({ valeur_id: c, valeur_requise_id: l }))
  ),
  { valeur_id: "c5", valeur_requise_id: "l19" },
  { valeur_id: "c6", valeur_requise_id: "l19" },
  // Le fermoir ne dépend que du coloris pour deux d'entre eux.
  { valeur_id: "f1", valeur_requise_id: "c1" },
  { valeur_id: "f2", valeur_requise_id: "c1" },
  { valeur_id: "f2", valeur_requise_id: "c5" },
];

const etatDe = (choix: ChoixParGroupe, groupeId: string) =>
  etatDesGroupes(GROUPES, choix, DEPENDANCES).find((e) => e.groupe.id === groupeId)!;

describe("aucune dépendance : rien ne change", () => {
  it("toutes les valeurs restent disponibles", () => {
    const etats = etatDesGroupes(GROUPES, {}, []);
    for (const e of etats) {
      expect(e.valeurs.every((v) => v.disponible)).toBe(true);
      expect(e.valeurs.every((v) => v.raison === null)).toBe(true);
    }
  });

  it("un article sans dépendance déclarée se comporte comme avant", () => {
    const sansParent = GROUPES.map((g) => ({ ...g, depend_de_groupe_id: null }));
    const etats = etatDesGroupes(sansParent, {}, []);
    expect(etats.every((e) => e.actif)).toBe(true);
    expect(etats.every((e) => e.raisonInactif === null)).toBe(true);
  });
});

describe("un groupe conditionné reste visible, et inactif", () => {
  it("tant que le parent n'est pas choisi", () => {
    const couleur = etatDe({}, "g-couleur");
    expect(couleur.actif).toBe(false);
    expect(couleur.raisonInactif).toBe("Choisissez d'abord « Largeur ».");
    // Visible : ses valeurs sont bien là, on ne les masque pas.
    expect(couleur.valeurs).toHaveLength(6);
  });

  it("et s'ouvre dès que le parent l'est", () => {
    const couleur = etatDe({ "g-largeur": { valeur_id: "l19" } }, "g-couleur");
    expect(couleur.actif).toBe(true);
    expect(couleur.raisonInactif).toBeNull();
  });

  it("le groupe de tête n'a jamais de parent", () => {
    expect(etatDe({}, "g-largeur").actif).toBe(true);
    expect(etatDe({}, "g-largeur").parent).toBeNull();
  });
});

describe("une valeur requise", () => {
  it("le 19 mm ouvre les six coloris", () => {
    const couleur = etatDe({ "g-largeur": { valeur_id: "l19" } }, "g-couleur");
    expect(couleur.valeurs.filter((v) => v.disponible)).toHaveLength(6);
  });

  it("le 25 mm n'en ouvre que quatre, et dit pourquoi pour les autres", () => {
    const couleur = etatDe({ "g-largeur": { valeur_id: "l25" } }, "g-couleur");
    const disponibles = couleur.valeurs.filter((v) => v.disponible).map((v) => v.valeur.libelle);
    expect(disponibles).toEqual(["Bleu nuit", "Rouge brique", "Vert sapin", "Gris perle"]);

    const ocre = couleur.valeurs.find((v) => v.valeur.id === "c5")!;
    expect(ocre.disponible).toBe(false);
    expect(ocre.raison).toBe("Disponible en 19 mm seulement");
    // Et l'on sait vers quoi basculer.
    expect(ocre.requises.map((r) => r.libelle)).toEqual(["19 mm"]);
  });
});

describe("plusieurs valeurs requises : un OU, jamais un ET", () => {
  it("un coloris existant en 19, 22 et 25 passe avec n'importe laquelle", () => {
    for (const largeur of ["l19", "l22", "l25"]) {
      expect(valeurDisponible("c1", GROUPES, { "g-largeur": { valeur_id: largeur } }, DEPENDANCES))
        .toBe(true);
    }
  });

  it("la raison énumère toutes les largeurs possibles", () => {
    const dependances: Dependance[] = [
      { valeur_id: "c1", valeur_requise_id: "l19" },
      { valeur_id: "c1", valeur_requise_id: "l22" },
    ];
    const etat = etatDesGroupes(GROUPES, { "g-largeur": { valeur_id: "l25" } }, dependances)
      .find((e) => e.groupe.id === "g-couleur")!;
    expect(etat.valeurs.find((v) => v.valeur.id === "c1")!.raison)
      .toBe("Disponible en 19 mm et 22 mm seulement");
  });

  it("énumère à la française", () => {
    expect(enumererFr([])).toBe("");
    expect(enumererFr(["19 mm"])).toBe("19 mm");
    expect(enumererFr(["19 mm", "22 mm"])).toBe("19 mm et 22 mm");
    expect(enumererFr(["19 mm", "22 mm", "25 mm"])).toBe("19 mm, 22 mm et 25 mm");
  });
});

describe("chaîne à deux niveaux", () => {
  const choix19bleu: ChoixParGroupe = {
    "g-largeur": { valeur_id: "l19" },
    "g-couleur": { valeur_id: "c1" },
  };

  it("le fermoir attend le coloris, qui attend la largeur", () => {
    expect(etatDe({}, "g-fermoir").actif).toBe(false);
    expect(etatDe({ "g-largeur": { valeur_id: "l19" } }, "g-fermoir").actif).toBe(false);
    expect(etatDe(choix19bleu, "g-fermoir").actif).toBe(true);
  });

  it("le coloris choisi commande les fermoirs disponibles", () => {
    const surBleu = etatDe(choix19bleu, "g-fermoir");
    expect(surBleu.valeurs.filter((v) => v.disponible).map((v) => v.valeur.libelle))
      .toEqual(["Laiton", "Acier"]);

    const surOcre = etatDe(
      { "g-largeur": { valeur_id: "l19" }, "g-couleur": { valeur_id: "c5" } },
      "g-fermoir"
    );
    expect(surOcre.valeurs.filter((v) => v.disponible).map((v) => v.valeur.libelle))
      .toEqual(["Acier"]);
    expect(surOcre.valeurs.find((v) => v.valeur.id === "f1")!.raison)
      .toBe("Disponible en Bleu nuit seulement");
  });

  it("les valeurs choisies se lisent tous groupes confondus", () => {
    expect([...valeursChoisies(GROUPES, choix19bleu)].sort()).toEqual(["c1", "l19"]);
  });
});

describe("un choix devenu impossible s'efface, et le dit", () => {
  it("passer de 19 à 25 mm efface le coloris réservé", () => {
    const avant: ChoixParGroupe = {
      "g-largeur": { valeur_id: "l25" },   // on vient de changer
      "g-couleur": { valeur_id: "c5" },    // Ocre, réservé au 19 mm
    };
    const { choix, messages } = nettoyerChoixInvalides(GROUPES, avant, DEPENDANCES);

    expect(choix["g-couleur"].valeur_id).toBeNull();
    expect(messages).toEqual([
      "Couleur de la sangle : « Ocre » n'existe pas en 25 mm. Choisissez-en un autre.",
    ]);
    // La largeur, elle, n'a pas bougé.
    expect(choix["g-largeur"].valeur_id).toBe("l25");
  });

  it("un choix encore valable n'est jamais effacé", () => {
    const avant: ChoixParGroupe = {
      "g-largeur": { valeur_id: "l25" },
      "g-couleur": { valeur_id: "c1" },
    };
    const { choix, messages } = nettoyerChoixInvalides(GROUPES, avant, DEPENDANCES);
    expect(choix["g-couleur"].valeur_id).toBe("c1");
    expect(messages).toEqual([]);
  });

  it("la cascade suit : effacer le coloris referme le fermoir", () => {
    const avant: ChoixParGroupe = {
      "g-largeur": { valeur_id: "l25" },
      "g-couleur": { valeur_id: "c5" },  // deviendra impossible
      "g-fermoir": { valeur_id: "f1" },  // dépendait de c1, pas de c5
    };
    const { choix, messages } = nettoyerChoixInvalides(GROUPES, avant, DEPENDANCES);

    expect(choix["g-couleur"].valeur_id).toBeNull();
    expect(choix["g-fermoir"].valeur_id).toBeNull();
    expect(messages).toHaveLength(2);
    expect(messages[1]).toContain("Fermoir");
  });

  it("sans dépendance, rien n'est jamais effacé", () => {
    const avant: ChoixParGroupe = {
      "g-largeur": { valeur_id: "l25" },
      "g-couleur": { valeur_id: "c5" },
    };
    const { choix, messages } = nettoyerChoixInvalides(GROUPES, avant, []);
    expect(choix["g-couleur"].valeur_id).toBe("c5");
    expect(messages).toEqual([]);
  });
});

describe("le serveur refuse une combinaison impossible", () => {
  it("accepte une configuration cohérente", () => {
    expect(refusConfigurationAvecDependances(
      GROUPES,
      {
        "g-largeur": { valeur_id: "l19" },
        "g-couleur": { valeur_id: "c5" },
        "g-fermoir": { valeur_id: "f2" },
      },
      DEPENDANCES
    )).toBeNull();
  });

  it("refuse un coloris qui n'existe pas dans la largeur choisie", () => {
    const refus = refusConfigurationAvecDependances(
      GROUPES,
      {
        "g-largeur": { valeur_id: "l25" },
        "g-couleur": { valeur_id: "c5" },
        "g-fermoir": { valeur_id: "f2" },
      },
      DEPENDANCES
    );
    expect(refus).toBe(
      "Couleur de la sangle : « Ocre » n'est pas disponible avec ce choix. Disponible en 19 mm seulement."
    );
  });

  it("refuse un fermoir qui ne va pas avec le coloris", () => {
    const refus = refusConfigurationAvecDependances(
      GROUPES,
      {
        "g-largeur": { valeur_id: "l19" },
        "g-couleur": { valeur_id: "c5" },
        "g-fermoir": { valeur_id: "f1" },
      },
      DEPENDANCES
    );
    expect(refus).toMatch(/^Fermoir : « Laiton » n'est pas disponible/);
  });

  it("réclame encore les groupes obligatoires ouverts", () => {
    expect(refusConfigurationAvecDependances(GROUPES, {}, DEPENDANCES))
      .toBe("Il reste à choisir : Largeur.");
    // La couleur n'est pas réclamée tant que sa question n'est pas posée.
    expect(refusConfigurationAvecDependances(GROUPES, {}, DEPENDANCES))
      .not.toContain("Couleur");
  });

  it("réclame le groupe conditionné dès qu'il est ouvert", () => {
    expect(refusConfigurationAvecDependances(
      GROUPES, { "g-largeur": { valeur_id: "l19" } }, DEPENDANCES
    )).toBe("Il reste à choisir : Couleur de la sangle.");
  });
});
