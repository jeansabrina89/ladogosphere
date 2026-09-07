import { describe, it, expect } from "vitest";
import {
  refusMesure,
  alerteMesure,
  supplementMesure,
  supplementApplique,
  supplementDetaille,
  formatMesure,
  uniteMesure,
  cleFusion,
  resoudreGroupes,
  refusOrdreGroupes,
  mesuresAConfirmer,
  cible,
  porteurArticle,
  porteurModele,
  estModele,
  etatDesGroupes,
  valeurDisponible,
  nettoyerChoixInvalides,
  refusConfiguration,
  groupesManquants,
  figerChoix,
  detailPrix,
  prixTotal,
  type BlocOptions,
  type ChoixParGroupe,
  type Dependance,
  type OptionGroupe,
  type OptionValeur,
} from "@/src/lib/personnalisationLogique";

function valeur(
  id: string,
  libelle: string,
  ordre: number,
  supplement = 0
): OptionValeur {
  return {
    id, libelle, ordre,
    image_path: null, code_couleur: null,
    supplement_prix: supplement, supplement_delai_jours: 0,
    composant_article_id: null, composant_quantite: null,
    actif: true, defaut: false,
  };
}

function groupe(p: Partial<OptionGroupe> & { id: string; nom: string }): OptionGroupe {
  return {
    type: "liste", obligatoire: false, ordre: 1,
    aide: null, max_caracteres: null, depend_de_groupe_id: null,
    valeurs: [], ...p,
  };
}

// ── Mesures : ce qui est impossible et ce qui est seulement improbable ───────

describe("bornage d'une mesure", () => {
  /** Un tour de cou : jamais moins de 15 cm, jamais plus de 80. */
  const TOUR_DE_COU = groupe({
    id: "g-cou", nom: "Tour de cou", type: "mesure", obligatoire: true,
    unite: "cm", valeur_min: 15, valeur_max: 80,
    alerte_min: 20, alerte_max: 65,
  });

  it("refuse ce qui est impossible, dans les deux sens, en le disant en clair", () => {
    expect(refusMesure(TOUR_DE_COU, 3)).toBe(
      "« Tour de cou » : 3 cm est en dessous du minimum de 15 cm."
    );
    expect(refusMesure(TOUR_DE_COU, 120)).toBe(
      "« Tour de cou » : 120 cm dépasse le maximum de 80 cm."
    );
  });

  it("refuse zéro et le négatif, quelles que soient les bornes", () => {
    const libre = groupe({ id: "g", nom: "Longueur", type: "mesure", unite: "cm" });
    expect(refusMesure(libre, 0)).toBe("« Longueur » doit être un nombre positif.");
    expect(refusMesure(libre, -10)).toBe("« Longueur » doit être un nombre positif.");
  });

  it("réclame la mesure si le groupe est obligatoire, et se tait sinon", () => {
    expect(refusMesure(TOUR_DE_COU, null)).toBe("Indiquez « Tour de cou ».");
    expect(refusMesure({ ...TOUR_DE_COU, obligatoire: false }, null)).toBeNull();
  });

  it("accepte tout ce qui tient entre les bornes", () => {
    for (const n of [15, 38, 38.5, 80]) {
      expect(refusMesure(TOUR_DE_COU, n)).toBeNull();
    }
  });

  it("avertit sans bloquer sur l'improbable, et propose de confirmer", () => {
    // 17 cm : un chihuahua, c'est rare mais ça existe. On demande, on n'interdit pas.
    expect(refusMesure(TOUR_DE_COU, 17)).toBeNull();
    expect(alerteMesure(TOUR_DE_COU, 17)).toBe(
      "17 cm, c'est très petit pour « Tour de cou ». Avez-vous bien mesuré ?"
    );
    expect(alerteMesure(TOUR_DE_COU, 70)).toBe(
      "70 cm, c'est très grand pour « Tour de cou ». Avez-vous bien mesuré ?"
    );
  });

  it("ne double pas le message : un refus prime sur une alerte", () => {
    expect(refusMesure(TOUR_DE_COU, 3)).not.toBeNull();
    expect(alerteMesure(TOUR_DE_COU, 3)).toBeNull();
  });

  it("ne dit rien de vraisemblance dans la plage courante, ni sur du vide", () => {
    expect(alerteMesure(TOUR_DE_COU, 38)).toBeNull();
    expect(alerteMesure(TOUR_DE_COU, null)).toBeNull();
  });

  it("écrit le nombre comme on le dit, avec son unité", () => {
    expect(formatMesure(38, "cm")).toBe("38 cm");
    expect(formatMesure(38.5, "cm")).toBe("38.5 cm");
    expect(formatMesure(null, "cm")).toBe("—");
    expect(uniteMesure(groupe({ id: "g", nom: "L", type: "mesure" }))).toBe("cm");
    expect(uniteMesure(groupe({ id: "g", nom: "L", type: "mesure", unite: "mm" }))).toBe("mm");
  });

  it("réclame la mesure manquante avec les autres questions sans réponse", () => {
    expect(groupesManquants([TOUR_DE_COU], {})).toEqual(["Tour de cou"]);
    expect(groupesManquants([TOUR_DE_COU], { "g-cou": { nombre: 38 } })).toEqual([]);
  });

  it("bloque la configuration entière sur une borne dure", () => {
    expect(refusConfiguration([TOUR_DE_COU], { "g-cou": { nombre: 120 } })).toBe(
      "« Tour de cou » : 120 cm dépasse le maximum de 80 cm."
    );
    // L'improbable accepté passe : la configuration n'a pas à le refuser.
    expect(
      refusConfiguration([TOUR_DE_COU], { "g-cou": { nombre: 17, alerte_acceptee: true } })
    ).toBeNull();
  });
});

describe("supplément au-delà d'un seuil", () => {
  /** Au-delà de 60 cm, la sangle coûte 8 CHF de plus. Un seul palier. */
  const LONGE = groupe({
    id: "g-longe", nom: "Longueur", type: "mesure", obligatoire: true,
    unite: "cm", valeur_min: 50, valeur_max: 500,
    seuil_supplement: 60, supplement_au_dela: 8,
  });

  it("ne compte rien jusqu'au seuil, seuil compris", () => {
    expect(supplementMesure(LONGE, 50)).toBe(0);
    expect(supplementMesure(LONGE, 60)).toBe(0);
  });

  it("compte le palier une seule fois au-delà, quelle que soit la distance", () => {
    expect(supplementMesure(LONGE, 60.5)).toBe(8);
    expect(supplementMesure(LONGE, 300)).toBe(8);
  });

  it("ne compte rien sans seuil, sans supplément, ou sans mesure", () => {
    expect(supplementMesure({ ...LONGE, seuil_supplement: null }, 300)).toBe(0);
    expect(supplementMesure({ ...LONGE, supplement_au_dela: null }, 300)).toBe(0);
    expect(supplementMesure(LONGE, null)).toBe(0);
  });

  it("apparaît au détail avec la raison, et entre dans le total", () => {
    const choix: ChoixParGroupe = { "g-longe": { nombre: 200 } };
    expect(detailPrix([LONGE], choix)).toEqual([
      { groupe: "Longueur", libelle: "200 cm", supplement: 8, contexte: "au-delà de 60 cm" },
    ]);
    expect(prixTotal(45, [LONGE], choix)).toBe(53);
    expect(prixTotal(45, [LONGE], { "g-longe": { nombre: 55 } })).toBe(45);
  });

  it("fige le nombre, l'unité et le supplément tels quels", () => {
    expect(figerChoix([LONGE], { "g-longe": { nombre: 200 } })).toEqual([
      {
        groupe_nom: "Longueur",
        valeur_libelle: "200 cm",
        valeur_texte: null,
        code_couleur: null,
        supplement_prix: 8,
        ordre: 1,
        composant_article_id: null,
        composant_quantite: null,
        valeur_nombre: 200,
        unite: "cm",
      },
    ]);
  });
});

// ── Supplément propre à une combinaison ─────────────────────────────────────

describe("supplément par combinaison", () => {
  const LARGEUR = groupe({
    id: "g-largeur", nom: "Largeur", type: "liste", obligatoire: true, ordre: 1,
    valeurs: [valeur("l19", "19 mm", 1), valeur("l25", "25 mm", 2)],
  });
  const COLORIS = groupe({
    id: "g-coloris", nom: "Coloris", type: "couleur", obligatoire: true, ordre: 2,
    depend_de_groupe_id: "g-largeur",
    valeurs: [valeur("c1", "Ocre", 1, 3), valeur("c2", "Prune", 2, 3)],
  });
  const GROUPES = [LARGEUR, COLORIS];

  /** L'ocre coûte 5 en 25 mm, rien du tout en 19 mm, la prune garde son prix. */
  const DEPENDANCES: Dependance[] = [
    { valeur_id: "c1", valeur_requise_id: "l19", supplement_prix: 0 },
    { valeur_id: "c1", valeur_requise_id: "l25", supplement_prix: 5 },
    { valeur_id: "c2", valeur_requise_id: "l19", supplement_prix: null },
    { valeur_id: "c2", valeur_requise_id: "l25", supplement_prix: null },
  ];

  const ocre = COLORIS.valeurs[0];
  const prune = COLORIS.valeurs[1];

  it("prend le prix de la combinaison quand elle en porte un", () => {
    const choix: ChoixParGroupe = { "g-largeur": { valeur_id: "l25" }, "g-coloris": { valeur_id: "c1" } };
    expect(supplementApplique(ocre, GROUPES, choix, DEPENDANCES)).toBe(5);
    expect(supplementDetaille(ocre, GROUPES, choix, DEPENDANCES)).toEqual({
      montant: 5, contexte: "25 mm",
    });
  });

  it("traite un zéro explicite comme un prix, pas comme une absence", () => {
    const choix: ChoixParGroupe = { "g-largeur": { valeur_id: "l19" }, "g-coloris": { valeur_id: "c1" } };
    // La valeur porte 3 ; la combinaison dit 0. C'est 0.
    expect(supplementApplique(ocre, GROUPES, choix, DEPENDANCES)).toBe(0);
  });

  it("retombe sur le prix de la valeur quand la combinaison n'en porte pas", () => {
    const choix: ChoixParGroupe = { "g-largeur": { valeur_id: "l25" }, "g-coloris": { valeur_id: "c2" } };
    expect(supplementDetaille(prune, GROUPES, choix, DEPENDANCES)).toEqual({
      montant: 3, contexte: null,
    });
  });

  it("n'additionne jamais les deux : le détail porte un seul montant par groupe", () => {
    const choix: ChoixParGroupe = { "g-largeur": { valeur_id: "l25" }, "g-coloris": { valeur_id: "c1" } };
    expect(detailPrix(GROUPES, choix, DEPENDANCES)).toEqual([
      { groupe: "Coloris", libelle: "Ocre", supplement: 5, contexte: "25 mm" },
    ]);
    // 5, et non 3 + 5.
    expect(prixTotal(40, GROUPES, choix, DEPENDANCES)).toBe(45);
  });

  it("fige le prix qui s'applique vraiment, combinaison comprise", () => {
    const choix: ChoixParGroupe = { "g-largeur": { valeur_id: "l25" }, "g-coloris": { valeur_id: "c1" } };
    const figes = figerChoix(GROUPES, choix, DEPENDANCES);
    expect(figes.map((f) => [f.valeur_libelle, f.supplement_prix])).toEqual([
      ["25 mm", 0],
      ["Ocre", 5],
    ]);
  });
});

// ── Bibliothèque de modèles : la fusion ─────────────────────────────────────

/** Le modèle « Sangle biothane » : une matière, puis des largeurs. */
function modeleSangle(prefixe: string): OptionGroupe[] {
  return [
    groupe({
      id: `${prefixe}-matiere`, nom: "Matière", type: "liste", obligatoire: true, ordre: 1,
      aide: "La matière décide des largeurs disponibles.",
      valeurs: [valeur(`${prefixe}-bio`, "Biothane", 1), valeur(`${prefixe}-cuir`, "Cuir", 2)],
    }),
    groupe({
      id: `${prefixe}-largeur`, nom: "Largeur", type: "liste", obligatoire: true, ordre: 2,
      depend_de_groupe_id: `${prefixe}-matiere`,
      valeurs: [valeur(`${prefixe}-l19`, "19 mm", 1), valeur(`${prefixe}-l25`, "25 mm", 2)],
    }),
  ];
}

describe("fusion de deux modèles apportant un groupe de même nom", () => {
  const A: BlocOptions = { source: "Sangle biothane", ordre: 1, groupes: modeleSangle("a") };
  const B: BlocOptions = {
    source: "Gravure",
    ordre: 2,
    groupes: [
      groupe({
        // Même nom, même type : ce groupe fusionne avec celui du premier modèle.
        id: "b-matiere", nom: " matière ", type: "liste", obligatoire: false, ordre: 1,
        aide: "Aide plus tardive, ignorée : la première l'emporte.",
        valeurs: [valeur("b-inox", "Inox", 1)],
      }),
      groupe({
        id: "b-texte", nom: "Texte gravé", type: "texte", obligatoire: false, ordre: 2,
        max_caracteres: 20,
      }),
    ],
  };

  it("reconnaît le même groupe aux espaces et à la casse près, mais pas d'un type à l'autre", () => {
    expect(cleFusion({ nom: " Matière ", type: "liste" })).toBe(cleFusion({ nom: "matière", type: "liste" }));
    expect(cleFusion({ nom: "Matière", type: "liste" })).not.toBe(cleFusion({ nom: "Matière", type: "couleur" }));
  });

  it("n'en fait qu'un, à la place et sous l'identifiant de la première occurrence", () => {
    const { groupes } = resoudreGroupes([A, B]);
    expect(groupes.map((g) => g.nom)).toEqual(["Matière", "Largeur", "Texte gravé"]);
    expect(groupes.map((g) => g.ordre)).toEqual([1, 2, 3]);
    const matiere = groupes[0];
    expect(matiere.id).toBe("a-matiere");
    // Attacher un second modèle n'a pas déplacé la Matière au-delà de la Largeur.
    expect(matiere.ordre).toBeLessThan(groupes[1].ordre);
  });

  it("réunit les valeurs des deux modèles, dans l'ordre des sources", () => {
    const { groupes } = resoudreGroupes([A, B]);
    expect(groupes[0].valeurs.map((v) => v.libelle)).toEqual(["Biothane", "Cuir", "Inox"]);
  });

  it("garde le plus strict : obligatoire dès qu'une occurrence l'est", () => {
    const { groupes } = resoudreGroupes([A, B]);
    expect(groupes[0].obligatoire).toBe(true);
    // Et dans l'autre sens : c'est bien le plus strict, pas la première occurrence.
    const inverse = resoudreGroupes([
      { ...B, ordre: 1 },
      { ...A, ordre: 2 },
    ]);
    expect(inverse.groupes[0].obligatoire).toBe(true);
  });

  it("garde la première aide renseignée", () => {
    const { groupes } = resoudreGroupes([A, B]);
    expect(groupes[0].aide).toBe("La matière décide des largeurs disponibles.");
  });

  it("garde les bornes de la première occurrence pour une mesure", () => {
    const m1: BlocOptions = {
      source: "Collier", ordre: 1,
      groupes: [groupe({ id: "m1", nom: "Tour de cou", type: "mesure", ordre: 1, unite: "cm", valeur_min: 15, valeur_max: 80 })],
    };
    const m2: BlocOptions = {
      source: "Harnais", ordre: 2,
      groupes: [groupe({ id: "m2", nom: "Tour de cou", type: "mesure", ordre: 1, unite: "cm", valeur_min: 30, valeur_max: 120 })],
    };
    const { groupes } = resoudreGroupes([m1, m2]);
    expect(groupes).toHaveLength(1);
    // Mélanger 15–80 et 30–120 donnerait un intervalle que personne n'a choisi.
    expect([groupes[0].valeur_min, groupes[0].valeur_max]).toEqual([15, 80]);
  });

  it("dit quels groupes ont fusionné et d'où ils viennent", () => {
    const { fusions } = resoudreGroupes([A, B]);
    expect(fusions).toEqual([{ nom: "Matière", sources: ["Sangle biothane", "Gravure"] }]);
  });

  it("réaccroche la dépendance au groupe fusionné, pas au groupe disparu", () => {
    // Un modèle attaché après coup dont la largeur pointe SA propre matière.
    const C: BlocOptions = { source: "Laisse", ordre: 2, groupes: modeleSangle("c") };
    const { groupes } = resoudreGroupes([A, C]);
    expect(groupes.map((g) => g.nom)).toEqual(["Matière", "Largeur"]);
    expect(groupes[1].depend_de_groupe_id).toBe("a-matiere");
    expect(refusOrdreGroupes(groupes)).toBeNull();
  });
});

describe("résolution des groupes d'un article : modèles et groupes propres", () => {
  /** Sabrina attache « Sangle biothane », puis pose ses propres questions. */
  const blocs: BlocOptions[] = [
    { source: "Sangle biothane", ordre: 1, groupes: modeleSangle("a") },
    {
      source: "Cet article",
      ordre: 2,
      groupes: [
        groupe({
          id: "p-coloris", nom: "Coloris", type: "couleur", obligatoire: true, ordre: 1,
          depend_de_groupe_id: "a-largeur",
          valeurs: [valeur("p-ocre", "Ocre", 1)],
        }),
        groupe({ id: "p-cou", nom: "Tour de cou", type: "mesure", obligatoire: true, ordre: 2, unite: "cm", valeur_min: 15, valeur_max: 80 }),
      ],
    },
  ];

  it("place les modèles d'abord, les groupes propres ensuite, dans l'ordre déclaré", () => {
    const { groupes } = resoudreGroupes(blocs);
    expect(groupes.map((g) => g.nom)).toEqual(["Matière", "Largeur", "Coloris", "Tour de cou"]);
    expect(groupes.map((g) => g.ordre)).toEqual([1, 2, 3, 4]);
  });

  it("laisse un groupe propre dépendre d'un groupe apporté par un modèle", () => {
    const { groupes } = resoudreGroupes(blocs);
    expect(groupes[2].nom).toBe("Coloris");
    expect(groupes[2].depend_de_groupe_id).toBe("a-largeur");
    expect(refusOrdreGroupes(groupes)).toBeNull();
  });

  it("suit l'ordre des blocs, pas celui de leur déclaration", () => {
    const inverse = resoudreGroupes([
      { ...blocs[1], ordre: 1 },
      { ...blocs[0], ordre: 2 },
    ]);
    expect(inverse.groupes.map((g) => g.nom)).toEqual(["Coloris", "Tour de cou", "Matière", "Largeur"]);
    // Le coloris est passé devant la largeur dont il dépend : c'est refusé, pas réordonné en silence.
    expect(refusOrdreGroupes(inverse.groupes)).toBe(
      "« Coloris » dépend de « Largeur » : il doit rester après lui."
    );
  });

  it("ne perd rien quand un article n'a que ses propres groupes", () => {
    const { groupes, fusions } = resoudreGroupes([blocs[1]]);
    expect(groupes.map((g) => g.nom)).toEqual(["Coloris", "Tour de cou"]);
    expect(fusions).toEqual([]);
  });
});

describe("refus d'un ordre incohérent", () => {
  const parent = groupe({ id: "g1", nom: "Largeur", ordre: 2 });
  const enfant = groupe({ id: "g2", nom: "Coloris", ordre: 1, depend_de_groupe_id: "g1" });

  it("refuse un enfant placé avant son parent, et nomme les deux", () => {
    expect(refusOrdreGroupes([parent, enfant])).toBe(
      "« Coloris » dépend de « Largeur » : il doit rester après lui."
    );
  });

  it("refuse deux groupes au même rang : « après » ne veut plus rien dire", () => {
    expect(refusOrdreGroupes([{ ...parent, ordre: 1 }, { ...enfant, ordre: 1 }])).not.toBeNull();
  });

  it("refuse une dépendance vers un groupe absent, et dit comment s'en sortir", () => {
    expect(refusOrdreGroupes([enfant])).toBe(
      "« Coloris » dépend d'un groupe qui n'est pas là. Attachez le modèle qui l'apporte, ou retirez la dépendance."
    );
  });

  it("accepte l'ordre correct", () => {
    expect(refusOrdreGroupes([{ ...parent, ordre: 1 }, { ...enfant, ordre: 2 }])).toBeNull();
  });
});

// ── Disponibilité en chaîne : matière → largeur → coloris ───────────────────

describe("disponibilité en chaîne matière → largeur → coloris", () => {
  const MATIERE = groupe({
    id: "g-matiere", nom: "Matière", type: "liste", obligatoire: true, ordre: 1,
    valeurs: [valeur("bio", "Biothane", 1), valeur("cuir", "Cuir", 2)],
  });
  const LARGEUR = groupe({
    id: "g-largeur", nom: "Largeur", type: "liste", obligatoire: true, ordre: 2,
    depend_de_groupe_id: "g-matiere",
    valeurs: [valeur("l16", "16 mm", 1), valeur("l19", "19 mm", 2), valeur("l25", "25 mm", 3)],
  });
  const COLORIS = groupe({
    id: "g-coloris", nom: "Coloris", type: "couleur", obligatoire: true, ordre: 3,
    depend_de_groupe_id: "g-largeur",
    valeurs: [valeur("noir", "Noir", 1), valeur("ocre", "Ocre", 2), valeur("naturel", "Naturel", 3)],
  });
  const GROUPES = [MATIERE, LARGEUR, COLORIS];

  /**
   * Le 16 mm n'existe qu'en biothane, le 25 dans les deux matières.
   * L'ocre est un coloris de biothane, réservé au 19 ; le naturel est du cuir.
   */
  const DEPENDANCES: Dependance[] = [
    { valeur_id: "l16", valeur_requise_id: "bio" },
    { valeur_id: "l19", valeur_requise_id: "bio" },
    { valeur_id: "l19", valeur_requise_id: "cuir" },
    { valeur_id: "l25", valeur_requise_id: "bio" },
    { valeur_id: "l25", valeur_requise_id: "cuir" },
    { valeur_id: "noir", valeur_requise_id: "l16" },
    { valeur_id: "noir", valeur_requise_id: "l19" },
    { valeur_id: "noir", valeur_requise_id: "l25" },
    { valeur_id: "ocre", valeur_requise_id: "l19" },
    { valeur_id: "naturel", valeur_requise_id: "l25" },
  ];

  it("laisse tout visible dès l'abord, et n'ouvre que le premier maillon", () => {
    const etats = etatDesGroupes(GROUPES, {}, DEPENDANCES);
    expect(etats.map((e) => e.groupe.nom)).toEqual(["Matière", "Largeur", "Coloris"]);
    expect(etats.map((e) => e.actif)).toEqual([true, false, false]);
    expect(etats[1].raisonInactif).toBe("Choisissez d'abord « Matière ».");
    expect(etats[2].raisonInactif).toBe("Choisissez d'abord « Largeur ».");
  });

  it("ouvre le maillon suivant une fois le précédent choisi, un à la fois", () => {
    const apresMatiere = etatDesGroupes(GROUPES, { "g-matiere": { valeur_id: "cuir" } }, DEPENDANCES);
    expect(apresMatiere.map((e) => e.actif)).toEqual([true, true, false]);

    const apresLargeur = etatDesGroupes(
      GROUPES,
      { "g-matiere": { valeur_id: "cuir" }, "g-largeur": { valeur_id: "l25" } },
      DEPENDANCES
    );
    expect(apresLargeur.map((e) => e.actif)).toEqual([true, true, true]);
  });

  it("grise le 16 mm en cuir, en disant où le trouver", () => {
    const etats = etatDesGroupes(GROUPES, { "g-matiere": { valeur_id: "cuir" } }, DEPENDANCES);
    const largeurs = etats[1].valeurs;
    expect(largeurs.map((v) => [v.valeur.libelle, v.disponible])).toEqual([
      ["16 mm", false],
      ["19 mm", true],
      ["25 mm", true],
    ]);
    expect(largeurs[0].raison).toBe("Disponible en Biothane seulement");
  });

  it("propage la chaîne jusqu'au coloris : le cuir en 25 mm n'a pas l'ocre", () => {
    const choix: ChoixParGroupe = {
      "g-matiere": { valeur_id: "cuir" },
      "g-largeur": { valeur_id: "l25" },
    };
    const coloris = etatDesGroupes(GROUPES, choix, DEPENDANCES)[2].valeurs;
    expect(coloris.map((v) => [v.valeur.libelle, v.disponible])).toEqual([
      ["Noir", true],
      ["Ocre", false],
      ["Naturel", true],
    ]);
    expect(coloris[1].raison).toBe("Disponible en 19 mm seulement");
    expect(valeurDisponible("ocre", GROUPES, choix, DEPENDANCES)).toBe(false);
    expect(valeurDisponible("ocre", GROUPES, { ...choix, "g-largeur": { valeur_id: "l19" } }, DEPENDANCES)).toBe(true);
  });

  it("efface toute la chaîne devenue impossible quand la matière change, et le dit", () => {
    const choix: ChoixParGroupe = {
      "g-matiere": { valeur_id: "bio" },
      "g-largeur": { valeur_id: "l16" },
      "g-coloris": { valeur_id: "noir" },
    };
    // On passe au cuir : le 16 mm n'existe pas, et le coloris qui en dépendait tombe avec.
    const suite = nettoyerChoixInvalides(
      GROUPES,
      { ...choix, "g-matiere": { valeur_id: "cuir" } },
      DEPENDANCES
    );
    expect(suite.choix["g-largeur"]?.valeur_id ?? null).toBeNull();
    expect(suite.choix["g-coloris"]?.valeur_id ?? null).toBeNull();
    expect(suite.messages.join(" ")).toContain("Largeur");
    expect(suite.messages.length).toBeGreaterThan(0);
  });

  it("ne touche à rien quand la chaîne reste cohérente", () => {
    const choix: ChoixParGroupe = {
      "g-matiere": { valeur_id: "bio" },
      "g-largeur": { valeur_id: "l19" },
      "g-coloris": { valeur_id: "ocre" },
    };
    const suite = nettoyerChoixInvalides(GROUPES, choix, DEPENDANCES);
    expect(suite.messages).toEqual([]);
    expect(suite.choix).toEqual(choix);
  });
});

describe("confirmation d'une mesure improbable", () => {
  const COU = groupe({
    id: "g-cou", nom: "Tour de cou", type: "mesure", obligatoire: true,
    unite: "cm", valeur_min: 15, valeur_max: 80, alerte_min: 20, alerte_max: 65,
  });

  it("retient la commande tant que l'improbable n'est pas confirmé", () => {
    expect(mesuresAConfirmer([COU], { "g-cou": { nombre: 17 } })).toEqual(["Tour de cou"]);
  });

  it("laisse passer une fois confirmé — c'est tout l'objet du bouton", () => {
    expect(mesuresAConfirmer([COU], { "g-cou": { nombre: 17, alerte_acceptee: true } })).toEqual([]);
  });

  it("ne demande rien pour une mesure ordinaire, ni pour une mesure refusée", () => {
    expect(mesuresAConfirmer([COU], { "g-cou": { nombre: 38 } })).toEqual([]);
    // 3 cm est refusé : c'est le refus qui parle, pas une demande de confirmation.
    expect(mesuresAConfirmer([COU], { "g-cou": { nombre: 3 } })).toEqual([]);
  });
});

describe("porteur d'un catalogue", () => {
  it("distingue un article d'un modèle, et rend l'identifiant intact", () => {
    expect(cible(porteurArticle("a-1"))).toEqual({ article: "a-1", modele: null });
    expect(cible(porteurModele("m-1"))).toEqual({ article: null, modele: "m-1" });
    expect(estModele(porteurModele("m-1"))).toBe(true);
    expect(estModele(porteurArticle("a-1"))).toBe(false);
  });

  it("rend un UUID tel quel, deux-points compris s'il y en avait", () => {
    const id = "3f2b8c1e-0000-4aaa-bbbb-ccccddddeeee";
    expect(cible(porteurArticle(id)).article).toBe(id);
  });
});
