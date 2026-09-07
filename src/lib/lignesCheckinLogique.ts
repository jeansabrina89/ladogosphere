/**
 * Règles pures des lignes de check-in — aucune dépendance à la base, donc
 * couvertes par des tests unitaires. La partie qui écrit vit dans
 * `lignesCheckin.ts`, sur le modèle comptaResaLogique / comptaResa.
 */

export const HEURE_ARRIVEE_DEFAUT = "09:00";
export const HEURE_DEPART_DEFAUT = "17:00";

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
}): BornesCheckin {
  const heure = (valeur: string | null | undefined, defaut: string) => {
    const brut = (valeur ?? "").trim();
    return brut ? brut.slice(0, 5) : defaut;
  };

  const arrivee = heure(resa.essai_force_heure ?? resa.heure_arrivee, HEURE_ARRIVEE_DEFAUT);
  const depart = heure(resa.heure_depart, HEURE_DEPART_DEFAUT);

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
