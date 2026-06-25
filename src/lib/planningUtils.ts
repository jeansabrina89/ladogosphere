export const HEURES_JOURNEE_PLEINE = 8.5;
export const JOURS_PLEIN_TEMPS = 5;
export const HEURES_HEBDO_PLEIN = HEURES_JOURNEE_PLEINE * JOURS_PLEIN_TEMPS; // 42.5

/**
 * Nombre de jours travaillés pour un employé durant une semaine donnée.
 *
 * base = taux / 20 :
 *   100→5, 80→4, 60→3, 40→2  (entier, constant chaque semaine)
 *   90→4.5, 70→3.5, 50→2.5, 30→1.5  (.5 → plancher/plafond selon parité)
 *
 * Pour les taux « à la demie », la moyenne sur deux semaines = base exacte.
 * Ex. 50% : semaine paire→2j, semaine impaire→3j, moyenne=2.5
 */
export function joursTravaillesSemaine(taux: number, indexSemaine: number): number {
  const base = taux / 20;
  if (Number.isInteger(base)) return base;
  // base se termine par .5 : alterner plancher/plafond
  return indexSemaine % 2 === 0 ? Math.floor(base) : Math.ceil(base);
}

/**
 * Moyenne des jours travaillés par semaine (pour le calcul du coût des vacances,
 * indépendamment de l'index de semaine).
 */
export function moyenneJoursTravaillesSemaine(taux: number): number {
  return taux / 20;
}

/**
 * Décompte théorique de jours travaillés sur la plage [dateDebut, dateFin].
 *
 * Utilise le même index de semaine global (continu depuis lundi 2024-01-01) que
 * le générateur de planning. Pour chaque semaine calendaire Mon→Dim couvrant la
 * plage, ajoute min(joursTravaillesSemaine, nb de jours de cette semaine inclus
 * dans la plage). Idéal pour estimer le coût d'une demande de vacances avant que
 * le planning soit généré.
 */
export function joursVacancesTheoriques(taux: number, dateDebut: string, dateFin: string): number {
  const lundiRef = new Date(2024, 0, 1, 12, 0, 0); // 2024-01-01 = lundi de référence
  const debut = new Date(dateDebut + 'T12:00:00');
  const fin   = new Date(dateFin   + 'T12:00:00');

  // Trouver le lundi de la semaine contenant debut
  const jourDebut = debut.getDay(); // 0=dim, 1=lun, …, 6=sam
  const offsetLundi = jourDebut === 0 ? -6 : 1 - jourDebut;
  const lundiCourant = new Date(debut);
  lundiCourant.setDate(debut.getDate() + offsetLundi);
  lundiCourant.setHours(12, 0, 0, 0);

  const MS_JOUR    = 24 * 60 * 60 * 1000;
  const MS_SEMAINE = 7 * MS_JOUR;
  let total = 0;

  while (lundiCourant <= fin) {
    const dimanche = new Date(lundiCourant);
    dimanche.setDate(lundiCourant.getDate() + 6);

    // Index global identique à celui du générateur
    const idxCal = Math.round((lundiCourant.getTime() - lundiRef.getTime()) / MS_SEMAINE);

    // Intersection de la semaine avec [debut, fin]
    const debutOverlap = lundiCourant > debut ? lundiCourant : debut;
    const finOverlap   = dimanche    < fin    ? dimanche    : fin;
    const joursCalendaires = Math.round((finOverlap.getTime() - debutOverlap.getTime()) / MS_JOUR) + 1;

    total += Math.min(joursTravaillesSemaine(taux, idxCal), joursCalendaires);

    lundiCourant.setDate(lundiCourant.getDate() + 7);
  }

  return total;
}

/**
 * Reequilibrage CFC : garantit qu'une gardienne CFC est presente le plus de jours
 * possible SANS changer le nombre de jours de chaque personne (echange = respect
 * du taux). Pour chaque jour du mois sans CFC, on deplace une CFC depuis un de ses
 * jours redondants (jour encore couvert par une autre CFC, ou jour hors du mois)
 * vers le jour decouvert. Limite de jours consecutifs respectee. Les jours qui
 * restent sans CFC (capacite insuffisante) ne sont pas forces.
 */
export function reequilibrerCfc(args: {
  semaine: string[];
  estDansMois: (d: string) => boolean;
  cfcIds: string[];
  travail: Record<string, Set<string>>;
  estIndispo: (id: string, d: string) => boolean;
  estEnVacances: (id: string, d: string) => boolean;
  limiteConsecutive: (id: string) => number;
  carryIn: (id: string) => number;
}): Record<string, Set<string>> {
  const { semaine, estDansMois, cfcIds, estIndispo, estEnVacances, limiteConsecutive, carryIn } = args;

  const travail: Record<string, Set<string>> = {};
  Object.keys(args.travail).forEach(id => { travail[id] = new Set(args.travail[id]); });

  const presentCfc = (id: string, d: string) =>
    !!travail[id] && travail[id].has(d) && !estEnVacances(id, d) && !estIndispo(id, d);
  const jourCouvert = (d: string) => cfcIds.some(id => presentCfc(id, d));

  const maxSerie = (id: string): number => {
    let streak = carryIn(id);
    let maxS = streak;
    for (const d of semaine) {
      if (travail[id] && travail[id].has(d) && !estIndispo(id, d)) {
        streak++;
        if (streak > maxS) maxS = streak;
      } else {
        streak = 0;
      }
    }
    return maxS;
  };

  for (const jour of semaine) {
    if (!estDansMois(jour) || jourCouvert(jour)) continue;

    for (const cfc of cfcIds) {
      if (!travail[cfc]) continue;
      if (estIndispo(cfc, jour) || estEnVacances(cfc, jour) || travail[cfc].has(jour)) continue;

      const donneurs = [...travail[cfc]]
        .filter(d2 => d2 !== jour)
        .filter(d2 => {
          if (!estDansMois(d2)) return true;
          return cfcIds.some(autre => autre !== cfc && presentCfc(autre, d2));
        })
        .sort((a, b) => (estDansMois(a) ? 1 : 0) - (estDansMois(b) ? 1 : 0));

      let fait = false;
      for (const d2 of donneurs) {
        travail[cfc].delete(d2);
        travail[cfc].add(jour);
        if (maxSerie(cfc) <= limiteConsecutive(cfc)) { fait = true; break; }
        travail[cfc].delete(jour);
        travail[cfc].add(d2);
      }
      if (fait) break;
    }
  }

  return travail;
}
