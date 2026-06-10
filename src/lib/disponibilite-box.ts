// Créneaux de transition (réutilisation d'un box le même jour) :
// - le matin, les arrivées/départs habituels se situent entre 9h et 10h
// - le soir, les arrivées/départs habituels se situent entre 17h et 18h
export const CRENEAU_MATIN: [string, string] = ["09:00", "10:00"];
export const CRENEAU_SOIR: [string, string] = ["17:00", "18:00"];

export type Periode = {
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

// Le départ et l'arrivée sont compatibles si le départ précède (ou est égal
// à) l'arrivée, ou si les deux tombent dans le même créneau habituel (matin
// ou soir) — auquel cas on ne se fie pas à la minute exacte.
function horairesCompatibles(heureDepart: string, heureArrivee: string): boolean {
  if (heureDepart <= heureArrivee) return true;

  return (
    (dansCreneau(heureDepart, CRENEAU_MATIN) && dansCreneau(heureArrivee, CRENEAU_MATIN)) ||
    (dansCreneau(heureDepart, CRENEAU_SOIR) && dansCreneau(heureArrivee, CRENEAU_SOIR))
  );
}

// Une transition (départ d'une occupation, arrivée d'une autre, le même jour)
// est autorisée seulement si l'arrivée n'est pas une 'journee' (garde à la
// journée, horaire d'arrivée non fiable) ET si les horaires sont compatibles.
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

/**
 * Détermine si une occupation existante de box est en conflit avec une
 * période demandée (nouvelle réservation).
 *
 * Si les deux périodes ne partagent qu'un seul jour (l'une se termine ce
 * jour-là — départ —, l'autre commence ce jour-là — arrivée), il n'y a pas de
 * conflit si l'arrivée n'est pas de type 'journee' et que les horaires de
 * départ/arrivée sont compatibles (voir transitionAutorisee). Si plus d'un
 * jour est partagé, ou si les conditions ne sont pas remplies (y compris en
 * cas d'horaire/type manquant), c'est un conflit normal.
 */
export function occupationEnConflit(occupation: Periode, nouvelle: Periode): boolean {
  const debutPartage = occupation.date_debut > nouvelle.date_debut ? occupation.date_debut : nouvelle.date_debut;
  const finPartagee = occupation.date_fin < nouvelle.date_fin ? occupation.date_fin : nouvelle.date_fin;

  if (debutPartage > finPartagee) return false; // pas de chevauchement
  if (debutPartage !== finPartagee) return true; // plus d'un jour partagé => conflit normal

  const jour = debutPartage;

  // L'occupation existante part ce jour-là, la nouvelle arrive ce jour-là
  if (occupation.date_fin === jour && nouvelle.date_debut === jour) {
    if (transitionAutorisee(
      { heure: occupation.heure_depart },
      { heure: nouvelle.heure_arrivee, type_reservation: nouvelle.type_reservation }
    )) {
      return false;
    }
  }

  // La nouvelle part ce jour-là, l'occupation existante arrive ce jour-là
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
