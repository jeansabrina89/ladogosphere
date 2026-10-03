/**
 * Règles pures des lignes de check-in — aucune dépendance à la base, donc
 * couvertes par des tests unitaires. La partie qui écrit vit dans
 * `lignesCheckin.ts`, sur le modèle comptaResaLogique / comptaResa.
 */

import { HORAIRES_DEFAUT, lireCreneaux } from "@/src/lib/horaires";

export type HeuresCheckin = { arrivee: string; depart: string };

/**
 * Les heures prévues quand la réservation n'en porte pas (APP 64) : le DÉBUT
 * du premier créneau « séjour » pour l'arrivée, le DÉBUT du dernier pour le
 * départ. Avec le réglage de départ, 09:00 et 17:00 — les heures d'avant.
 *
 * C'est la seule source de ces deux heures : le check-in, et les deux écrans
 * de modification qui remettaient « T09:00:00 » / « T17:00:00 » à la main.
 */
export function heuresCheckinParDefaut(
  sejour: string | null | undefined = HORAIRES_DEFAUT.sejour,
): HeuresCheckin {
  const creneaux = lireCreneaux(sejour) ?? lireCreneaux(HORAIRES_DEFAUT.sejour)!;
  return { arrivee: creneaux[0].debut, depart: creneaux[creneaux.length - 1].debut };
}

/** Les heures du réglage de départ, pour qui n'a pas de réglage sous la main. */
export const HEURE_ARRIVEE_DEFAUT = heuresCheckinParDefaut().arrivee;
export const HEURE_DEPART_DEFAUT = heuresCheckinParDefaut().depart;

/** Réservations qui n’ont pas à figurer au check-in. */
export const STATUTS_SANS_CHECKIN = ["annulee", "refusee"];

export type BornesCheckin = {
  date_arrivee_prevue: string;
  date_depart_prevu: string;
};

/**
 * Horodatages d’arrivée et de départ prévus : heures par défaut et
 * normalisation « HH:MM ». L’heure d’un essai forcé prime.
 */
export function bornesCheckin(resa: {
  date_debut: string;
  date_fin: string;
  heure_arrivee?: string | null;
  heure_depart?: string | null;
  essai_force_heure?: string | null;
}, defauts: HeuresCheckin = heuresCheckinParDefaut()): BornesCheckin {
  const heure = (valeur: string | null | undefined, defaut: string) => {
    const brut = (valeur ?? "").trim();
    return brut ? brut.slice(0, 5) : defaut;
  };

  const arrivee = heure(resa.essai_force_heure ?? resa.heure_arrivee, defauts.arrivee);
  const depart = heure(resa.heure_depart, defauts.depart);

  return {
    date_arrivee_prevue: `${resa.date_debut}T${arrivee}:00`,
    date_depart_prevu: `${resa.date_fin}T${depart}:00`,
  };
}

/** Chiens de la réservation qui n’ont pas encore de ligne de check-in. */
export function chiensSansLigne(
  chiensDeLaResa: string[],
  chiensDejaPointes: string[]
): string[] {
  const deja = new Set(chiensDejaPointes);
  // `Set` sur l’entrée : un même chien listé deux fois ne donne qu’une ligne.
  return [...new Set(chiensDeLaResa)].filter((id) => !deja.has(id));
}
