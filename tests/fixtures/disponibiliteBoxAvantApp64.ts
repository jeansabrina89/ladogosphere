/**
 * La règle des box AVANT APP 64, recopiée telle quelle du commit d52e5fd
 * (src/lib/disponibilite-box.ts), pour une seule raison : prouver que la règle
 * nouvelle, lue dans le réglage, rend EXACTEMENT les mêmes réponses avec les
 * horaires de départ. Ce fichier ne sert qu'à cette comparaison.
 */

const CRENEAU_MATIN: [string, string] = ["09:00", "10:00"];
const CRENEAU_SOIR: [string, string] = ["17:00", "18:00"];

export type PeriodeAvant = {
  date_debut: string;
  date_fin: string;
  heure_arrivee?: string | null;
  heure_depart?: string | null;
  type_reservation?: string | null;
};

function normaliserHeure(heure?: string | null): string | null {
  if (!heure) return null;
  return heure.slice(0, 5);
}

function dansCreneau(heure: string, creneau: [string, string]): boolean {
  return heure >= creneau[0] && heure <= creneau[1];
}

function horairesCompatibles(heureDepart: string, heureArrivee: string): boolean {
  if (heureDepart <= heureArrivee) return true;

  return (
    (dansCreneau(heureDepart, CRENEAU_MATIN) && dansCreneau(heureArrivee, CRENEAU_MATIN)) ||
    (dansCreneau(heureDepart, CRENEAU_SOIR) && dansCreneau(heureArrivee, CRENEAU_SOIR))
  );
}

function transitionAutorisee(
  depart: { heure?: string | null },
  arrivee: { heure?: string | null; type_reservation?: string | null }
): boolean {
  if (!arrivee.type_reservation || arrivee.type_reservation === "journee") return false;

  const heureDepart = normaliserHeure(depart.heure);
  const heureArrivee = normaliserHeure(arrivee.heure);
  if (!heureDepart || !heureArrivee) return false;

  return horairesCompatibles(heureDepart, heureArrivee);
}

export function occupationEnConflitAvant(occupation: PeriodeAvant, nouvelle: PeriodeAvant): boolean {
  const debutPartage = occupation.date_debut > nouvelle.date_debut ? occupation.date_debut : nouvelle.date_debut;
  const finPartagee = occupation.date_fin < nouvelle.date_fin ? occupation.date_fin : nouvelle.date_fin;

  if (debutPartage > finPartagee) return false;
  if (debutPartage !== finPartagee) return true;

  const jour = debutPartage;

  if (occupation.date_fin === jour && nouvelle.date_debut === jour) {
    if (transitionAutorisee(
      { heure: occupation.heure_depart },
      { heure: nouvelle.heure_arrivee, type_reservation: nouvelle.type_reservation }
    )) {
      return false;
    }
  }

  if (nouvelle.date_fin === jour && occupation.date_debut === jour) {
    if (transitionAutorisee(
      { heure: nouvelle.heure_depart },
      { heure: occupation.heure_arrivee, type_reservation: occupation.type_reservation }
    )) {
      return false;
    }
  }

  return true;
}
