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

/**
 * Equilibrage global du mois pour le planning :
 *  1) garantit qu'une gardienne CFC est presente chaque jour (echange depuis un jour
 *     ou une autre CFC couvre deja), sans changer le nombre de jours de personne ;
 *  2) nivelle les effectifs : on deplace les personnes des jours les plus charges vers
 *     les jours les moins charges jusqu'a un ecart <= 1 (donc 2 personnes partout avant
 *     d'en mettre 3 quelque part), en respectant la limite de jours consecutifs et sans
 *     jamais retirer la derniere CFC d'un jour.
 * Statuts : "travail"/"ferie_travaille" = present ; "repos" = jour libre deplacable.
 * "vacances", "repos_vacances", "absent" ne sont jamais touches.
 */
export function equilibrerPlanningMois(args: {
  jours: string[];
  feries: string[];
  employes: { id: string; estCfc: boolean; limite: number }[];
  statuts: Record<string, Record<string, string>>;
}): Record<string, Record<string, string>> {
  const { jours, feries, employes } = args;
  const feriesSet = new Set(feries);

  const st: Record<string, Record<string, string>> = {};
  Object.keys(args.statuts).forEach(id => { st[id] = { ...args.statuts[id] }; });

  const cfcIds = employes.filter(e => e.estCfc).map(e => e.id);
  const limiteOf: Record<string, number> = {};
  employes.forEach(e => { limiteOf[e.id] = e.limite; });

  const present = (id: string, d: string) =>
    st[id]?.[d] === "travail" || st[id]?.[d] === "ferie_travaille";
  const libre = (id: string, d: string) => st[id]?.[d] === "repos";
  const effectif = (d: string) => employes.reduce((n, e) => n + (present(e.id, d) ? 1 : 0), 0);
  const cfcCount = (d: string) => cfcIds.reduce((n, id) => n + (present(id, d) ? 1 : 0), 0);

  const maxRun = (id: string): number => {
    let run = 0, mx = 0;
    for (const d of jours) {
      if (present(id, d)) { run++; if (run > mx) mx = run; } else run = 0;
    }
    return mx;
  };

  const poser = (id: string, d: string) => { st[id][d] = feriesSet.has(d) ? "ferie_travaille" : "travail"; };
  const liberer = (id: string, d: string) => { st[id][d] = "repos"; };

  // 1) Couverture CFC
  for (const d of jours) {
    if (cfcCount(d) > 0) continue;
    for (const cid of cfcIds) {
      if (!libre(cid, d)) continue;
      const donneur = jours.find(d2 =>
        d2 !== d && present(cid, d2) && cfcIds.some(o => o !== cid && present(o, d2))
      );
      if (!donneur) continue;
      liberer(cid, donneur);
      poser(cid, d);
      if (maxRun(cid) > limiteOf[cid]) {
        liberer(cid, d);
        poser(cid, donneur);
        continue;
      }
      break;
    }
  }

  // 2) Nivellement des effectifs
  const MAX_ITER = jours.length * employes.length * 4 + 20;
  for (let iter = 0; iter < MAX_ITER; iter++) {
    const hauts = [...jours].sort((a, b) => effectif(b) - effectif(a));
    const bas = [...jours].sort((a, b) => effectif(a) - effectif(b));
    let bouge = false;
    for (const dH of hauts) {
      for (const dL of bas) {
        if (effectif(dH) - effectif(dL) <= 1) break;
        let trouve = false;
        for (const e of employes) {
          if (!present(e.id, dH) || !libre(e.id, dL)) continue;
          if (e.estCfc && cfcCount(dH) === 1) continue;
          liberer(e.id, dH);
          poser(e.id, dL);
          if (maxRun(e.id) > limiteOf[e.id]) {
            liberer(e.id, dL);
            poser(e.id, dH);
            continue;
          }
          trouve = true;
          break;
        }
        if (trouve) { bouge = true; break; }
      }
      if (bouge) break;
    }
    if (!bouge) break;
  }

  // 2.5) Plafond week-end : eviter 3 personnes le week-end, pousser l'excedent vers la semaine.
  //      (garde au moins une CFC le WE, respecte la limite de jours consecutifs).
  const estWeCap = (d: string) => {
    const dow = new Date(d + "T12:00:00").getDay();
    return dow === 0 || dow === 6;
  };
  const joursWeCap = jours.filter(estWeCap);
  const joursSemaineCap = jours.filter(d => !estWeCap(d));
  const MAX_WE_CAP = jours.length * employes.length * 4 + 20;
  for (let iter = 0; iter < MAX_WE_CAP; iter++) {
    let bougeCap = false;
    for (const dWe of joursWeCap) {
      if (effectif(dWe) <= 2) continue;
      for (const e of employes) {
        if (!present(e.id, dWe)) continue;
        if (e.estCfc && cfcCount(dWe) === 1) continue; // garder au moins une CFC le week-end
        const dCible = joursSemaineCap.find(dS => libre(e.id, dS) && effectif(dS) < effectif(dWe));
        if (!dCible) continue;
        liberer(e.id, dWe);
        poser(e.id, dCible);
        if (maxRun(e.id) > limiteOf[e.id]) {
          liberer(e.id, dCible);
          poser(e.id, dWe);
          continue;
        }
        bougeCap = true;
        break;
      }
      if (bougeCap) break;
    }
    if (!bougeCap) break;
  }

  // 3) Rotation des week-ends : equilibre le nombre de WE travailles au sein de chaque groupe
  const weJours = new Set(jours.filter(d => {
    const dow = new Date(d + "T12:00:00").getDay();
    return dow === 0 || dow === 6;
  }));

  if (weJours.size > 0) {
    const groupes: string[][] = [
      employes.filter(e => e.estCfc).map(e => e.id),
      employes.filter(e => !e.estCfc).map(e => e.id),
    ];

    for (const groupe of groupes) {
      if (groupe.length < 2) continue;
      const MAX_WE = groupe.length * groupe.length * (weJours.size + 1);
      for (let iter = 0; iter < MAX_WE; iter++) {
        const weCount = (id: string) => [...weJours].filter(d => present(id, d)).length;
        const tries = [...groupe].sort((a, b) => weCount(b) - weCount(a));
        const donneur = tries[0];
        const receveur = tries[tries.length - 1];
        if (weCount(donneur) - weCount(receveur) <= 1) break;

        const weD = [...weJours].filter(d => present(donneur, d) && libre(receveur, d));
        const nonWeR = jours.filter(d => !weJours.has(d) && present(receveur, d) && libre(donneur, d));
        if (weD.length === 0 || nonWeR.length === 0) break;

        let fait = false;
        for (const dWe of weD) {
          if (fait) break;
          for (const dNW of nonWeR) {
            liberer(donneur, dWe); poser(donneur, dNW);
            liberer(receveur, dNW); poser(receveur, dWe);
            if (maxRun(donneur) <= limiteOf[donneur] && maxRun(receveur) <= limiteOf[receveur]) {
              fait = true; break;
            }
            poser(donneur, dWe); liberer(donneur, dNW);
            poser(receveur, dNW); liberer(receveur, dWe);
          }
        }
        if (!fait) break;
      }
    }
  }

  return st;
}
