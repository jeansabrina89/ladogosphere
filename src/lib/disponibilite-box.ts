import { HORAIRES_DEFAUT, lireCreneaux, type Creneau } from "@/src/lib/horaires";

/**
 * Créneaux de transition (réutilisation d'un box le même jour).
 *
 * Ce sont ceux du réglage « Séjour — arrivée et départ » (Réglages →
 * Entreprise → Horaires d'accueil, APP 64) : un séjour arrive et part dans ces
 * créneaux-là, et c'est là qu'un box se libère et se reprend le même jour.
 * Avec le réglage de départ, ce sont le matin et le soir d'avant ce lot.
 *
 * Les fonctions restent PURES : les créneaux sont un paramètre. L'appelant lit
 * les horaires une fois (`lireHoraires`) et les passe ; sans rien, ce sont
 * ceux de `HORAIRES_DEFAUT`.
 */
export function creneauxTransition(sejour: string | null | undefined = HORAIRES_DEFAUT.sejour): Creneau[] {
  return lireCreneaux(sejour) ?? lireCreneaux(HORAIRES_DEFAUT.sejour) ?? [];
}

const CRENEAUX_DEFAUT = creneauxTransition();

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

function dansCreneau(heure: string, creneau: Creneau): boolean {
  return heure >= creneau.debut && heure <= creneau.fin;
}

// Le départ et l'arrivée sont compatibles si le départ précède (ou est égal
// à) l'arrivée, ou si les deux tombent dans le MÊME créneau de la liste —
// auquel cas on ne se fie pas à la minute exacte. Le nombre de créneaux est
// celui du réglage : deux aujourd'hui (matin et soir), un ou trois demain.
export function horairesCompatibles(
  heureDepart: string,
  heureArrivee: string,
  creneaux: Creneau[] = CRENEAUX_DEFAUT,
): boolean {
  if (heureDepart <= heureArrivee) return true;
  return creneaux.some((c) => dansCreneau(heureDepart, c) && dansCreneau(heureArrivee, c));
}

// Une transition (départ d'une occupation, arrivée d'une autre, le même jour)
// est autorisée seulement si l'arrivée n'est pas une 'journee' (garde à la
// journée, horaire d'arrivée non fiable) ET si les horaires sont compatibles.
function transitionAutorisee(
  depart: { heure?: string | null },
  arrivee: { heure?: string | null; type_reservation?: string | null },
  creneaux: Creneau[],
): boolean {
  if (!arrivee.type_reservation || arrivee.type_reservation === "journee") return false;

  const heureDepart = normaliserHeure(depart.heure);
  const heureArrivee = normaliserHeure(arrivee.heure);
  if (!heureDepart || !heureArrivee) return false;

  return horairesCompatibles(heureDepart, heureArrivee, creneaux);
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
/**
 * Détermine si un box reste utilisable pour un placement donné, compte tenu
 * de la règle d'exclusivité d'un chien "doit être isolé" :
 * - un box déjà occupé par un chien isolé (sur la période demandée) est
 *   indisponible pour tout autre chien ;
 * - un chien isolé ne peut aller que dans un box totalement vide sur ses
 *   dates (occupantIsole exclu d'office par le premier cas).
 */
export function boxCompatibleAvecIsolement(
  occupantIsole: boolean,
  nbOccupants: number,
  placementIsole: boolean
): boolean {
  if (occupantIsole) return false;
  if (placementIsole && nbOccupants > 0) return false;
  return true;
}

/**
 * « Même famille » = même propriétaire = même client_id (les deux définis et
 * identiques). Les chiens d'une même famille vivent déjà ensemble : entre
 * eux, les contrôles de compatibilité taille/sexe sont ignorés et ils sont
 * placés ensemble dans le même box (sauf chien "doit être isolé").
 */
export function memeFamille(
  clientIdA?: string | null,
  clientIdB?: string | null
): boolean {
  return !!clientIdA && !!clientIdB && clientIdA === clientIdB;
}

/**
 * Capacité maximale d'un box pour regrouper des chiens d'une même famille :
 * jusqu'à 3 chiens, ou 4 si tous les chiens concernés sont de petit gabarit
 * (< 15 kg).
 */
export function capaciteMaxFamille(
  categoriesPoids: (string | null | undefined)[]
): number {
  const tousPetits =
    categoriesPoids.length > 0 &&
    categoriesPoids.every(c => c === "moins_15kg");
  return tousPetits ? 4 : 3;
}

export function occupationEnConflit(
  occupation: Periode,
  nouvelle: Periode,
  creneaux: Creneau[] = CRENEAUX_DEFAUT,
): boolean {
  const debutPartage = occupation.date_debut > nouvelle.date_debut ? occupation.date_debut : nouvelle.date_debut;
  const finPartagee = occupation.date_fin < nouvelle.date_fin ? occupation.date_fin : nouvelle.date_fin;

  if (debutPartage > finPartagee) return false; // pas de chevauchement
  if (debutPartage !== finPartagee) return true; // plus d'un jour partagé => conflit normal

  const jour = debutPartage;

  // L'occupation existante part ce jour-là, la nouvelle arrive ce jour-là
  if (occupation.date_fin === jour && nouvelle.date_debut === jour) {
    if (transitionAutorisee(
      { heure: occupation.heure_depart },
      { heure: nouvelle.heure_arrivee, type_reservation: nouvelle.type_reservation },
      creneaux,
    )) {
      return false;
    }
  }

  // La nouvelle part ce jour-là, l'occupation existante arrive ce jour-là
  if (nouvelle.date_fin === jour && occupation.date_debut === jour) {
    if (transitionAutorisee(
      { heure: nouvelle.heure_depart },
      { heure: occupation.heure_arrivee, type_reservation: occupation.type_reservation },
      creneaux,
    )) {
      return false;
    }
  }

  return true;
}
