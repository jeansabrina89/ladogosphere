import { describe, it, expect } from "vitest";
import {
  FENETRE_JOURS,
  fenetreGlissante,
  joursRetenus,
  planRegeneration,
  repartitionHebdomadaire,
  tachesAttendues,
  type TacheExistante,
} from "@/src/lib/generationTaches";
import { cleSemaine, jourDe } from "@/src/lib/prestationsLogique";

/**
 * Quatorze jours, jamais l'année. Et relancer ne doit rien casser : c'est la
 * promesse sur laquelle repose tout l'écran des tâches.
 */

const NETTOYAGE = "p-nettoyage";
const PASSAGE = "p-passage";

// 2026-09-14 est un lundi.
const LUNDI = "2026-09-14";

describe("la fenêtre glissante", () => {
  it("couvre quatorze jours, aujourd’hui compris", () => {
    expect(FENETRE_JOURS).toBe(14);
    expect(fenetreGlissante(LUNDI)).toEqual({ debut: "2026-09-14", fin: "2026-09-27" });
  });

  it("ne génère rien au-delà — une année d’avance serait ingérable", () => {
    const { debut, fin } = fenetreGlissante(LUNDI);
    const taches = tachesAttendues({
      lignes: [{ prestation_id: PASSAGE, quantite_par_semaine: 7 }],
      debut, fin, abonnementDebut: "2026-01-01",
    });
    expect(taches).toHaveLength(14);
    expect(taches.at(-1)!.date).toBe("2026-09-27");
  });
});

describe("les repères de calendrier", () => {
  it("le 14 septembre 2026 est un lundi", () => {
    expect(jourDe(LUNDI)).toBe("lundi");
    expect(jourDe("2026-09-20")).toBe("dimanche");
  });

  it("une semaine ISO se nomme pareil du lundi au dimanche", () => {
    expect(cleSemaine("2026-09-14")).toBe(cleSemaine("2026-09-20"));
    expect(cleSemaine("2026-09-21")).not.toBe(cleSemaine("2026-09-20"));
  });
});

describe("la répartition d’une quantité hebdomadaire", () => {
  it("deux nettoyages sur deux jours : un chacun", () => {
    const r = repartitionHebdomadaire({ quantiteParSemaine: 2, jours: ["lundi", "jeudi"] });
    expect([...r.entries()]).toEqual([["lundi", 1], ["jeudi", 1]]);
  });

  it("quatorze passages sur sept jours : deux par jour", () => {
    const r = repartitionHebdomadaire({
      quantiteParSemaine: 14,
      jours: ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"],
    });
    expect([...r.values()]).toEqual([2, 2, 2, 2, 2, 2, 2]);
  });

  it("trois balades sur sept jours : les trois premiers jours de la semaine", () => {
    const r = repartitionHebdomadaire({
      quantiteParSemaine: 3,
      jours: ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"],
    });
    expect([...r.entries()]).toEqual([["lundi", 1], ["mardi", 1], ["mercredi", 1]]);
  });

  it("aucun jour retenu ne produit rien, sans division par zéro", () => {
    expect(repartitionHebdomadaire({ quantiteParSemaine: 5, jours: [] }).size).toBe(0);
  });
});

describe("les jours d’une prestation", () => {
  const ligne = { prestation_id: NETTOYAGE, quantite_par_semaine: 2, jours: ["lundi", "jeudi"] };
  const semaine = cleSemaine(LUNDI);

  it("suivent la formule quand rien n’est personnalisé", () => {
    expect(joursRetenus({ ligne, semaine, joursPersonnalises: null }))
      .toEqual(["lundi", "jeudi"]);
  });

  it("sans jours dans la formule, c’est tous les jours", () => {
    expect(joursRetenus({
      ligne: { prestation_id: PASSAGE, quantite_par_semaine: 7 }, semaine,
    })).toHaveLength(7);
  });

  it("l’ajustement REMPLACE les jours de la formule, il ne s’y ajoute pas", () => {
    expect(joursRetenus({
      ligne, semaine,
      joursPersonnalises: { [semaine]: { [NETTOYAGE]: ["mardi"] } },
    })).toEqual(["mardi"]);
  });

  it("une liste vide dit « rien cette semaine-là »", () => {
    expect(joursRetenus({
      ligne, semaine, joursPersonnalises: { [semaine]: { [NETTOYAGE]: [] } },
    })).toEqual([]);
  });

  it("n’agit que sur la semaine visée et la prestation visée", () => {
    const perso = { [semaine]: { [NETTOYAGE]: ["mardi"] } };
    expect(joursRetenus({ ligne, semaine: "2026-W40", joursPersonnalises: perso }))
      .toEqual(["lundi", "jeudi"]);
    expect(joursRetenus({
      ligne: { prestation_id: PASSAGE, quantite_par_semaine: 1, jours: ["samedi"] },
      semaine, joursPersonnalises: perso,
    })).toEqual(["samedi"]);
  });

  it("un jour inventé est ignoré, il ne fait pas tomber la génération", () => {
    expect(joursRetenus({
      ligne, semaine, joursPersonnalises: { [semaine]: { [NETTOYAGE]: ["lundi", "octidi"] } },
    })).toEqual(["lundi"]);
  });
});

describe("ce que l’abonnement doit produire", () => {
  const lignes = [
    { prestation_id: NETTOYAGE, quantite_par_semaine: 2, jours: ["lundi", "jeudi"] },
    { prestation_id: PASSAGE, quantite_par_semaine: 7 },
  ];
  const { debut, fin } = fenetreGlissante(LUNDI);

  it("respecte les jours de la formule", () => {
    const taches = tachesAttendues({ lignes, debut, fin, abonnementDebut: "2026-01-01" });
    const nettoyages = taches.filter((t) => t.prestation_id === NETTOYAGE);
    expect(nettoyages.map((t) => t.date)).toEqual([
      "2026-09-14", "2026-09-17", "2026-09-21", "2026-09-24",
    ]);
    expect(taches.filter((t) => t.prestation_id === PASSAGE)).toHaveLength(14);
  });

  it("personnaliser déplace les jours et GARDE la quantité de la semaine", () => {
    // Deux nettoyages par semaine, ramenés sur le seul mardi : ce sont bien
    // deux nettoyages ce mardi-là, pas un seul. Ajuster les jours n'est pas
    // renégocier le forfait.
    const taches = tachesAttendues({
      lignes, debut, fin, abonnementDebut: "2026-01-01",
      joursPersonnalises: { [cleSemaine(LUNDI)]: { [NETTOYAGE]: ["mardi"] } },
    });
    const nettoyages = taches.filter((t) => t.prestation_id === NETTOYAGE);
    expect(nettoyages.map((t) => `${t.date}#${t.rang}`)).toEqual([
      "2026-09-15#1", "2026-09-15#2", "2026-09-21#1", "2026-09-24#1",
    ]);
  });

  it("et la semaine suivante retrouve la formule, intacte", () => {
    const taches = tachesAttendues({
      lignes, debut, fin, abonnementDebut: "2026-01-01",
      joursPersonnalises: { [cleSemaine(LUNDI)]: { [NETTOYAGE]: ["mardi"] } },
    });
    expect(taches.filter((t) => t.prestation_id === NETTOYAGE && t.date >= "2026-09-21")
      .map((t) => t.date)).toEqual(["2026-09-21", "2026-09-24"]);
  });

  it("une semaine vidée ne produit rien du tout cette semaine-là", () => {
    const taches = tachesAttendues({
      lignes: [lignes[0]], debut, fin, abonnementDebut: "2026-01-01",
      joursPersonnalises: { [cleSemaine(LUNDI)]: { [NETTOYAGE]: [] } },
    });
    expect(taches.map((t) => t.date)).toEqual(["2026-09-21", "2026-09-24"]);
  });

  it("ne commence pas avant l’abonnement et ne finit pas après", () => {
    const taches = tachesAttendues({
      lignes: [lignes[1]], debut, fin,
      abonnementDebut: "2026-09-16", abonnementFin: "2026-09-18",
    });
    expect(taches.map((t) => t.date)).toEqual(["2026-09-16", "2026-09-17", "2026-09-18"]);
  });

  it("un abonnement suspendu ou terminé ne produit rien", () => {
    for (const statut of ["suspendu", "termine"]) {
      expect(tachesAttendues({
        lignes, debut, fin, abonnementDebut: "2026-01-01", statut,
      })).toEqual([]);
    }
  });

  it("deux passages le même jour se distinguent par leur rang", () => {
    const taches = tachesAttendues({
      lignes: [{ prestation_id: PASSAGE, quantite_par_semaine: 14 }],
      debut, fin: "2026-09-14", abonnementDebut: "2026-01-01",
    });
    expect(taches.map((t) => t.rang)).toEqual([1, 2]);
  });
});

describe("la régénération", () => {
  const { debut, fin } = fenetreGlissante(LUNDI);
  const lignes = [{ prestation_id: NETTOYAGE, quantite_par_semaine: 2, jours: ["lundi", "jeudi"] }];
  const attendues = tachesAttendues({ lignes, debut, fin, abonnementDebut: "2026-01-01" });

  const enBase = (a: typeof attendues, statut = "a_faire"): TacheExistante[] =>
    a.map((t, i) => ({ ...t, id: `t${i}`, statut }));

  it("crée tout la première fois", () => {
    const plan = planRegeneration({ attendues, existantes: [] });
    expect(plan.aCreer).toHaveLength(4);
    expect(plan.aSupprimer).toEqual([]);
  });

  it("ne duplique rien à la seconde exécution", () => {
    const plan = planRegeneration({ attendues, existantes: enBase(attendues) });
    expect(plan.aCreer).toEqual([]);
    expect(plan.aSupprimer).toEqual([]);
  });

  it("retire ce que la formule ne demande plus, s’il est encore à faire", () => {
    const existantes = enBase(attendues);
    const plan = planRegeneration({ attendues: attendues.slice(0, 2), existantes });
    expect(plan.aCreer).toEqual([]);
    expect(plan.aSupprimer).toEqual(["t2", "t3"]);
  });

  it("une tâche FAITE n’est jamais supprimée par une régénération", () => {
    const existantes = enBase(attendues);
    existantes[3].statut = "faite";
    const plan = planRegeneration({ attendues: attendues.slice(0, 2), existantes });
    expect(plan.aSupprimer).toEqual(["t2"]);
    expect(plan.preservees).toEqual(["t3"]);
  });

  it("une tâche ANNULÉE n’est ni supprimée ni ressuscitée", () => {
    const existantes = enBase(attendues, "annulee");
    const plan = planRegeneration({ attendues, existantes });
    expect(plan.aCreer).toEqual([]);
    expect(plan.aSupprimer).toEqual([]);
  });

  it("le plan appliqué puis rejoué est vide : c’est cela, être idempotent", () => {
    let existantes = enBase([]);
    let plan = planRegeneration({ attendues, existantes });
    existantes = plan.aCreer.map((t, i) => ({ ...t, id: `n${i}`, statut: "a_faire" }));
    plan = planRegeneration({ attendues, existantes });
    expect(plan).toEqual({ aCreer: [], aSupprimer: [], preservees: [] });
  });
});
