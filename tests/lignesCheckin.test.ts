import { describe, it, expect } from "vitest";
import {
  bornesCheckin,
  chiensSansLigne,
  HEURE_ARRIVEE_DEFAUT,
  HEURE_DEPART_DEFAUT,
} from "@/src/lib/lignesCheckinLogique";

describe("bornesCheckin", () => {
  it("compose les horodatages à partir des heures saisies", () => {
    expect(
      bornesCheckin({
        date_debut: "2026-09-10",
        date_fin: "2026-09-12",
        heure_arrivee: "08:30",
        heure_depart: "18:15",
      })
    ).toEqual({
      date_arrivee_prevue: "2026-09-10T08:30:00",
      date_depart_prevu: "2026-09-12T18:15:00",
    });
  });

  it("retombe sur les heures par défaut quand rien n'est saisi", () => {
    expect(bornesCheckin({ date_debut: "2026-09-10", date_fin: "2026-09-10" })).toEqual({
      date_arrivee_prevue: `2026-09-10T${HEURE_ARRIVEE_DEFAUT}:00`,
      date_depart_prevu: `2026-09-10T${HEURE_DEPART_DEFAUT}:00`,
    });
  });

  it("traite une heure vide comme absente", () => {
    const b = bornesCheckin({
      date_debut: "2026-09-10",
      date_fin: "2026-09-10",
      heure_arrivee: "   ",
      heure_depart: "",
    });
    expect(b.date_arrivee_prevue).toBe(`2026-09-10T${HEURE_ARRIVEE_DEFAUT}:00`);
    expect(b.date_depart_prevu).toBe(`2026-09-10T${HEURE_DEPART_DEFAUT}:00`);
  });

  it("normalise une heure au format HH:MM:SS", () => {
    const b = bornesCheckin({
      date_debut: "2026-09-10",
      date_fin: "2026-09-10",
      heure_arrivee: "09:30:00",
      heure_depart: "17:45:00",
    });
    expect(b.date_arrivee_prevue).toBe("2026-09-10T09:30:00");
    expect(b.date_depart_prevu).toBe("2026-09-10T17:45:00");
  });

  it("l'heure d'un essai forcé prime sur l'heure d'arrivée", () => {
    const b = bornesCheckin({
      date_debut: "2026-09-10",
      date_fin: "2026-09-10",
      heure_arrivee: "09:00",
      essai_force_heure: "10:30",
    });
    expect(b.date_arrivee_prevue).toBe("2026-09-10T10:30:00");
  });
});

describe("chiensSansLigne", () => {
  it("renvoie tous les chiens quand aucune ligne n'existe", () => {
    expect(chiensSansLigne(["a", "b"], [])).toEqual(["a", "b"]);
  });

  it("ne renvoie rien quand tout est déjà pointé — idempotence", () => {
    expect(chiensSansLigne(["a", "b"], ["b", "a"])).toEqual([]);
  });

  it("ne renvoie que le chien ajouté après coup", () => {
    expect(chiensSansLigne(["a", "b", "c"], ["a", "c"])).toEqual(["b"]);
  });

  it("ne crée qu'une ligne pour un chien listé deux fois", () => {
    expect(chiensSansLigne(["a", "a", "b"], [])).toEqual(["a", "b"]);
  });

  it("ignore une ligne existante pour un chien retiré de la réservation", () => {
    expect(chiensSansLigne(["a"], ["a", "z"])).toEqual([]);
  });
});
