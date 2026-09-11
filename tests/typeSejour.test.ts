import { describe, it, expect } from "vitest";
import {
  AIDE_OCCUPATION_PAYANTE,
  AIDE_OCCUPATION_REELLE,
  LIBELLE_OCCUPATION_PAYANTE,
  LIBELLE_OCCUPATION_REELLE,
  MESSAGE_TYPE_RESERVE,
  MOTIF_REQUALIFICATION_REQUIS,
  TYPES_SEJOUR,
  TYPE_SEJOUR_PAR_DEFAUT,
  comptesNonFactures,
  compteDansActivite,
  filtrerActivite,
  filtrerNonFactures,
  infoTypeSejour,
  libelleTypeSejour,
  occupeUnBox,
  reglesFacturation,
  refusRequalification,
  refusTypeSejour,
  tauxOccupation,
  typeSejour,
  typeSejourPropose,
  typesSejourAutorises,
  ventilerParTypeSejour,
} from "@/src/lib/typeSejour";

/**
 * Deux règles opposées, et c'est tout l'enjeu : les chiffres ne comptent que
 * la pension, la disponibilité compte tout.
 */

const TOUS = ["pension", "personnel", "urgence", "abandon"] as const;

describe("les quatre types", () => {
  it("sont exactement ceux-là, et la pension est le défaut", () => {
    expect(TYPES_SEJOUR.map((t) => t.valeur)).toEqual([...TOUS]);
    expect(TYPE_SEJOUR_PAR_DEFAUT).toBe("pension");
  });

  it("une valeur absente ou inventée retombe sur la pension", () => {
    expect(typeSejour(null)).toBe("pension");
    expect(typeSejour(undefined)).toBe("pension");
    expect(typeSejour("")).toBe("pension");
    expect(typeSejour("vacances")).toBe("pension");
  });

  it("chacun se nomme en français", () => {
    expect(libelleTypeSejour("pension")).toBe("Pension");
    expect(libelleTypeSejour("personnel")).toBe("Personnel");
    expect(libelleTypeSejour("urgence")).toBe("Urgence");
    expect(libelleTypeSejour("abandon")).toBe("Abandon");
  });
});

// ── La règle des chiffres ─────────────────────────────────────────────────

describe("seule la pension entre dans les chiffres", () => {
  it("la pension compte", () => {
    expect(compteDansActivite("pension")).toBe(true);
  });

  it("les trois autres ne comptent pas", () => {
    expect(compteDansActivite("personnel")).toBe(false);
    expect(compteDansActivite("urgence")).toBe(false);
    expect(compteDansActivite("abandon")).toBe(false);
  });

  it("une valeur inconnue compte comme de la pension : on ne perd pas du chiffre par accident", () => {
    // Le sens du défaut est délibéré : un type illisible doit gonfler une
    // colonne visible, pas disparaître en silence d'un chiffre d'affaires.
    expect(compteDansActivite("n'importe quoi")).toBe(true);
    expect(compteDansActivite(null)).toBe(true);
  });

  it("le filtre garde la pension et rien d’autre", () => {
    const lignes = TOUS.map((t) => ({ id: t, type_sejour: t }));
    expect(filtrerActivite(lignes).map((l) => l.id)).toEqual(["pension"]);
    expect(filtrerNonFactures(lignes).map((l) => l.id)).toEqual([
      "personnel", "urgence", "abandon",
    ]);
  });

  it("une ligne sans type est de la pension : les 23 réservations d’avant la reprise le sont", () => {
    const lignes = [{ id: "ancienne" }, { id: "abandon", type_sejour: "abandon" }];
    expect(filtrerActivite(lignes).map((l) => l.id)).toEqual(["ancienne"]);
  });
});

// ── La règle inverse ──────────────────────────────────────────────────────

describe("tous les types occupent un box", () => {
  it("aucun type n’est écarté de la disponibilité", () => {
    for (const t of TOUS) expect(occupeUnBox(t)).toBe(true);
    expect(occupeUnBox(null)).toBe(true);
    expect(occupeUnBox("inconnu")).toBe(true);
  });

  it("y compris ceux qui ne rapportent rien — c’est le sens de la règle", () => {
    const gratuits = TOUS.filter((t) => !compteDansActivite(t));
    expect(gratuits).toHaveLength(3);
    for (const t of gratuits) expect(occupeUnBox(t)).toBe(true);
  });
});

// ── Les règles de facturation, rattachées et non réinventées ──────────────

describe("ce que chaque type facture", () => {
  it("pension : tarif normal, adhésion exigée", () => {
    expect(reglesFacturation("pension")).toEqual({
      gratuitParDefaut: false, tarif: "normal", montantLibre: true,
      adhesionRequise: true, essaiPropose: true,
    });
  });

  it("personnel : gratuit, sans adhésion ni journée d’essai", () => {
    const r = reglesFacturation("personnel");
    expect(r.gratuitParDefaut).toBe(true);
    expect(r.tarif).toBe("aucun");
    expect(r.adhesionRequise).toBe(false);
    expect(r.essaiPropose).toBe(false);
  });

  it("urgence : le tarif d’urgence existant", () => {
    expect(reglesFacturation("urgence").tarif).toBe("urgence");
    expect(reglesFacturation("urgence").gratuitParDefaut).toBe(false);
  });

  it("abandon : gratuit par défaut, mais un montant reste possible", () => {
    const r = reglesFacturation("abandon");
    expect(r.gratuitParDefaut).toBe(true);
    expect(r.montantLibre).toBe(true);
  });
});

// ── Ce qui se propose et ce qui se refuse ─────────────────────────────────

describe("le type proposé à la création", () => {
  it("suit la fiche : interne → personnel, sinon pension", () => {
    expect(typeSejourPropose({ ficheInterne: true })).toBe("personnel");
    expect(typeSejourPropose({ ficheInterne: false })).toBe("pension");
  });
});

describe("urgence et abandon demandent la permission des tarifs d’urgence", () => {
  it("sans la permission, seuls pension et personnel sont ouverts", () => {
    expect(typesSejourAutorises({ peutTarifsUrgence: false })).toEqual([
      "pension", "personnel",
    ]);
  });

  it("avec la permission, les quatre", () => {
    expect(typesSejourAutorises({ peutTarifsUrgence: true })).toEqual([...TOUS]);
  });

  it("un employé ne se qualifie pas lui-même en urgence", () => {
    expect(refusTypeSejour({ type: "urgence", peutTarifsUrgence: false }))
      .toBe(MESSAGE_TYPE_RESERVE);
    expect(refusTypeSejour({ type: "abandon", peutTarifsUrgence: false }))
      .toBe(MESSAGE_TYPE_RESERVE);
  });

  it("mais il pose pension et personnel sans rien demander", () => {
    expect(refusTypeSejour({ type: "pension", peutTarifsUrgence: false })).toBeNull();
    expect(refusTypeSejour({ type: "personnel", peutTarifsUrgence: false })).toBeNull();
  });

  it("un type inventé est refusé, permission ou pas", () => {
    expect(refusTypeSejour({ type: "gratuit", peutTarifsUrgence: true }))
      .toBe("Choisissez le type de séjour.");
  });
});

// ── La requalification ────────────────────────────────────────────────────

describe("requalifier un séjour", () => {
  const permis = { peutTarifsUrgence: true };

  it("exige un motif dès que le type change", () => {
    expect(refusRequalification({ avant: "pension", apres: "abandon", motif: "", ...permis }))
      .toBe(MOTIF_REQUALIFICATION_REQUIS);
    expect(refusRequalification({ avant: "pension", apres: "abandon", motif: "   ", ...permis }))
      .toBe(MOTIF_REQUALIFICATION_REQUIS);
    expect(refusRequalification({ avant: "pension", apres: "abandon", motif: null, ...permis }))
      .toBe(MOTIF_REQUALIFICATION_REQUIS);
  });

  it("l’accepte avec un motif", () => {
    expect(refusRequalification({
      avant: "pension", apres: "abandon",
      motif: "Chien laissé sur place, propriétaire injoignable.", ...permis,
    })).toBeNull();
  });

  it("ne demande rien quand le type ne bouge pas", () => {
    expect(refusRequalification({ avant: "pension", apres: "pension", motif: "", ...permis }))
      .toBeNull();
  });

  it("garde la règle de permission : requalifier en urgence en demande autant que la poser", () => {
    expect(refusRequalification({
      avant: "pension", apres: "urgence", motif: "Un motif", peutTarifsUrgence: false,
    })).toBe(MESSAGE_TYPE_RESERVE);
  });
});

// ── Les compteurs du tableau de bord ──────────────────────────────────────

describe("les accueils non facturés", () => {
  it("comptent les trois types, jamais la pension", () => {
    const lignes = [
      { type_sejour: "pension" }, { type_sejour: "pension" },
      { type_sejour: "personnel" },
      { type_sejour: "urgence" }, { type_sejour: "urgence" }, { type_sejour: "urgence" },
      { type_sejour: "abandon" },
    ];
    expect(comptesNonFactures(lignes)).toEqual({
      personnel: 1, urgence: 3, abandon: 1, total: 5,
    });
  });

  it("rendent zéro sur une liste qui n’a que de la pension", () => {
    expect(comptesNonFactures([{ type_sejour: "pension" }, {}])).toEqual({
      personnel: 0, urgence: 0, abandon: 0, total: 0,
    });
  });
});

// ── Les deux taux ─────────────────────────────────────────────────────────

describe("les deux taux d’occupation", () => {
  it("se nomment sans ambiguïté", () => {
    expect(LIBELLE_OCCUPATION_REELLE).toBe("Occupation réelle");
    expect(LIBELLE_OCCUPATION_PAYANTE).toBe("Occupation payante");
    expect(AIDE_OCCUPATION_REELLE).toContain("charge de travail");
    expect(AIDE_OCCUPATION_PAYANTE).toContain("activité");
  });

  it("la maison pleine à moitié gratuitement : 100 % réel, 50 % payant", () => {
    expect(tauxOccupation({ boxJoursTous: 120, boxJoursPension: 60, capacite: 120 }))
      .toEqual({ reelle: 100, payante: 50 });
  });

  it("sans accueil gratuit, les deux se confondent", () => {
    expect(tauxOccupation({ boxJoursTous: 90, boxJoursPension: 90, capacite: 120 }))
      .toEqual({ reelle: 75, payante: 75 });
  });

  it("le payant ne dépasse jamais le réel", () => {
    const t = tauxOccupation({ boxJoursTous: 100, boxJoursPension: 30, capacite: 200 });
    expect(t.payante).toBeLessThanOrEqual(t.reelle);
  });

  it("une capacité nulle rend zéro, pas une division par zéro", () => {
    expect(tauxOccupation({ boxJoursTous: 10, boxJoursPension: 10, capacite: 0 }))
      .toEqual({ reelle: 0, payante: 0 });
  });

  it("arrondit à la décimale, comme les taux déjà affichés", () => {
    expect(tauxOccupation({ boxJoursTous: 1, boxJoursPension: 1, capacite: 3 }))
      .toEqual({ reelle: 33.3, payante: 33.3 });
  });
});

// ── La pastille de liste ──────────────────────────────────────────────────

describe("la pastille", () => {
  it("nomme le type autrement que par sa valeur technique", () => {
    expect(infoTypeSejour("urgence").pastille).toBe("🚨 Urgence");
    expect(infoTypeSejour("abandon").pastille).toBe("🏠 Abandon");
    expect(infoTypeSejour("personnel").pastille).toBe("⭐ Personnel");
  });
});

// ── La ventilation de l'exercice ──────────────────────────────────────────

describe("ventiler un exercice par type de séjour", () => {
  const exercice = [
    { type_sejour: "pension", nuitees: 10, montant: 800 },
    { type_sejour: "pension", nuitees: 4, montant: 320 },
    { type_sejour: "personnel", nuitees: 30, montant: 0 },
    { type_sejour: "urgence", nuitees: 3, montant: 90 },
    { type_sejour: "abandon", nuitees: 45, montant: 200 },
  ];

  it("rend toujours les quatre types, dans l’ordre, même à zéro", () => {
    const v = ventilerParTypeSejour([{ type_sejour: "pension" }]);
    expect(v.lignes.map((l) => l.type)).toEqual([
      "pension", "personnel", "urgence", "abandon",
    ]);
    expect(v.lignes.filter((l) => l.nb === 0)).toHaveLength(3);
  });

  it("sépare ce qui produit de ce qui ne produit pas", () => {
    const v = ventilerParTypeSejour(exercice);
    expect(v.activiteNb).toBe(2);
    expect(v.activiteNuitees).toBe(14);
    expect(v.activiteMontant).toBe(1120);
    expect(v.nonFacturesNb).toBe(3);
    expect(v.nonFacturesNuitees).toBe(78);
    expect(v.nonFacturesMontant).toBe(290);
  });

  it("le total accueilli est bien plus grand que l’activité : c’est tout l’intérêt", () => {
    const v = ventilerParTypeSejour(exercice);
    expect(v.totalNb).toBe(5);
    expect(v.totalNuitees).toBe(92);
    expect(v.totalMontant).toBe(1410);
    expect(v.activiteNuitees).toBeLessThan(v.nonFacturesNuitees);
  });

  it("un abandon peut porter un montant : un refuge participe parfois", () => {
    const v = ventilerParTypeSejour([{ type_sejour: "abandon", montant: 150 }]);
    expect(v.lignes.find((l) => l.type === "abandon")!.montant).toBe(150);
    expect(v.activiteMontant).toBe(0);
  });

  it("une ligne sans type entre dans la pension, comme partout ailleurs", () => {
    const v = ventilerParTypeSejour([{ nuitees: 2, montant: 160 }]);
    expect(v.activiteNb).toBe(1);
    expect(v.nonFacturesNb).toBe(0);
  });

  it("une liste vide rend quatre lignes à zéro, pas un tableau vide", () => {
    const v = ventilerParTypeSejour([]);
    expect(v.lignes).toHaveLength(4);
    expect(v.totalMontant).toBe(0);
  });
});
