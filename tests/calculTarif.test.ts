import { describe, it, expect } from "vitest";
import { resoudrePrixUnitaire, compterSejour, calculerMontant } from "../src/lib/calculTarif";

const TARIFS = [
  { categorie: "sejour_partage_1",  membre: false, prix: "35" },
  { categorie: "sejour_partage_1",  membre: true,  prix: "30" },
  { categorie: "sejour_partage_2",  membre: false, prix: "55" },
  { categorie: "sejour_partage_2",  membre: true,  prix: "48" },
  { categorie: "journee_partage_1", membre: false, prix: "20" },
  { categorie: "journee_partage_1", membre: true,  prix: "18" },
  { categorie: "sejour_privatif",   membre: false, prix: "80" },
  { categorie: "sejour_privatif",   membre: true,  prix: "80" },
  { categorie: "urgence_partage_1", membre: true,  prix: "45" },
];

describe("resoudrePrixUnitaire", () => {
  it("séjour, 1 chien, non-membre → séjour_partage_1 non-membre", () => {
    expect(resoudrePrixUnitaire({
      tarifs: TARIFS, type_reservation: "sejour", nb_chiens: 1,
      est_membre: false, est_urgence: false, est_privatif: false,
    })).toBe(35);
  });

  it("séjour, 1 chien, membre → séjour_partage_1 membre", () => {
    expect(resoudrePrixUnitaire({
      tarifs: TARIFS, type_reservation: "sejour", nb_chiens: 1,
      est_membre: true, est_urgence: false, est_privatif: false,
    })).toBe(30);
  });

  it("séjour, 2 chiens, non-membre → séjour_partage_2", () => {
    expect(resoudrePrixUnitaire({
      tarifs: TARIFS, type_reservation: "sejour", nb_chiens: 2,
      est_membre: false, est_urgence: false, est_privatif: false,
    })).toBe(55);
  });

  it("privatif → sejour_privatif", () => {
    expect(resoudrePrixUnitaire({
      tarifs: TARIFS, type_reservation: "sejour", nb_chiens: 1,
      est_membre: false, est_urgence: false, est_privatif: true,
    })).toBe(80);
  });

  it("urgence + membre → urgence_partage_1", () => {
    expect(resoudrePrixUnitaire({
      tarifs: TARIFS, type_reservation: "sejour", nb_chiens: 1,
      est_membre: true, est_urgence: true, est_privatif: false,
    })).toBe(45);
  });

  it("catégorie absente → 0", () => {
    expect(resoudrePrixUnitaire({
      tarifs: TARIFS, type_reservation: "sejour", nb_chiens: 4, // palier 3
      est_membre: false, est_urgence: false, est_privatif: false,
    })).toBe(0); // "sejour_partage_3" absent des tarifs de test
  });
});

describe("compterSejour", () => {
  it("2 nuits sans heures → supplement 0", () => {
    expect(compterSejour({ date_debut: "2025-01-01", date_fin: "2025-01-03" }))
      .toEqual({ nb_nuits: 2, supplement_journee: 0 });
  });

  it("arrivée matin (09:00) + départ soir (17:00) → supplement 1", () => {
    expect(compterSejour({
      date_debut: "2025-01-01", date_fin: "2025-01-03",
      heure_arrivee: "09:00", heure_depart: "17:00",
    })).toEqual({ nb_nuits: 2, supplement_journee: 1 });
  });

  it("arrivée soir + départ soir → supplement 0", () => {
    expect(compterSejour({
      date_debut: "2025-01-01", date_fin: "2025-01-03",
      heure_arrivee: "14:00", heure_depart: "17:00",
    })).toEqual({ nb_nuits: 2, supplement_journee: 0 });
  });

  it("arrivée matin + départ matin → supplement 0", () => {
    expect(compterSejour({
      date_debut: "2025-01-01", date_fin: "2025-01-03",
      heure_arrivee: "09:00", heure_depart: "11:00",
    })).toEqual({ nb_nuits: 2, supplement_journee: 0 });
  });

  it("même jour → 0 nuits", () => {
    expect(compterSejour({ date_debut: "2025-01-05", date_fin: "2025-01-05" }))
      .toMatchObject({ nb_nuits: 0 });
  });
});

describe("calculerMontant", () => {
  const base = { tarifs: TARIFS, nb_chiens: 1, est_membre: false, est_urgence: false, est_privatif: false };

  it("séjour 2 nuits sans supplement = 2 × prix unitaire", () => {
    expect(calculerMontant({
      ...base, type_reservation: "sejour",
      date_debut: "2025-01-01", date_fin: "2025-01-03",
    })).toBe(70); // 2 × 35
  });

  it("séjour 2 nuits + supplement journée = 2 × nuit + 1 × journée", () => {
    expect(calculerMontant({
      ...base, type_reservation: "sejour",
      date_debut: "2025-01-01", date_fin: "2025-01-03",
      heure_arrivee: "09:00", heure_depart: "17:00",
    })).toBe(90); // 2×35 + 1×20
  });

  it("journée → prix unitaire seul (indépendant de la durée)", () => {
    expect(calculerMontant({
      ...base, type_reservation: "journee",
      date_debut: "2025-01-01", date_fin: "2025-01-03",
    })).toBe(20);
  });

  it("essai → tarif journée membre quel que soit est_membre", () => {
    expect(calculerMontant({
      ...base, type_reservation: "essai",
      date_debut: "2025-01-01", date_fin: "2025-01-01",
    })).toBe(18); // journée membre
  });

  it("membre réduit le prix séjour", () => {
    expect(calculerMontant({
      ...base, est_membre: true, type_reservation: "sejour",
      date_debut: "2025-01-01", date_fin: "2025-01-02",
    })).toBe(30); // 1 × 30 (tarif membre)
  });
});
