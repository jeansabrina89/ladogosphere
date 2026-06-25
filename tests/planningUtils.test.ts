import { describe, it, expect } from "vitest";
import { joursTravaillesSemaine, moyenneJoursTravaillesSemaine, joursVacancesTheoriques, reequilibrerCfc, equilibrerPlanningMois } from "../src/lib/planningUtils";

describe("joursTravaillesSemaine", () => {
  it("100% → 5 jours (entier, constant)", () => {
    expect(joursTravaillesSemaine(100, 0)).toBe(5);
    expect(joursTravaillesSemaine(100, 1)).toBe(5);
  });

  it("80% → 4 jours (entier, constant)", () => {
    expect(joursTravaillesSemaine(80, 0)).toBe(4);
    expect(joursTravaillesSemaine(80, 3)).toBe(4);
  });

  it("60% → 3 jours (entier, constant)", () => {
    expect(joursTravaillesSemaine(60, 0)).toBe(3);
  });

  it("40% → 2 jours (entier, constant)", () => {
    expect(joursTravaillesSemaine(40, 0)).toBe(2);
  });

  it("50% → plancher (2) semaine paire, plafond (3) semaine impaire", () => {
    expect(joursTravaillesSemaine(50, 0)).toBe(2); // index pair
    expect(joursTravaillesSemaine(50, 1)).toBe(3); // index impair
    expect(joursTravaillesSemaine(50, 2)).toBe(2); // pair
    expect(joursTravaillesSemaine(50, 3)).toBe(3); // impair
  });

  it("90% → plancher (4) semaine paire, plafond (5) semaine impaire", () => {
    expect(joursTravaillesSemaine(90, 0)).toBe(4);
    expect(joursTravaillesSemaine(90, 1)).toBe(5);
  });
});

describe("moyenneJoursTravaillesSemaine", () => {
  it("retourne taux/20", () => {
    expect(moyenneJoursTravaillesSemaine(100)).toBe(5);
    expect(moyenneJoursTravaillesSemaine(50)).toBe(2.5);
    expect(moyenneJoursTravaillesSemaine(80)).toBe(4);
  });
});

describe("joursVacancesTheoriques", () => {
  // Référence : 2024-01-01 est un lundi (index 0, pair)
  it("100% sur 5 jours ouvrés (lun-ven) → 5", () => {
    expect(joursVacancesTheoriques(100, "2024-01-01", "2024-01-05")).toBe(5);
  });

  it("80% sur 5 jours ouvrés → 4", () => {
    expect(joursVacancesTheoriques(80, "2024-01-01", "2024-01-05")).toBe(4);
  });

  it("50% sur semaine paire (index 0) → plancher 2", () => {
    // 2024-01-01 à 2024-01-07 : semaine index 0 (pair) → joursTravaillesSemaine(50,0)=2
    expect(joursVacancesTheoriques(50, "2024-01-01", "2024-01-07")).toBe(2);
  });

  it("50% sur semaine impaire (index 1) → plafond 3", () => {
    // 2024-01-08 à 2024-01-14 : semaine index 1 (impair) → joursTravaillesSemaine(50,1)=3
    expect(joursVacancesTheoriques(50, "2024-01-08", "2024-01-14")).toBe(3);
  });

  it("plage nulle (un seul jour) → au plus 1", () => {
    const j = joursVacancesTheoriques(100, "2024-01-01", "2024-01-01");
    expect(j).toBeGreaterThanOrEqual(0);
    expect(j).toBeLessThanOrEqual(1);
  });
});

describe("reequilibrerCfc", () => {
  const J = (n: number) => `2026-06-${String(n).padStart(2, "0")}`;
  const semaine = [J(1), J(2), J(3), J(4), J(5), J(6), J(7)];
  const dansMois = (d: string) => d.startsWith("2026-06-");
  const faux = () => false;
  const couvre = (t: Record<string, Set<string>>, ids: string[], d: string) =>
    ids.some(id => t[id]?.has(d));

  it("echange pour couvrir tous les jours sans changer les taux", () => {
    const travail = {
      S: new Set([J(1), J(2), J(3), J(4), J(5)]),
      F: new Set([J(1), J(2)]),
    };
    const r = reequilibrerCfc({
      semaine, estDansMois: dansMois, cfcIds: ["S", "F"], travail,
      estIndispo: faux, estEnVacances: faux,
      limiteConsecutive: () => 6, carryIn: () => 0,
    });
    expect(r.S.size).toBe(5);
    expect(r.F.size).toBe(2);
    for (const d of semaine) expect(couvre(r, ["S", "F"], d)).toBe(true);
  });

  it("capacite insuffisante : Sabrina en vacances toute la semaine, Francine inchangee", () => {
    const travail = {
      S: new Set([J(1), J(2), J(3), J(4), J(5)]),
      F: new Set([J(1), J(2)]),
    };
    const r = reequilibrerCfc({
      semaine, estDansMois: dansMois, cfcIds: ["S", "F"], travail,
      estIndispo: faux, estEnVacances: (id) => id === "S",
      limiteConsecutive: () => 6, carryIn: () => 0,
    });
    expect(r.S.size).toBe(5);
    expect(r.F.size).toBe(2);
    const couverts = semaine.filter(d =>
      ["S", "F"].some(id => r[id].has(d) && id !== "S")
    );
    expect(couverts.length).toBe(2);
  });

  it("utilise un jour donneur hors mois (CFC unique)", () => {
    const semaineB = ["2026-05-30", "2026-05-31", J(1), J(2), J(3), J(4), J(5)];
    const travail = { F: new Set(["2026-05-30", "2026-05-31", J(1), J(2), J(3)]) };
    const r = reequilibrerCfc({
      semaine: semaineB, estDansMois: dansMois, cfcIds: ["F"], travail,
      estIndispo: faux, estEnVacances: faux,
      limiteConsecutive: () => 6, carryIn: () => 0,
    });
    expect(r.F.size).toBe(5);
    for (const d of [J(1), J(2), J(3), J(4), J(5)]) expect(r.F.has(d)).toBe(true);
  });

  it("une CFC unique ne peut pas couvrir plus de jours qu'elle n'en travaille", () => {
    const travail = { F: new Set([J(1), J(2)]) };
    const r = reequilibrerCfc({
      semaine, estDansMois: dansMois, cfcIds: ["F"], travail,
      estIndispo: faux, estEnVacances: faux,
      limiteConsecutive: () => 6, carryIn: () => 0,
    });
    expect(r.F.size).toBe(2);
    expect(r.F.has(J(1))).toBe(true);
    expect(r.F.has(J(2))).toBe(true);
  });
});

describe("equilibrerPlanningMois", () => {
  const J = (n: number) => `2026-07-${String(n).padStart(2, "0")}`;
  const mk = (jours: string[], days: string[]) => {
    const o: Record<string, string> = {};
    jours.forEach(d => { o[d] = days.includes(d) ? "travail" : "repos"; });
    return o;
  };
  const cnt = (st: Record<string, Record<string, string>>, jours: string[], id: string) =>
    jours.filter(d => st[id][d] === "travail" || st[id][d] === "ferie_travaille").length;

  it("nivelle les effectifs (ecart <= 1) sans changer les taux", () => {
    const jours = [J(1), J(2), J(3), J(4), J(5), J(6)];
    const employes = [
      { id: "A", estCfc: false, limite: 6 },
      { id: "B", estCfc: false, limite: 6 },
      { id: "C", estCfc: false, limite: 6 },
    ];
    const statuts = {
      A: mk(jours, [J(1), J(2), J(3)]),
      B: mk(jours, [J(1), J(2), J(3)]),
      C: mk(jours, [J(1), J(2), J(3)]),
    };
    const r = equilibrerPlanningMois({ jours, feries: [], employes, statuts });
    const effs = jours.map(d => ["A", "B", "C"].filter(id =>
      r[id][d] === "travail" || r[id][d] === "ferie_travaille").length);
    expect(Math.max(...effs) - Math.min(...effs)).toBeLessThanOrEqual(1);
    expect(cnt(r, jours, "A")).toBe(3);
    expect(cnt(r, jours, "B")).toBe(3);
    expect(cnt(r, jours, "C")).toBe(3);
  });

  it("garantit une CFC chaque jour par echange, taux preserves", () => {
    const jours = [J(1), J(2), J(3), J(4)];
    const employes = [
      { id: "S", estCfc: true, limite: 6 },
      { id: "F", estCfc: true, limite: 6 },
      { id: "A", estCfc: false, limite: 6 },
    ];
    const statuts = {
      S: mk(jours, [J(1), J(2)]),
      F: mk(jours, [J(1), J(2)]),
      A: mk(jours, [J(3), J(4)]),
    };
    const r = equilibrerPlanningMois({ jours, feries: [], employes, statuts });
    for (const d of jours) {
      const cfc = ["S", "F"].some(id => r[id][d] === "travail" || r[id][d] === "ferie_travaille");
      expect(cfc).toBe(true);
    }
    expect(cnt(r, jours, "S")).toBe(2);
    expect(cnt(r, jours, "F")).toBe(2);
    expect(cnt(r, jours, "A")).toBe(2);
  });

  it("laisse inchange un planning deja equilibre et couvert", () => {
    const jours = [J(1), J(2)];
    const employes = [
      { id: "S", estCfc: true, limite: 6 },
      { id: "A", estCfc: false, limite: 6 },
    ];
    const statuts = { S: mk(jours, [J(1), J(2)]), A: mk(jours, [J(1), J(2)]) };
    const r = equilibrerPlanningMois({ jours, feries: [], employes, statuts });
    expect(r.S[J(1)]).toBe("travail");
    expect(r.S[J(2)]).toBe("travail");
    expect(r.A[J(1)]).toBe("travail");
    expect(r.A[J(2)]).toBe("travail");
  });
});

describe("equilibrerPlanningMois - week-ends", () => {
  // 2026-07-04 = samedi, 2026-07-05 = dimanche, 2026-07-06 = lundi, 2026-07-07 = mardi
  const J = (n: number) => `2026-07-${String(n).padStart(2, "0")}`;
  const mk = (jours: string[], days: string[]) => {
    const o: Record<string, string> = {};
    jours.forEach(d => { o[d] = days.includes(d) ? "travail" : "repos"; });
    return o;
  };
  const cnt = (st: Record<string, Record<string, string>>, jours: string[], id: string) =>
    jours.filter(d => st[id][d] === "travail" || st[id][d] === "ferie_travaille").length;
  const weOf = (jours: string[]) => jours.filter(d => {
    const dow = new Date(d + "T12:00:00").getDay();
    return dow === 0 || dow === 6;
  });

  it("equilibre les week-ends au sein d'un groupe (ecart <= 1), taux preserves", () => {
    const jours = [J(4), J(5), J(6), J(7)]; // sam, dim, lun, mar
    const employes = [
      { id: "S", estCfc: true, limite: 6 },
      { id: "F", estCfc: true, limite: 6 },
    ];
    const statuts = {
      S: mk(jours, [J(4), J(5)]),
      F: mk(jours, [J(6), J(7)]),
    };
    const r = equilibrerPlanningMois({ jours, feries: [], employes, statuts });
    const we = weOf(jours);
    const weS = we.filter(d => r.S[d] === "travail" || r.S[d] === "ferie_travaille").length;
    const weF = we.filter(d => r.F[d] === "travail" || r.F[d] === "ferie_travaille").length;
    expect(Math.abs(weS - weF)).toBeLessThanOrEqual(1);
    expect(cnt(r, jours, "S")).toBe(2);
    expect(cnt(r, jours, "F")).toBe(2);
  });
});
