// Créneau de transition du soir : un box peut être réutilisé le même jour si
// l'occupation qui part le fait avant CRENEAU_SOIR_FIN et celle qui arrive le
// fait après CRENEAU_SOIR_DEBUT.
export const CRENEAU_SOIR_DEBUT = "17:00";
export const CRENEAU_SOIR_FIN = "18:00";

export type Periode = {
  date_debut: string;
  date_fin: string;
  heure_arrivee?: string | null;
  heure_depart?: string | null;
};

function normaliserHeure(heure?: string | null): string | null {
  if (!heure) return null;
  return heure.slice(0, 5);
}

/**
 * Détermine si une occupation existante de box est en conflit avec une période
 * demandée (nouvelle réservation), en tenant compte de l'exception de
 * transition du soir : si les deux périodes ne partagent qu'un seul jour (l'une
 * se termine ce jour-là, l'autre commence ce jour-là) et que les horaires
 * permettent une transition (départ <= CRENEAU_SOIR_FIN et arrivée >=
 * CRENEAU_SOIR_DEBUT), il n'y a pas de conflit.
 */
export function occupationEnConflit(occupation: Periode, nouvelle: Periode): boolean {
  const debutPartage = occupation.date_debut > nouvelle.date_debut ? occupation.date_debut : nouvelle.date_debut;
  const finPartagee = occupation.date_fin < nouvelle.date_fin ? occupation.date_fin : nouvelle.date_fin;

  if (debutPartage > finPartagee) return false; // pas de chevauchement
  if (debutPartage !== finPartagee) return true; // plus d'un jour partagé => conflit normal

  const jour = debutPartage;
  const heureDepartOcc = normaliserHeure(occupation.heure_depart);
  const heureArriveeOcc = normaliserHeure(occupation.heure_arrivee);
  const heureDepartNouvelle = normaliserHeure(nouvelle.heure_depart);
  const heureArriveeNouvelle = normaliserHeure(nouvelle.heure_arrivee);

  // L'occupation existante part ce jour-là, la nouvelle arrive ce jour-là
  if (occupation.date_fin === jour && nouvelle.date_debut === jour) {
    if (
      heureDepartOcc && heureArriveeNouvelle &&
      heureDepartOcc <= CRENEAU_SOIR_FIN && heureArriveeNouvelle >= CRENEAU_SOIR_DEBUT
    ) {
      return false;
    }
  }

  // La nouvelle part ce jour-là, l'occupation existante arrive ce jour-là
  if (nouvelle.date_fin === jour && occupation.date_debut === jour) {
    if (
      heureDepartNouvelle && heureArriveeOcc &&
      heureDepartNouvelle <= CRENEAU_SOIR_FIN && heureArriveeOcc >= CRENEAU_SOIR_DEBUT
    ) {
      return false;
    }
  }

  return true;
}
