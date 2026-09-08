import { describe, it, expect } from "vitest";
import {
  determinerTaille,
  tailleRecommandee,
  intervallesSeuils,
  libelleIntervalle,
  trousDeLaGrille,
  refusGrille,
  consequenceSuppression,
  supplementAuCentimetre,
  refusOrdreTailles,
  mesuresQuiCommandent,
  taillesTriees,
  type GroupeTaille,
  type Taille,
} from "@/src/lib/taillesLogique";

function taille(p: {
  id: string; libelle: string; min?: number | null; max?: number | null;
  ordre?: number; supplement?: number; actif?: boolean;
}): Taille {
  return {
    id: p.id, libelle: p.libelle, ordre: p.ordre ?? 1,
    image_path: null, code_couleur: null,
    supplement_prix: p.supplement ?? 0, supplement_delai_jours: 0,
    composant_article_id: null, composant_quantite: null,
    actif: p.actif ?? true, defaut: false,
    borne_min: p.min ?? null, borne_max: p.max ?? null,
  };
}

function grille(p: Partial<GroupeTaille> & { valeurs: Taille[] }): GroupeTaille {
  return {
    id: "g-taille", nom: "Taille", type: "taille", obligatoire: true, ordre: 2,
    aide: null, max_caracteres: null, depend_de_groupe_id: null,
    unite: "cm", mode_taille: "seuils", mesure_groupe_id: "g-cou",
    ...p,
  };
}

/** La grille des sept tailles du collier, en mode « seuils ». */
const SEPT = grille({
  mode_taille: "seuils",
  valeurs: [
    taille({ id: "xxs", libelle: "XXS", min: 0, ordre: 1 }),
    taille({ id: "xs", libelle: "XS", min: 21, ordre: 2 }),
    taille({ id: "s", libelle: "S", min: 27, ordre: 3 }),
    taille({ id: "m", libelle: "M", min: 33, ordre: 4, supplement: 3 }),
    taille({ id: "l", libelle: "L", min: 41, ordre: 5, supplement: 6 }),
    taille({ id: "xl", libelle: "XL", min: 51, ordre: 6, supplement: 9 }),
    taille({ id: "xxl", libelle: "XXL", min: 65, ordre: 7, supplement: 12 }),
  ],
});

// ── Mode « seuils » ────────────────────────────────────────────────────────

describe("détermination de la taille, mode seuils", () => {
  const trouve = (m: number) => {
    const d = determinerTaille(SEPT, m);
    return d.etat === "trouvee" ? d.propositions.map((p) => p.taille.libelle) : d.etat;
  };

  it("une mesure exactement sur un seuil prend la taille qui commence là", () => {
    // 21 est le seuil de XS : il lui appartient, pas à XXS.
    expect(trouve(21)).toEqual(["XS"]);
    expect(trouve(27)).toEqual(["S"]);
    expect(trouve(65)).toEqual(["XXL"]);
  });

  it("juste en dessous d'un seuil, on reste dans la taille précédente", () => {
    // Le cas qui se trompe toujours : 20,5 et 20,99 sont encore des XXS.
    expect(trouve(20.5)).toEqual(["XXS"]);
    expect(trouve(20.9)).toEqual(["XXS"]);
    expect(trouve(20.99)).toEqual(["XXS"]);
  });

  it("désigne toujours une seule taille : les intervalles se touchent sans se recouvrir", () => {
    for (const m of [0, 5, 20.9, 21, 26.9, 33, 40.99, 50, 64.9, 65, 120]) {
      const d = determinerTaille(SEPT, m);
      expect(d.etat, `pour ${m} cm`).toBe("trouvee");
      if (d.etat === "trouvee") expect(d.propositions).toHaveLength(1);
    }
  });

  it("la dernière taille n'a pas de fin", () => {
    expect(trouve(65)).toEqual(["XXL"]);
    expect(trouve(200)).toEqual(["XXL"]);
  });

  it("sous le premier seuil, la grille ne descend pas jusque-là et le dit", () => {
    const basse = grille({
      mode_taille: "seuils",
      valeurs: [taille({ id: "s", libelle: "S", min: 27 })],
    });
    const d = determinerTaille(basse, 20);
    expect(d.etat).toBe("hors_grille");
    if (d.etat === "hors_grille") {
      expect(d.message).toContain("en dessous");
      expect(d.message).toContain("sur mesure");
    }
  });

  it("marche avec une grille d'une seule taille", () => {
    const une = grille({
      mode_taille: "seuils",
      valeurs: [taille({ id: "u", libelle: "Unique", min: 0 })],
    });
    expect(tailleRecommandee(determinerTaille(une, 0))?.libelle).toBe("Unique");
    expect(tailleRecommandee(determinerTaille(une, 500))?.libelle).toBe("Unique");
  });

  it("ne détermine rien sans mesure", () => {
    expect(determinerTaille(SEPT, null).etat).toBe("aucune_mesure");
    expect(determinerTaille(SEPT, undefined).etat).toBe("aucune_mesure");
  });

  it("affiche l'intervalle calculé, borne haute exclue", () => {
    const i = intervallesSeuils(SEPT);
    expect(libelleIntervalle(i[1])).toBe("21 à 26,9 cm");
    expect(libelleIntervalle(i[6])).toBe("65 cm et plus");
  });

  it("dit ce que la suppression d'une taille intermédiaire va faire", () => {
    const message = consequenceSuppression(SEPT, "xs");
    expect(message).toContain("XS");
    expect(message).toContain("21 à 26,9 cm");
    expect(message).toContain("XXS");
  });

  it("après suppression, la taille précédente couvre bien l'intervalle promis", () => {
    const sansXS = grille({
      mode_taille: "seuils",
      valeurs: SEPT.valeurs.filter((v) => v.id !== "xs") as Taille[],
    });
    // Ce que le message annonçait : 21 à 26,9 passent en XXS.
    expect(tailleRecommandee(determinerTaille(sansXS, 21))?.libelle).toBe("XXS");
    expect(tailleRecommandee(determinerTaille(sansXS, 26.9))?.libelle).toBe("XXS");
    expect(tailleRecommandee(determinerTaille(sansXS, 27))?.libelle).toBe("S");
  });

  it("refuse deux tailles au même seuil", () => {
    const doublon = grille({
      mode_taille: "seuils",
      valeurs: [
        taille({ id: "a", libelle: "A", min: 21 }),
        taille({ id: "b", libelle: "B", min: 21 }),
      ],
    });
    expect(refusGrille(doublon)).toContain("ne se partage pas");
  });

  it("un mode seuils n'a jamais de trou, par construction", () => {
    expect(trousDeLaGrille(SEPT)).toEqual([]);
    expect(refusGrille(SEPT)).toBeNull();
  });
});

// ── Mode « plages » ────────────────────────────────────────────────────────

describe("détermination de la taille, mode plages", () => {
  /** Trois plages réglables qui se chevauchent, comme une vraie gamme. */
  const REGLABLE = grille({
    mode_taille: "plages",
    valeurs: [
      taille({ id: "s", libelle: "S", min: 20, max: 30, ordre: 1 }),
      taille({ id: "m", libelle: "M", min: 28, max: 40, ordre: 2 }),
      taille({ id: "l", libelle: "L", min: 36, max: 50, ordre: 3 }),
    ],
  });

  it("une seule plage convient : elle est seule proposée", () => {
    const d = determinerTaille(REGLABLE, 22);
    expect(d.etat).toBe("trouvee");
    if (d.etat === "trouvee") {
      expect(d.propositions.map((p) => p.taille.libelle)).toEqual(["S"]);
    }
  });

  it("deux plages se chevauchent : les deux sont proposées, la mieux centrée d'abord", () => {
    // 29 : S (20-30) est en bout de course, M (28-40) le prend mieux… mais
    // 29 est à 1 du bord de M et à 1 du bord de S. Prenons 32 pour trancher.
    const d = determinerTaille(REGLABLE, 32);
    expect(d.etat).toBe("trouvee");
    if (d.etat === "trouvee") {
      // 32 est au milieu de M (28-40, milieu 34) et hors de S.
      expect(d.propositions.map((p) => p.taille.libelle)).toEqual(["M"]);
    }

    // 29 : dans S (20-30) et dans M (28-40).
    const d2 = determinerTaille(REGLABLE, 29);
    expect(d2.etat).toBe("trouvee");
    if (d2.etat === "trouvee") {
      expect(d2.propositions).toHaveLength(2);
      // S : milieu 25, demi 5, écart |29-25|/5 = 0,8. M : milieu 34, demi 6,
      // écart |29-34|/6 = 0,83. S est donc un peu mieux centré.
      expect(d2.propositions[0].taille.libelle).toBe("S");
      expect(d2.propositions[1].taille.libelle).toBe("M");
      expect(d2.propositions[0].ecartAuCentre!).toBeLessThan(d2.propositions[1].ecartAuCentre!);
    }
  });

  it("classe par centrage, pas par ordre de saisie", () => {
    // 38 : dans M (28-40, milieu 34, écart 4/6 = 0,67) et L (36-50, milieu 43,
    // écart 5/7 = 0,71). M passe devant, alors que L est saisie après.
    const d = determinerTaille(REGLABLE, 38);
    if (d.etat === "trouvee") {
      expect(d.propositions.map((p) => p.taille.libelle)).toEqual(["M", "L"]);
    }
  });

  it("trois plages qui se chevauchent sont toutes proposées", () => {
    const large = grille({
      mode_taille: "plages",
      valeurs: [
        taille({ id: "a", libelle: "A", min: 20, max: 40, ordre: 1 }),
        taille({ id: "b", libelle: "B", min: 25, max: 45, ordre: 2 }),
        taille({ id: "c", libelle: "C", min: 28, max: 38, ordre: 3 }),
      ],
    });
    const d = determinerTaille(large, 33);
    expect(d.etat).toBe("trouvee");
    if (d.etat === "trouvee") {
      expect(d.propositions).toHaveLength(3);
      // C (28-38) a son milieu à 33 : pile au centre, donc en tête.
      expect(d.propositions[0].taille.libelle).toBe("C");
      expect(d.propositions[0].ecartAuCentre).toBe(0);
      expect(d.propositions[0].raison).toContain("au milieu de cette plage");
    }
  });

  it("une mesure exactement sur une borne appartient à la plage", () => {
    const d = determinerTaille(REGLABLE, 20);
    if (d.etat === "trouvee") expect(d.propositions[0].taille.libelle).toBe("S");
    const d2 = determinerTaille(REGLABLE, 50);
    if (d2.etat === "trouvee") expect(d2.propositions[0].taille.libelle).toBe("L");
    // Et l'écart au centre y vaut 1 : le bout de course.
    if (d2.etat === "trouvee") expect(d2.propositions[0].ecartAuCentre).toBe(1);
  });

  it("le dit clairement quand aucune plage ne convient, et propose le sur-mesure", () => {
    const d = determinerTaille(REGLABLE, 60);
    expect(d.etat).toBe("hors_grille");
    if (d.etat === "hors_grille") {
      expect(d.message).toContain("Aucune taille réglable");
      expect(d.message).toContain("sur mesure");
    }
  });

  it("écrit la raison du classement, en une ligne, pour chaque proposition", () => {
    const d = determinerTaille(REGLABLE, 29);
    if (d.etat === "trouvee") {
      for (const p of d.propositions) {
        expect(p.raison.length).toBeGreaterThan(10);
        expect(p.raison).toContain("cm");
      }
      expect(d.propositions[1].raison).toContain("Convient aussi");
    }
  });
});

describe("continuité d'une grille de plages", () => {
  it("ne signale pas les chevauchements : ils sont attendus", () => {
    const chevauchee = grille({
      mode_taille: "plages",
      valeurs: [
        taille({ id: "a", libelle: "A", min: 20, max: 35 }),
        taille({ id: "b", libelle: "B", min: 30, max: 45 }),
      ],
    });
    expect(trousDeLaGrille(chevauchee)).toEqual([]);
    expect(refusGrille(chevauchee)).toBeNull();
  });

  it("signale les trous, qui sont de vraies fautes", () => {
    const trouee = grille({
      mode_taille: "plages",
      valeurs: [
        taille({ id: "a", libelle: "A", min: 20, max: 41 }),
        taille({ id: "b", libelle: "B", min: 44, max: 60 }),
      ],
    });
    expect(trousDeLaGrille(trouee)).toEqual([{ de: 41, a: 44 }]);
    expect(refusGrille(trouee)).toContain("41 à 44 cm");
  });

  it("refuse une plage à l'envers ou incomplète", () => {
    expect(refusGrille(grille({
      mode_taille: "plages",
      valeurs: [taille({ id: "a", libelle: "A", min: 40, max: 20 })],
    }))).toContain("en dessous de la borne basse");
    expect(refusGrille(grille({
      mode_taille: "plages",
      valeurs: [taille({ id: "a", libelle: "A", min: 40, max: null })],
    }))).toContain("plage complète");
  });

  it("réclame au moins une taille", () => {
    expect(refusGrille(grille({ valeurs: [] }))).toContain("au moins une taille");
  });
});

// ── Prix ───────────────────────────────────────────────────────────────────

describe("supplément au centimètre", () => {
  const LAISSE = grille({
    nom: "Longueur", mode_taille: "plages",
    supplement_par_cm: 0.2, borne_supplement_cm: 200,
    valeurs: [taille({ id: "a", libelle: "Standard", min: 100, max: 300 })],
  });

  it("ne compte rien jusqu'à la borne, borne comprise", () => {
    expect(supplementAuCentimetre(LAISSE, 150)).toBe(0);
    expect(supplementAuCentimetre(LAISSE, 200)).toBe(0);
  });

  it("compte chaque centimètre au-delà", () => {
    // 300 cm, borne à 200 : 100 cm × 0,20 = 20.
    expect(supplementAuCentimetre(LAISSE, 300)).toBe(20);
    expect(supplementAuCentimetre(LAISSE, 250)).toBe(10);
  });

  it("ne compte rien s'il n'est pas réglé : les colliers ne s'en servent pas", () => {
    expect(supplementAuCentimetre(SEPT, 300)).toBe(0);
    expect(supplementAuCentimetre({ ...LAISSE, supplement_par_cm: null }, 300)).toBe(0);
    expect(supplementAuCentimetre({ ...LAISSE, borne_supplement_cm: null }, 300)).toBe(0);
    expect(supplementAuCentimetre(LAISSE, null)).toBe(0);
  });
});

// ── Ordre des questions ────────────────────────────────────────────────────

describe("ordre des questions", () => {
  const mesure = { id: "g-cou", nom: "Tour de cou", type: "mesure", ordre: 1 } as GroupeTaille;
  const autreMesure = { id: "g-dos", nom: "Longueur de dos", type: "mesure", ordre: 9 } as GroupeTaille;
  const taillesGroupe = { ...SEPT, id: "g-taille", ordre: 2, mesure_groupe_id: "g-cou" };

  it("accepte la mesure avant la taille", () => {
    expect(refusOrdreTailles([mesure, taillesGroupe, autreMesure])).toBeNull();
  });

  it("refuse la taille avant sa mesure, en nommant les deux", () => {
    const inverse = [{ ...mesure, ordre: 5 }, { ...taillesGroupe, ordre: 2 }];
    const refus = refusOrdreTailles(inverse);
    expect(refus).toContain("Taille");
    expect(refus).toContain("Tour de cou");
    expect(refus).toContain("posée avant");
  });

  it("refuse une grille dont la mesure a disparu", () => {
    expect(refusOrdreTailles([taillesGroupe])).toContain("n'est plus là");
  });

  it("ne retient que les mesures qui commandent une grille", () => {
    const commandent = mesuresQuiCommandent([mesure, taillesGroupe, autreMesure]);
    expect(commandent.has("g-cou")).toBe(true);
    // La longueur de dos ne commande rien : elle reste à la fin du parcours.
    expect(commandent.has("g-dos")).toBe(false);
  });
});

describe("rangement des tailles", () => {
  it("range par borne basse, pas par ordre de saisie", () => {
    const desordre = grille({
      mode_taille: "seuils",
      valeurs: [
        taille({ id: "l", libelle: "L", min: 41, ordre: 1 }),
        taille({ id: "xxs", libelle: "XXS", min: 0, ordre: 2 }),
        taille({ id: "m", libelle: "M", min: 33, ordre: 3 }),
      ],
    });
    expect(taillesTriees(desordre).map((t) => t.libelle)).toEqual(["XXS", "M", "L"]);
  });

  it("écarte une taille désactivée", () => {
    const avecInactive = grille({
      mode_taille: "seuils",
      valeurs: [
        taille({ id: "a", libelle: "A", min: 0 }),
        taille({ id: "b", libelle: "B", min: 30, actif: false }),
      ],
    });
    expect(taillesTriees(avecInactive).map((t) => t.libelle)).toEqual(["A"]);
    // Et la grille se recalcule sans elle : A couvre désormais tout.
    expect(tailleRecommandee(determinerTaille(avecInactive, 40))?.libelle).toBe("A");
  });
});
