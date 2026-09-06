import { describe, it, expect } from "vitest";
import {
  calculerPeriodeCotisation,
  finDePeriode,
  ajouterJoursISO,
  joursEntre,
  cotisationEstActive,
  formatJJMMAAAA,
  formatPeriodeCotisation,
  JOURS_FENETRE_RENOUVELLEMENT,
} from "../src/lib/cotisationPeriode";

describe("calculerPeriodeCotisation — exemples de la règle métier", () => {
  it("17.01.2025 → 17.01.2025 au 31.12.2025", () => {
    expect(calculerPeriodeCotisation("2025-01-17")).toEqual({
      date_debut: "2025-01-17",
      date_fin: "2025-12-31",
    });
  });

  it("01.03.2026 → 01.03.2026 au 28.02.2027", () => {
    expect(calculerPeriodeCotisation("2026-03-01")).toEqual({
      date_debut: "2026-03-01",
      date_fin: "2027-02-28",
    });
  });

  it("31.08.2026 → 31.08.2026 au 31.07.2027", () => {
    expect(calculerPeriodeCotisation("2026-08-31")).toEqual({
      date_debut: "2026-08-31",
      date_fin: "2027-07-31",
    });
  });

  it("renouvellement anticipé : payé le 20.12.2025, précédente finissant le 31.12.2025", () => {
    expect(calculerPeriodeCotisation("2025-12-20", "2025-12-31")).toEqual({
      date_debut: "2026-01-01",
      date_fin: "2026-12-31",
    });
  });

  it("11.08.2026 (reprise des deux cotisations existantes) → 31.07.2027", () => {
    expect(calculerPeriodeCotisation("2026-08-11")).toEqual({
      date_debut: "2026-08-11",
      date_fin: "2027-07-31",
    });
  });
});

describe("calculerPeriodeCotisation — cas limites", () => {
  it("paiement le 1er du mois : 12 mois pleins", () => {
    expect(calculerPeriodeCotisation("2026-09-01")).toEqual({
      date_debut: "2026-09-01",
      date_fin: "2027-08-31",
    });
  });

  it("paiement le dernier jour du mois : même fin que le 1er du mois", () => {
    expect(calculerPeriodeCotisation("2026-09-30").date_fin).toBe("2027-08-31");
  });

  it("29 février (année bissextile) → 31.01 de l'année suivante", () => {
    expect(calculerPeriodeCotisation("2024-02-29")).toEqual({
      date_debut: "2024-02-29",
      date_fin: "2025-01-31",
    });
  });

  it("mars d'une année dont l'année suivante est bissextile → 29.02", () => {
    expect(calculerPeriodeCotisation("2027-03-15").date_fin).toBe("2028-02-29");
  });

  it("31 décembre : le mois de référence est décembre → 30.11 de l'année suivante", () => {
    expect(calculerPeriodeCotisation("2026-12-31")).toEqual({
      date_debut: "2026-12-31",
      date_fin: "2027-11-30",
    });
  });

  it("renouvellement anticipé le jour même de l'échéance : enchaîne le lendemain", () => {
    expect(calculerPeriodeCotisation("2026-07-31", "2026-07-31")).toEqual({
      date_debut: "2026-08-01",
      date_fin: "2027-07-31",
    });
  });

  it("renouvellement anticipé long : paiement 6 mois avant l'échéance", () => {
    expect(calculerPeriodeCotisation("2026-02-10", "2026-07-31")).toEqual({
      date_debut: "2026-08-01",
      date_fin: "2027-07-31",
    });
  });

  it("renouvellement tardif après expiration : date_debut = date de paiement", () => {
    expect(calculerPeriodeCotisation("2026-09-15", "2026-07-31")).toEqual({
      date_debut: "2026-09-15",
      date_fin: "2027-08-31",
    });
  });

  it("renouvellement le lendemain de l'échéance : pas d'enchaînement, mais continuité", () => {
    expect(calculerPeriodeCotisation("2026-08-01", "2026-07-31")).toEqual({
      date_debut: "2026-08-01",
      date_fin: "2027-07-31",
    });
  });

  it("enchaînement franchissant l'année : fin 31.12 → début 01.01", () => {
    expect(calculerPeriodeCotisation("2025-11-05", "2025-12-31")).toEqual({
      date_debut: "2026-01-01",
      date_fin: "2026-12-31",
    });
  });

  it("finPrecedente absente ou nulle : ignorée", () => {
    expect(calculerPeriodeCotisation("2026-05-04", null).date_debut).toBe("2026-05-04");
    expect(calculerPeriodeCotisation("2026-05-04", undefined).date_debut).toBe("2026-05-04");
  });

  it("une date ISO avec heure est tolérée (troncature au jour)", () => {
    expect(calculerPeriodeCotisation("2026-08-11T10:30:00Z").date_fin).toBe("2027-07-31");
  });
});

describe("finDePeriode", () => {
  it("janvier reste dans l'année civile", () => {
    expect(finDePeriode("2025-01-01")).toBe("2025-12-31");
  });
  it("février → 31 janvier de l'année suivante", () => {
    expect(finDePeriode("2026-02-14")).toBe("2027-01-31");
  });
  it("la période dure toujours entre 12 mois - 1 jour et 13 mois - 1 jour", () => {
    for (let mois = 1; mois <= 12; mois++) {
      const debut = `2026-${String(mois).padStart(2, "0")}-01`;
      const fin = finDePeriode(debut);
      const jours = joursEntre(debut, fin);
      expect(jours).toBeGreaterThanOrEqual(364);
      expect(jours).toBeLessThanOrEqual(365);
    }
  });
});

describe("ajouterJoursISO / joursEntre", () => {
  it("franchit la fin de mois", () => {
    expect(ajouterJoursISO("2026-07-31", 1)).toBe("2026-08-01");
  });
  it("franchit la fin d'année", () => {
    expect(ajouterJoursISO("2025-12-31", 1)).toBe("2026-01-01");
  });
  it("gère le 29 février", () => {
    expect(ajouterJoursISO("2024-02-28", 1)).toBe("2024-02-29");
    expect(ajouterJoursISO("2025-02-28", 1)).toBe("2025-03-01");
  });
  it("compte les jours entre deux dates", () => {
    expect(joursEntre("2026-09-06", "2026-11-05")).toBe(60);
    expect(joursEntre("2026-09-06", "2026-09-06")).toBe(0);
    expect(joursEntre("2026-09-06", "2026-09-05")).toBe(-1);
  });
});

describe("cotisationEstActive", () => {
  const c = { date_debut: "2026-08-11", date_fin: "2027-07-31" };
  it("bornes incluses", () => {
    expect(cotisationEstActive(c, "2026-08-11")).toBe(true);
    expect(cotisationEstActive(c, "2027-07-31")).toBe(true);
  });
  it("hors période", () => {
    expect(cotisationEstActive(c, "2026-08-10")).toBe(false);
    expect(cotisationEstActive(c, "2027-08-01")).toBe(false);
  });
  it("période inconnue → inactive", () => {
    expect(cotisationEstActive({ date_debut: null, date_fin: null }, "2026-08-11")).toBe(false);
  });
});

describe("affichage de la période", () => {
  it("formatJJMMAAAA", () => {
    expect(formatJJMMAAAA("2026-01-01")).toBe("01.01.2026");
    expect(formatJJMMAAAA("2027-07-31")).toBe("31.07.2027");
    expect(formatJJMMAAAA(null)).toBe("—");
  });
  it("formatPeriodeCotisation", () => {
    expect(formatPeriodeCotisation("2026-01-01", "2026-12-31")).toBe("du 01.01.2026 au 31.12.2026");
    expect(formatPeriodeCotisation(null, "2026-12-31")).toBe("période inconnue");
  });
  it("ne décale pas la date selon le fuseau", () => {
    // Une date ISO est reformatée telle quelle, sans passer par Date().
    expect(formatJJMMAAAA("2026-01-01T23:30:00Z")).toBe("01.01.2026");
  });
});

describe("fenêtre de renouvellement (60 jours)", () => {
  const finDeValidite = "2026-12-31";
  const dansLaFenetre = (aujourdhui: string) =>
    joursEntre(aujourdhui, finDeValidite) <= JOURS_FENETRE_RENOUVELLEMENT;

  it("refusé tant qu'il reste plus de 60 jours", () => {
    expect(dansLaFenetre("2026-10-31")).toBe(false); // 61 jours restants
  });
  it("autorisé pile à 60 jours de l'échéance", () => {
    expect(dansLaFenetre("2026-11-01")).toBe(true); // 60 jours restants
  });
  it("autorisé le dernier jour de validité", () => {
    expect(dansLaFenetre("2026-12-31")).toBe(true);
  });
  it("autorisé après expiration", () => {
    expect(dansLaFenetre("2027-03-15")).toBe(true);
  });
});

describe("rappels du cron (lendemain de l'échéance, puis J+30)", () => {
  it("le rappel « échue » cible les cotisations finies la veille", () => {
    expect(ajouterJoursISO("2026-08-01", -1)).toBe("2026-07-31");
  });
  it("le rappel « un mois » cible les cotisations finies 30 jours plus tôt", () => {
    expect(ajouterJoursISO("2026-08-30", -30)).toBe("2026-07-31");
  });
  it("les deux fenêtres ne se recouvrent jamais", () => {
    const jour = "2026-09-06";
    expect(ajouterJoursISO(jour, -1)).not.toBe(ajouterJoursISO(jour, -30));
  });
});
