import { describe, it, expect } from "vitest";
import {
  COMPTE_LOYER_REFACTURE,
  COMPTE_PRESTATIONS,
  bornesDuMois,
  factureMensuelleLocataire,
  libelleMois,
  proratLoyer,
  totalIndicatifFormule,
  type TacheAFacturer,
} from "@/src/lib/factureLocataireLogique";
import {
  adhesionExigee,
  catalogueVisible,
  estGarde,
  reglagesDepuisParametres,
  refusAnnulation,
  tacheFacturable,
} from "@/src/lib/prestationsLogique";

const tache = (p: Partial<TacheAFacturer> & { id: string }): TacheAFacturer => ({
  prestation_id: "p1",
  nom: "Passage",
  statut: "faite",
  facturable: true,
  prix_fige: 12,
  taux_tva: 8.1,
  date: "2026-09-03",
  ...p,
});

describe("le mois", () => {
  it("connaît ses bornes et ses jours", () => {
    expect(bornesDuMois("2026-09")).toEqual({
      debut: "2026-09-01", fin: "2026-09-30", jours: 30,
    });
    expect(bornesDuMois("2026-02").jours).toBe(28);
    expect(bornesDuMois("2028-02").jours).toBe(29);
  });

  it("se dit en français", () => {
    expect(libelleMois("2026-09")).toBe("septembre 2026");
  });
});

describe("la facture mensuelle", () => {
  it("porte le forfait au prix figé, sur 3020", () => {
    const f = factureMensuelleLocataire({
      mois: "2026-09",
      forfait: { nom: "Formule confort", prix: 180, taux_tva: 8.1 },
      taches: [],
    });
    expect(f.lignes).toHaveLength(1);
    expect(f.lignes[0]).toMatchObject({
      libelle: "Formule confort — septembre 2026",
      quantite: 1, montant: 180, compte_produit: COMPTE_PRESTATIONS,
    });
    expect(f.total).toBe(180);
  });

  it("groupe les prestations à l’acte par type, avec leur quantité", () => {
    const f = factureMensuelleLocataire({
      mois: "2026-09",
      taches: [
        tache({ id: "a" }), tache({ id: "b" }), tache({ id: "c" }),
        tache({ id: "d", prestation_id: "p2", nom: "Balade", prix_fige: 25 }),
      ],
    });
    expect(f.lignes.map((l) => [l.libelle, l.quantite, l.montant])).toEqual([
      ["Passage", 3, 36], ["Balade", 1, 25],
    ]);
    expect(f.total).toBe(61);
  });

  it("ne facture pas ce qui n’a pas été fait", () => {
    const f = factureMensuelleLocataire({
      mois: "2026-09",
      taches: [tache({ id: "a" }), tache({ id: "b", statut: "a_faire" })],
    });
    expect(f.lignes[0].quantite).toBe(1);
    expect(f.total).toBe(12);
  });

  it("sort une tâche annulée du décompte et garde son motif en note", () => {
    const f = factureMensuelleLocataire({
      mois: "2026-09",
      taches: [
        tache({ id: "a" }),
        tache({ id: "b", statut: "annulee", motif_annulation: "Locataire présent ce jour-là" }),
      ],
    });
    expect(f.total).toBe(12);
    expect(f.notes).toEqual([
      "2026-09-03 — Passage non faite : Locataire présent ce jour-là.",
    ]);
  });

  it("une tâche de forfait n’est pas refacturée à l’acte", () => {
    const f = factureMensuelleLocataire({
      mois: "2026-09",
      forfait: { nom: "Formule confort", prix: 180, taux_tva: 8.1 },
      taches: [tache({ id: "a", facturable: false })],
    });
    expect(f.lignes).toHaveLength(1);
    expect(f.total).toBe(180);
  });

  it("deux prix différents pour la même prestation font deux lignes", () => {
    const f = factureMensuelleLocataire({
      mois: "2026-09",
      taches: [tache({ id: "a" }), tache({ id: "b", prix_fige: 15 })],
    });
    expect(f.lignes.map((l) => l.prix_unitaire)).toEqual([12, 15]);
  });
});

describe("le loyer refacturé", () => {
  const loyer = { montant: 300, taux_tva: 8.1, depuis: "2020-01-01" };

  it("sort sur 3021, jamais fondu dans les prestations", () => {
    const f = factureMensuelleLocataire({
      mois: "2026-09",
      forfait: { nom: "Formule confort", prix: 180, taux_tva: 8.1 },
      taches: [tache({ id: "a" })],
      loyer,
    });
    const comptes = f.lignes.map((l) => l.compte_produit);
    expect(comptes).toEqual([COMPTE_PRESTATIONS, COMPTE_PRESTATIONS, COMPTE_LOYER_REFACTURE]);
    expect(f.lignes.at(-1)).toMatchObject({
      libelle: "Loyer du box — septembre 2026", montant: 300,
    });
    expect(COMPTE_LOYER_REFACTURE).not.toBe(COMPTE_PRESTATIONS);
  });

  it("un mois entier ne subit aucun prorata", () => {
    const f = factureMensuelleLocataire({ mois: "2026-09", taches: [], loyer });
    expect(f.proratLoyer).toEqual({ jours: 30, joursDuMois: 30, complet: true });
    expect(f.lignes[0].montant).toBe(300);
  });

  it("jours réels sur jours du mois : un départ le 10 paie 10/30", () => {
    const f = factureMensuelleLocataire({
      mois: "2026-09", taches: [],
      loyer: { ...loyer, jusquAu: "2026-09-10" },
    });
    expect(f.proratLoyer).toMatchObject({ jours: 10, joursDuMois: 30, complet: false });
    expect(f.lignes[0].montant).toBe(100);
    expect(f.lignes[0].libelle).toBe("Loyer du box — septembre 2026 (10 jour(s) sur 30)");
  });

  it("une arrivée en cours de mois compte à partir de son jour", () => {
    expect(proratLoyer({ mois: "2026-09", depuis: "2026-09-16" }))
      .toEqual({ jours: 15, joursDuMois: 30, complet: false });
  });

  it("un locataire parti avant le mois ne porte aucune ligne", () => {
    const f = factureMensuelleLocataire({
      mois: "2026-09", taches: [],
      loyer: { ...loyer, jusquAu: "2026-08-31" },
    });
    expect(f.lignes).toEqual([]);
    expect(f.total).toBe(0);
  });

  it("n’est jamais déduit pour absence, contrairement au forfait", () => {
    const f = factureMensuelleLocataire({
      mois: "2026-09",
      forfait: { nom: "Formule", prix: 300, taux_tva: 8.1 },
      taches: [], loyer,
      absenceDeduite: true, joursAbsence: 15,
    });
    expect(f.lignes[0].montant).toBe(150); // le forfait suit l'absence
    expect(f.lignes[1].montant).toBe(300); // le loyer, non
  });

  it("sans montant saisi, aucune ligne de loyer : rien n’est deviné", () => {
    const f = factureMensuelleLocataire({ mois: "2026-09", taches: [], loyer: { montant: null, taux_tva: 8.1 } });
    expect(f.lignes).toEqual([]);
    expect(f.proratLoyer).toBeNull();
  });
});

describe("le forfait et les absences", () => {
  it("n’est pas déduit tant que le réglage ne le dit pas", () => {
    const f = factureMensuelleLocataire({
      mois: "2026-09",
      forfait: { nom: "Formule", prix: 300, taux_tva: 8.1 },
      taches: [], joursAbsence: 10,
    });
    expect(f.lignes[0].montant).toBe(300);
    expect(f.notes).toEqual([]);
  });

  it("se déduit au prorata quand le réglage le dit, et le dit en note", () => {
    const f = factureMensuelleLocataire({
      mois: "2026-09",
      forfait: { nom: "Formule", prix: 300, taux_tva: 8.1 },
      taches: [], absenceDeduite: true, joursAbsence: 10,
    });
    expect(f.lignes[0].montant).toBe(200);
    expect(f.notes[0]).toContain("10 jour(s) d'absence sur 30");
  });
});

describe("le total indicatif d’une formule", () => {
  it("aide à composer sans rien imposer", () => {
    expect(totalIndicatifFormule([
      { quantite_par_semaine: 2, prix: 20 },
      { quantite_par_semaine: 7, prix: 12 },
    ])).toEqual({ parSemaine: 124, parMois: 537.33 });
  });

  it("rend zéro sur une formule vide, pas NaN", () => {
    expect(totalIndicatifFormule([])).toEqual({ parSemaine: 0, parMois: 0 });
  });
});

describe("qui voit le catalogue", () => {
  it("seul le locataire de box", () => {
    expect(catalogueVisible({ locataire_box: true })).toBe(true);
    expect(catalogueVisible({ locataire_box: false })).toBe(false);
    expect(catalogueVisible({})).toBe(false);
    expect(catalogueVisible(null)).toBe(false);
  });

  it("un client de la pension ne l’ouvre pas, même membre", () => {
    expect(catalogueVisible({ locataire_box: false } as never)).toBe(false);
  });

  it("et un locataire ne doit aucune adhésion", () => {
    expect(adhesionExigee({ locataire_box: true })).toBe(false);
    expect(adhesionExigee({ locataire_box: false })).toBe(true);
  });
});

describe("les gestes du terrain", () => {
  it("la garde complète est la seule unité de 24 h", () => {
    expect(estGarde("journee")).toBe(true);
    for (const u of ["passage", "repas", "nettoyage", "balade", "autre"]) {
      expect(estGarde(u)).toBe(false);
    }
  });

  it("annuler exige un motif : c’est lui qui sort la ligne de la facture", () => {
    expect(refusAnnulation("")).not.toBeNull();
    expect(refusAnnulation("   ")).not.toBeNull();
    expect(refusAnnulation("Locataire présent")).toBeNull();
  });

  it("seule une tâche faite et facturable entre au décompte", () => {
    expect(tacheFacturable({ statut: "faite", facturable: true })).toBe(true);
    expect(tacheFacturable({ statut: "faite", facturable: false })).toBe(false);
    expect(tacheFacturable({ statut: "a_faire", facturable: true })).toBe(false);
    expect(tacheFacturable({ statut: "annulee", facturable: true })).toBe(false);
  });
});

describe("les trois réglages non tranchés", () => {
  it("ont les valeurs par défaut annoncées", () => {
    expect(reglagesDepuisParametres([])).toEqual({
      forfaitEcheance: "terme_echu", absenceDeduite: false, commandeLocataire: true,
    });
  });

  it("se lisent depuis parametres", () => {
    expect(reglagesDepuisParametres([
      { cle: "prestations_forfait_echeance", valeur: "avance" },
      { cle: "prestations_absence_deduite", valeur: "oui" },
      { cle: "prestations_commande_locataire", valeur: "non" },
    ])).toEqual({
      forfaitEcheance: "avance", absenceDeduite: true, commandeLocataire: false,
    });
  });
});
