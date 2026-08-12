"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { sauvegarderPlanning } from "./actions";
import { joursTravaillesSemaine, reequilibrerCfc, equilibrerPlanningMois } from "@/src/lib/planningUtils";
import { couleurEmploye } from "@/src/lib/couleursEmployes";
import { getJoursFeries } from "@/src/lib/joursFeries";

type Employe = {
  id: string;
  prenom: string;
  nom: string;
  taux_travail: number;
  email: string;
  actif: boolean;
  poste?: string | null;
  jour_cours?: number | null;
};

type JourPlanning = {
  employe_id: string;
  date: string;
  statut: string;
  note?: string;
};

// Chaque val = valeur stockée en DB telle quelle (11 valeurs acceptées par la contrainte)
const STATUTS = [
  { val: "travail",         label: "✅ Travail",           emoji: "✅",   bg: "#E8F5F4", text: "#4AAEA0" },
  { val: "repos",           label: "😴 Repos",             emoji: "😴",   bg: "#F1F5F9", text: "#6B7280" },
  { val: "repos_vacances",  label: "🏖️ Repos vacances",    emoji: "RV",   bg: "#FFFBEB", text: "#D97706" },
  { val: "vacances",        label: "🏖️ Vacances",          emoji: "🏖️",  bg: "#FEF9C3", text: "#CA8A04" },
  { val: "absent",          label: "🚫 Absent",            emoji: "🚫",   bg: "#FEE2E2", text: "#DC2626" },
  { val: "maladie",         label: "🤒 Maladie",           emoji: "🤒",   bg: "#FEE2E2", text: "#DC2626" },
  { val: "accident",        label: "🤕 Accident",          emoji: "🤕",   bg: "#FEE2E2", text: "#DC2626" },
  { val: "militaire",       label: "🎖️ Militaire",         emoji: "🎖️",  bg: "#EDE9FE", text: "#7C3AED" },
  { val: "ferie_travaille", label: "🎉✅ Férié travaillé", emoji: "🎉✅", bg: "#FEF3C7", text: "#15803D" },
  { val: "heures_sup",      label: "⏱️ Déd. H.sup",        emoji: "⏱️",  bg: "#DBEAFE", text: "#2563EB" },
  { val: "autre",           label: "📋 Autre",             emoji: "📋",   bg: "#F1F5F9", text: "#6B7280" },
  { val: "cours",           label: "🎓 Cours",             emoji: "🎓",   bg: "#E0F2FE", text: "#0369A1" },
];


// Jours fériés valaisans : fonction générique partagée (src/lib/joursFeries.ts),
// calculée pour toute année — plus de valeurs codées en dur (correct au-delà de 2027).

const NOMS_MOIS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

// ── Vue calendrier éditable ──────────────────────────────────────────────────
const NOMS_JOURS_CAL = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const PRESENCE_VIEW = ["travail", "ferie_travaille"];
const ABSENCE_VIEW = ["maladie", "absent", "accident", "militaire"];
const AUTRES_VIEW = ["repos_vacances", "heures_sup", "autre", "cours"];
const ICONE_ABSENCE_CAL: Record<string, string> = { maladie: "🤒", absent: "❌", accident: "🩹", militaire: "🎖️" };

const STYLE_IMPRESSION = `
.titre-impression { display: none; }
@media print {
  @page { size: landscape; margin: 8mm; }
  body { background: #ffffff !important; }
  body * { visibility: hidden; }
  #zone-impression, #zone-impression * { visibility: visible; }
  #zone-impression {
    position: absolute; left: 0; top: 0; width: 100%;
    padding: 0 !important;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .no-print { display: none !important; }
  .titre-impression { display: block !important; }
}
`;


export default function GenerateurPlanning({
  employes, mois, annee, planningExistant, planningPrecedent, vacancesAcceptees, indisponibilites,
}: {
  employes: Employe[];
  mois: number;
  annee: number;
  planningExistant: any[];
  planningPrecedent: any[];
  vacancesAcceptees: any[];
  indisponibilites: any[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [erreurSave, setErreurSave] = useState<string | null>(null);
  const [popover, setPopover] = useState<{ date: string; employe_id: string | null; mode: "statut" | "add" } | null>(null);

  const joursParMois = new Date(annee, mois, 0).getDate();
  const joursFeries = getJoursFeries(annee);
  const hasExistingPlanning = planningExistant.length > 0;

  // 'ferie' (chômé) est supprimé ; les éventuelles lignes résiduelles sont traitées comme 'repos'
  const [planning, setPlanning] = useState<Record<string, Record<string, JourPlanning>>>(() => {
    const init: Record<string, Record<string, JourPlanning>> = {};
    employes.forEach(emp => {
      init[emp.id] = {};
      planningExistant
        .filter(p => p.employe_id === emp.id)
        .forEach(p => {
          const statut = p.statut === "ferie" ? "repos"
            : STATUTS.find(s => s.val === p.statut) ? p.statut
            : "autre";
          init[emp.id][p.date] = { ...p, statut };
        });
    });
    return init;
  });

  const moisPrecedent = mois === 1 ? 12 : mois - 1;
  const anneePrecedente = mois === 1 ? annee - 1 : annee;
  const moisSuivant = mois === 12 ? 1 : mois + 1;
  const anneeSuivante = mois === 12 ? annee + 1 : annee;

  const getDates = () => {
    const dates = [];
    for (let d = 1; d <= joursParMois; d++) {
      dates.push(`${annee}-${String(mois).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    }
    return dates;
  };

  const estWeekend = (d: string) => [0, 6].includes(new Date(d + "T12:00:00").getDay());
  const estFerie   = (d: string) => joursFeries.includes(d);
  const estEnVacances = (id: string, d: string) =>
    vacancesAcceptees.some(v => v.employes_rh?.id === id && d >= v.date_debut && d <= v.date_fin);
  const estIndispo = (id: string, d: string) =>
    indisponibilites.some(i => i.employe_id === id && i.date === d);

  const getStatut = (id: string, d: string) => planning[id]?.[d]?.statut || null;

  // Alerte live : jours du mois sans aucune gardienne CFC presente (recalcule a chaque changement).
  const joursSansCfc = useMemo(() => {
    const cfc = employes.filter(e => e.actif && e.poste === "Gardien-ne d'animaux CFC");
    if (cfc.length === 0) return [];
    const jours: string[] = [];
    for (let d = 1; d <= joursParMois; d++) {
      jours.push(`${annee}-${String(mois).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    }
    return jours.filter(dateStr => {
      const couvert = cfc.some(emp => {
        const st = planning[emp.id]?.[dateStr]?.statut;
        return st === "travail" || st === "ferie_travaille";
      });
      return !couvert;
    });
  }, [planning, employes, annee, mois, joursParMois]);

  const changerStatut = (employe_id: string, date: string, statut: string) => {
    setPlanning(prev => ({
      ...prev,
      [employe_id]: { ...prev[employe_id], [date]: { employe_id, date, statut } }
    }));
    setPopover(null);
  };

  const generer = async () => {
    if (hasExistingPlanning) {
      const ok = window.confirm(
        "Régénérer remplacera le planning actuel de ce mois, y compris les modifications manuelles. Continuer ?"
      );
      if (!ok) return;
    }

    setLoading(true);
    const nouveauPlanning: Record<string, Record<string, JourPlanning>> = {};
    const employesActifs = employes.filter(e => e.actif);
    const POSTE_CFC = "Gardien-ne d'animaux CFC";
    const POSTE_APPRENTI = "Apprenti-e Gardien-ne d'animaux";
    const cfcActifs = employesActifs.filter(e => e.poste === POSTE_CFC);

    employes.forEach(emp => { nouveauPlanning[emp.id] = {}; });

    // Préfixe du mois cible pour filtrer les jours hors mois lors de l'écriture
    const datePrefix = `${annee}-${String(mois).padStart(2, "0")}-`;

    // Helper : Date JS → "YYYY-MM-DD"
    const toDateStr = (d: Date): string => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const j = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${j}`;
    };

    // Semaines calendaires lun→dim chevauchant le mois.
    // La 1re semaine peut commencer avant le 1er, la dernière peut finir après le dernier.
    // Les jours hors mois servent au calcul mais ne sont jamais écrits en base.
    const d1 = new Date(annee, mois - 1, 1, 12, 0, 0);
    const jourD1 = d1.getDay(); // 0=dim,1=lun,...,6=sam
    const offsetLundi = jourD1 === 0 ? -6 : 1 - jourD1;
    const lundiDepart = new Date(d1);
    lundiDepart.setDate(d1.getDate() + offsetLundi);

    const dLast = new Date(annee, mois - 1, joursParMois, 12, 0, 0);
    const jourDLast = dLast.getDay();
    const offsetDimanche = jourDLast === 0 ? 0 : 7 - jourDLast;
    const dimancheFin = new Date(dLast);
    dimancheFin.setDate(dLast.getDate() + offsetDimanche);

    // Index continu de semaine depuis lundi 2024-01-01 (lui-même un lundi).
    // Garantit une parité stable d'un mois à l'autre pour l'alternance des demis.
    const lundiRef = new Date(2024, 0, 1, 12, 0, 0);

    const semaines: { days: string[]; idxCal: number }[] = [];
    const dCur = new Date(lundiDepart);
    while (dCur <= dimancheFin) {
      const semaineDays: string[] = [];
      for (let i = 0; i < 7; i++) {
        semaineDays.push(toDateStr(dCur));
        dCur.setDate(dCur.getDate() + 1);
      }
      const idxCal = Math.round(
        (new Date(semaineDays[0] + "T12:00:00").getTime() - lundiRef.getTime()) /
        (7 * 24 * 60 * 60 * 1000)
      );
      semaines.push({ days: semaineDays, idxCal });
    }

    // Rang de déphasage par employé : index parmi les collègues de même taux (tri déterministe par id)
    const rangDephasage: Record<string, number> = {};
    const parTaux: Record<number, Employe[]> = {};
    employesActifs.forEach(emp => {
      if (!parTaux[emp.taux_travail]) parTaux[emp.taux_travail] = [];
      parTaux[emp.taux_travail].push(emp);
    });
    Object.values(parTaux).forEach(groupe => {
      groupe.sort((a, b) => a.id.localeCompare(b.id));
      groupe.forEach((emp, rang) => { rangDephasage[emp.id] = rang; });
    });

    // Carry inter-semaines : nb de jours de travail consécutifs terminant la semaine précédente.
    // Initialisé depuis la fin du mois précédent (jonction des mois) pour ne pas dépasser la
    // limite de jours consécutifs à la frontière. La série compte les présences réelles
    // (travail / ferie_travaille) finissant la veille du premier lundi de la grille.
    const carry: Record<string, number> = {};
    const veilleDepart = new Date(lundiDepart);
    veilleDepart.setDate(lundiDepart.getDate() - 1);
    employesActifs.forEach(emp => {
      let serie = 0;
      const cur = new Date(veilleDepart);
      for (let k = 0; k < 8; k++) {
        const ds = toDateStr(cur);
        const ligne = (planningPrecedent ?? []).find(
          (p: any) => p.employe_id === emp.id && p.date === ds
        );
        if (ligne && (ligne.statut === "travail" || ligne.statut === "ferie_travaille")) {
          serie++;
          cur.setDate(cur.getDate() - 1);
        } else {
          break;
        }
      }
      carry[emp.id] = serie;
    });

    // Toutes les combinaisons de k éléments parmi arr (ordre préservé)
    const combinations = (arr: string[], k: number): string[][] => {
      if (k <= 0) return [[]];
      if (k > arr.length) return [];
      if (k === arr.length) return [arr.slice()];
      const result: string[][] = [];
      for (let i = 0; i <= arr.length - k; i++) {
        const sub = combinations(arr.slice(i + 1), k - 1);
        sub.forEach(c => result.push([arr[i], ...c]));
      }
      return result;
    };

    // Longueur max d'une série de travail consécutif, carryIn jours travaillés avant la semaine
    const maxSerie = (
      travailSet: Set<string>,
      fixesEmp: Record<string, string>,
      semaineLocal: string[],
      carryIn: number,
    ): number => {
      let streak = carryIn;
      let maxS = carryIn;
      for (const d of semaineLocal) {
        if (!fixesEmp[d] && travailSet.has(d)) { streak++; if (streak > maxS) maxS = streak; }
        else { streak = 0; }
      }
      return maxS;
    };

    // Limite de jours consécutifs selon le taux
    const maxConsecutif = (taux: number): { normal: number; exceptionnel: number } => {
      const t: Record<number, { normal: number; exceptionnel: number }> = {
        100: { normal: 5, exceptionnel: 6 },
         90: { normal: 5, exceptionnel: 6 },
         80: { normal: 4, exceptionnel: 5 },
         70: { normal: 4, exceptionnel: 5 },
         60: { normal: 3, exceptionnel: 4 },
         50: { normal: 3, exceptionnel: 3 },
         40: { normal: 3, exceptionnel: 4 },
         30: { normal: 2, exceptionnel: 3 },
         20: { normal: 2, exceptionnel: 2 },
         10: { normal: 1, exceptionnel: 2 },
      };
      return t[taux] ?? { normal: 5, exceptionnel: 6 };
    };

    semaines.forEach(({ days: semaine, idxCal: idxSemaine }) => {
      const fixes: Record<string, Record<string, string>> = {};
      employesActifs.forEach(emp => {
        fixes[emp.id] = {};
        semaine.forEach(d => {
          // Les jours de vacances ne sont PLUS fixés : ils participent au placement normal
          // et reçoivent statut 'vacances' (travail) ou 'repos_vacances' à l'écriture.
          if (estIndispo(emp.id, d)) fixes[emp.id][d] = "absent";
        });
      });

      // Jour de cours des apprentis : fixe ce jour de semaine en "cours"
      // (compte comme 1 jour de travail ; ne compte pas comme presence a la pension).
      const coursParEmp: Record<string, number> = {};
      employesActifs.forEach(emp => {
        coursParEmp[emp.id] = 0;
        if (emp.poste !== POSTE_APPRENTI || emp.jour_cours == null) return;
        semaine.forEach(d => {
          if (!d.startsWith(datePrefix)) return;
          if (fixes[emp.id][d]) return;
          if (joursFeries.includes(d)) return;
          if (estEnVacances(emp.id, d)) return;
          if (new Date(d + "T12:00:00").getDay() === emp.jour_cours) {
            fixes[emp.id][d] = "cours";
            coursParEmp[emp.id] += 1;
          }
        });
      });

      // Trier : taux croissant → les plus contraints (plus de repos) d'abord
      const empOrdres = [...employesActifs].sort((a, b) => a.taux_travail - b.taux_travail);

      // Compteur de présence partagé pour l'équilibre de couverture (sur les 7 jours)
      const presence: Record<string, number> = {};
      semaine.forEach(d => { presence[d] = 0; });

      const joursChoisis: Record<string, Set<string>> = {};
      employesActifs.forEach(emp => { joursChoisis[emp.id] = new Set(); });

      // Choisir les jours de travail en énumérant toutes les combinaisons de repos :
      // retient celle qui respecte la limite de série et minimise le déséquilibre de couverture,
      // avec bonus si les repos sont contigus dans le calendrier.
      const choisirEtAppliquerJours = (emp: Employe, joursLibres: string[], cible_actual: number) => {
        const reposCount = joursLibres.length - cible_actual;
        if (reposCount <= 0) {
          joursLibres.forEach(d => { joursChoisis[emp.id].add(d); presence[d]++; });
          return;
        }
        const { normal, exceptionnel } = maxConsecutif(emp.taux_travail);
        const carryIn = carry[emp.id];
        const allCombos = combinations(joursLibres, reposCount);
        // Rotation par idxSemaine pour varier le tiebreak d'une semaine à l'autre
        const rot = idxSemaine % Math.max(1, allCombos.length);
        const orderedCombos = [...allCombos.slice(rot), ...allCombos.slice(0, rot)];

        const tryLimit = (limite: number): { score: number; contigu: boolean; travailSet: Set<string> } | null => {
          let best: { score: number; contigu: boolean; travailSet: Set<string> } | null = null;
          for (const reposDays of orderedCombos) {
            const reposSet = new Set(reposDays);
            const travailSet = new Set(joursLibres.filter(d => !reposSet.has(d)));
            if (maxSerie(travailSet, fixes[emp.id], semaine, carryIn) > limite) continue;
            let score = 0;
            semaine.forEach(d => { score += (presence[d] + (travailSet.has(d) ? 1 : 0)) ** 2; });
            // Bonus repos contigu dans le calendrier (indices consécutifs dans semaine)
            const idxRepos = semaine.map((d, i) => reposSet.has(d) ? i : -1).filter(i => i >= 0);
            let contigu = true;
            for (let i = 1; i < idxRepos.length; i++) {
              if (idxRepos[i] !== idxRepos[i - 1] + 1) { contigu = false; break; }
            }
            if (!best || score < best.score || (score === best.score && contigu && !best.contigu)) {
              best = { score, contigu, travailSet };
            }
          }
          return best;
        };

        let meilleur = tryLimit(normal) ?? tryLimit(exceptionnel);
        if (!meilleur) {
          // Fallback ultime (ne devrait pas arriver en pratique)
          meilleur = { score: 0, contigu: true, travailSet: new Set(joursLibres.slice(reposCount)) };
        }
        meilleur.travailSet.forEach(d => { joursChoisis[emp.id].add(d); presence[d]++; });
      };

      // Placement initial
      empOrdres.forEach(emp => {
        const cible = Math.max(0, joursTravaillesSemaine(emp.taux_travail, idxSemaine + rangDephasage[emp.id]) - coursParEmp[emp.id]);
        const joursLibres = semaine.filter(d => !fixes[emp.id][d]);
        if (joursLibres.length === 0) return;
        choisirEtAppliquerJours(emp, joursLibres, Math.min(cible, joursLibres.length));
      });

      // 2 passes de ré-optimisation pour stabiliser l'équilibre global
      for (let pass = 0; pass < 2; pass++) {
        empOrdres.forEach(emp => {
          const cible = Math.max(0, joursTravaillesSemaine(emp.taux_travail, idxSemaine + rangDephasage[emp.id]) - coursParEmp[emp.id]);
          const joursLibres = semaine.filter(d => !fixes[emp.id][d]);
          if (joursLibres.length === 0) return;
          const cible_actual = Math.min(cible, joursLibres.length);
          if (cible_actual >= joursLibres.length) return;
          joursChoisis[emp.id].forEach(d => { presence[d]--; });
          joursChoisis[emp.id] = new Set();
          choisirEtAppliquerJours(emp, joursLibres, cible_actual);
        });
      }

      // Secours : au moins 1 personne présente chaque jour DU MOIS CIBLE
      semaine.forEach(dateStr => {
        if (!dateStr.startsWith(datePrefix)) return; // pas de secours pour les jours hors mois
        if (fixes[employesActifs[0]?.id]?.[dateStr]) return;
        const travaillent = employesActifs.filter(emp =>
          joursChoisis[emp.id].has(dateStr) || fixes[emp.id][dateStr] === "travail"
        );
        if (travaillent.length === 0) {
          const forceable = employesActifs.find(emp =>
            emp.taux_travail === 100 && !fixes[emp.id][dateStr]
          ) || employesActifs.find(emp => !fixes[emp.id][dateStr]);
          if (forceable) joursChoisis[forceable.id].add(dateStr);
        }
      });

      // Reequilibrage CFC : garantir une gardienne CFC chaque jour par echange (respecte le taux)
      if (cfcActifs.length > 0) {
        const cfcIds = cfcActifs.map(e => e.id);
        const repartition = reequilibrerCfc({
          semaine,
          estDansMois: (d) => d.startsWith(datePrefix),
          cfcIds,
          travail: Object.fromEntries(cfcIds.map(id => [id, joursChoisis[id] ?? new Set()])),
          estIndispo: (id, d) => fixes[id]?.[d] === "absent",
          estEnVacances,
          limiteConsecutive: (id) => {
            const emp = cfcActifs.find(e => e.id === id);
            return emp ? maxConsecutif(emp.taux_travail).exceptionnel : 6;
          },
          carryIn: (id) => carry[id] ?? 0,
        });
        Object.keys(repartition).forEach(id => { joursChoisis[id] = repartition[id]; });
      }

      // Écrire les statuts dans nouveauPlanning (UNIQUEMENT les jours du mois cible)
      employesActifs.forEach(emp => {
        semaine.forEach(dateStr => {
          if (!dateStr.startsWith(datePrefix)) return; // hors du mois cible, pas d'écriture
          if (fixes[emp.id][dateStr]) {
            // Seul fix restant : 'absent' (vacances retiré des fixes)
            nouveauPlanning[emp.id][dateStr] = {
              employe_id: emp.id, date: dateStr, statut: fixes[emp.id][dateStr]
            };
          } else if (joursChoisis[emp.id].has(dateStr)) {
            // Jour travaillé : ferie_travaille > vacances > travail (priorité décroissante)
            let statut: string;
            if (joursFeries.includes(dateStr)) statut = "ferie_travaille";
            else if (estEnVacances(emp.id, dateStr)) statut = "vacances";
            else statut = "travail";
            nouveauPlanning[emp.id][dateStr] = { employe_id: emp.id, date: dateStr, statut };
          } else {
            // Jour de repos : repos_vacances si dans la plage, repos sinon
            const statut = estEnVacances(emp.id, dateStr) ? "repos_vacances" : "repos";
            nouveauPlanning[emp.id][dateStr] = { employe_id: emp.id, date: dateStr, statut };
          }
        });
      });

      // Mettre à jour le carry pour la semaine suivante (sur les 7 jours, hors mois inclus)
      employesActifs.forEach(emp => {
        let c = 0;
        for (let i = semaine.length - 1; i >= 0; i--) {
          const d = semaine[i];
          if (!fixes[emp.id][d] && joursChoisis[emp.id].has(d)) { c++; }
          else { break; }
        }
        carry[emp.id] = c;
      });
    });

    // Equilibrage global du mois : CFC garantie d'abord, puis 2 personnes partout,
    // et 3 seulement si tous les jours ont deja 2 (nivellement des effectifs).
    {
      const joursMoisEq = Array.from(new Set(
        semaines.flatMap(s => s.days).filter(d => d.startsWith(datePrefix))
      )).sort();
      const empsMeta = employesActifs.map(e => ({
        id: e.id,
        estCfc: e.poste === POSTE_CFC,
        limite: maxConsecutif(e.taux_travail).exceptionnel,
      }));
      const statutsMois: Record<string, Record<string, string>> = {};
      employesActifs.forEach(e => {
        statutsMois[e.id] = {};
        joursMoisEq.forEach(d => {
          statutsMois[e.id][d] = nouveauPlanning[e.id]?.[d]?.statut ?? "repos";
        });
      });
      const equilibre = equilibrerPlanningMois({
        jours: joursMoisEq,
        feries: joursFeries,
        employes: empsMeta,
        statuts: statutsMois,
      });
      employesActifs.forEach(e => {
        joursMoisEq.forEach(d => {
          nouveauPlanning[e.id][d] = { employe_id: e.id, date: d, statut: equilibre[e.id][d] };
        });
      });
    }

    setPlanning(nouveauPlanning);
    setLoading(false);
  };

  const sauvegarder = async () => {
    setSaving(true);
    setErreurSave(null);
    const lignes: JourPlanning[] = [];
    Object.values(planning).forEach(p =>
      Object.values(p).forEach(j => {
        if (j.statut) lignes.push({ employe_id: j.employe_id, date: j.date, statut: j.statut, note: j.note });
      })
    );
    const result = await sauvegarderPlanning(lignes);
    setSaving(false);
    if (result.error) {
      setErreurSave(result.error);
    } else {
      router.refresh();
    }
  };

  const employesAffichage = employes
    .filter(e => e.actif)
    .sort((a, b) => {
      const aCfc = a.poste === "Gardien-ne d'animaux CFC" ? 0 : 1;
      const bCfc = b.poste === "Gardien-ne d'animaux CFC" ? 0 : 1;
      if (aCfc !== bCfc) return aCfc - bCfc;
      if (b.taux_travail !== a.taux_travail) return b.taux_travail - a.taux_travail;
      return a.nom.localeCompare(b.nom);
    });

  const estCfc = (e: Employe) => e.poste === "Gardien-ne d'animaux CFC";

  const couleurParId: Record<string, { bg: string; fg: string }> = {};
  const prenomParId: Record<string, string> = {};
  employesAffichage.forEach((e, i) => {
    couleurParId[e.id] = couleurEmploye(e.prenom, i);
    prenomParId[e.id] = e.prenom;
  });

  const offsetCal = (new Date(annee, mois - 1, 1).getDay() + 6) % 7;
  const casesCal: ({ jour: number; dateStr: string; weekend: boolean } | null)[] = [];
  for (let k = 0; k < offsetCal; k++) casesCal.push(null);
  for (let d = 1; d <= joursParMois; d++) {
    const ds = `${annee}-${String(mois).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    casesCal.push({ jour: d, dateStr: ds, weekend: estWeekend(ds) });
  }
  const aujourdhuiStr = new Date().toISOString().split("T")[0];

  const presentsDe = (ds: string) => employesAffichage.filter(e => PRESENCE_VIEW.includes(getStatut(e.id, ds) ?? ""));
  const vacancesDe = (ds: string) => employesAffichage.filter(e => getStatut(e.id, ds) === "vacances");
  const absencesDe = (ds: string) => employesAffichage.filter(e => ABSENCE_VIEW.includes(getStatut(e.id, ds) ?? ""));
  const autresDe   = (ds: string) => employesAffichage.filter(e => AUTRES_VIEW.includes(getStatut(e.id, ds) ?? ""));

  const statsEmp = (emp: Employe) => {
    const p = planning[emp.id] || {};
    let jours = 0, we = 0;
    Object.values(p).forEach(j => {
      if (PRESENCE_VIEW.includes(j.statut) || j.statut === "cours") {
        jours++;
        if (estWeekend(j.date)) we++;
      }
    });
    return { jours, we };
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: STYLE_IMPRESSION }} />
      <div>
      <div className="flex justify-between items-center mb-6">
        <a href={`/employes/planning?mois=${moisPrecedent}&annee=${anneePrecedente}`}
          className="px-4 py-2 rounded-xl font-semibold text-sm"
          style={{ backgroundColor: "#EDE8DF", color: "#1B2B5E" }}>
          ← {NOMS_MOIS[moisPrecedent - 1]}
        </a>
        <h2 className="text-2xl font-bold" style={{ color: "#1B2B5E" }}>
          {NOMS_MOIS[mois - 1]} {annee}
        </h2>
        <a href={`/employes/planning?mois=${moisSuivant}&annee=${anneeSuivante}`}
          className="px-4 py-2 rounded-xl font-semibold text-sm"
          style={{ backgroundColor: "#EDE8DF", color: "#1B2B5E" }}>
          {NOMS_MOIS[moisSuivant - 1]} →
        </a>
      </div>

      <div className="flex gap-3 mb-4 flex-wrap items-center">
        <button onClick={generer} disabled={loading}
          className="px-6 py-3 rounded-xl font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: "#4AAEA0" }}>
          {loading ? "Génération..." : hasExistingPlanning ? "⚡ Régénérer" : "⚡ Générer automatiquement"}
        </button>
        <button onClick={sauvegarder} disabled={saving}
          className="px-6 py-3 rounded-xl font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: "#1B2B5E" }}>
          {saving ? "Sauvegarde..." : "💾 Sauvegarder"}
        </button>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center px-6 py-3 rounded-xl font-semibold text-white"
          style={{ backgroundColor: "#2E8B7E" }}
        >
          🖨️ Imprimer le planning
        </button>
      </div>

      {erreurSave && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-100 text-red-700 text-sm font-semibold">
          ❌ Erreur : {erreurSave}
        </div>
      )}

      {joursSansCfc.length > 0 && (
        <div className="mb-4 px-4 py-3 rounded-xl text-sm font-semibold"
          style={{ background: "#FEF3C7", color: "#92400E", border: "1px solid #FCD34D" }}>
          ⚠️ Aucune gardienne CFC présente ces jours-là : {joursSansCfc.map(d => d.slice(8)).join(", ")}.
          Vérifie les vacances et absences de Sabrina et Francine pour ces dates.
        </div>
      )}

      <p className="text-sm mb-3" style={{ color: "rgba(27,43,94,0.6)" }}>
        Clique sur un prénom pour changer son statut (Repos le retire de la case ; Vacances / Absent / Maladie l'affichent en mention). « + » ajoute une personne en présence.
      </p>

      <div id="zone-impression">
      <h2 className="titre-impression" style={{ textAlign: "center", fontWeight: 700, fontSize: 20, color: "#1B2B5E", marginBottom: 12 }}>
        {NOMS_MOIS[mois - 1]} {annee}
      </h2>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {NOMS_JOURS_CAL.map(j => (
          <div key={j} className="text-center text-xs font-semibold py-1" style={{ color: "rgba(27,43,94,0.55)" }}>{j}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {casesCal.map((c, i) => {
          if (!c) return <div key={`v${i}`} />;
          const presents = presentsDe(c.dateStr);
          const vacs = vacancesDe(c.dateStr);
          const abs = absencesDe(c.dateStr);
          const autres = autresDe(c.dateStr);
          const estF = estFerie(c.dateStr);
          const estAuj = c.dateStr === aujourdhuiStr;
          const seul = presents.length === 1;
          const popActif = popover?.date === c.dateStr;
          const dejaPresent = new Set(presents.map(e => e.id));
          const ajoutables = employesAffichage.filter(e => !dejaPresent.has(e.id));
          return (
            <div key={c.dateStr} className="rounded-lg p-1.5 flex flex-col gap-1"
              style={{
                minHeight: 108,
                position: "relative",
                zIndex: popActif ? 50 : 1,
                background: estF ? "#F8EFD3" : c.weekend ? "#EDE8DF" : "#FFFFFF",
                border: estAuj ? "2px solid #2E8B7E" : estF ? "0.5px solid #C9A84C" : "0.5px solid rgba(27,43,94,0.12)",
              }}>
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: estAuj ? "#2E8B7E" : "rgba(27,43,94,0.55)", fontWeight: estAuj ? 800 : 600 }}>{c.jour}</span>
                <span className="flex items-center gap-1">
                  {seul && (
                    <span title="Une seule personne ce jour"
                      style={{ fontSize: 9, fontWeight: 700, color: "#B45309", background: "#FEF3C7", borderRadius: 4, padding: "0 4px" }}>seul</span>
                  )}
                  {estAuj
                    ? <span style={{ fontSize: 10, fontWeight: 700, color: "#2E8B7E" }}>Auj.</span>
                    : estF ? <span style={{ fontSize: 10, fontWeight: 700, color: "#6E5410" }}>Férié</span> : null}
                </span>
              </div>

              {presents.map(e => (
                <button key={e.id}
                  onClick={() => setPopover(popActif && popover?.employe_id === e.id && popover?.mode === "statut" ? null : { date: c.dateStr, employe_id: e.id, mode: "statut" })}
                  className="text-xs rounded-full px-2 truncate text-left flex items-center gap-1"
                  style={{ background: couleurParId[e.id]?.bg, color: couleurParId[e.id]?.fg, lineHeight: "1.7" }}>
                  {estCfc(e) && <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: couleurParId[e.id]?.fg, flex: "0 0 auto" }} />}
                  {getStatut(e.id, c.dateStr) === "ferie_travaille" ? "🎉 " : ""}{e.prenom}
                </button>
              ))}

              {abs.map(e => (
                <button key={`a-${e.id}`}
                  onClick={() => setPopover({ date: c.dateStr, employe_id: e.id, mode: "statut" })}
                  className="text-xs rounded-full px-2 truncate text-left"
                  style={{ background: "#FBE2DE", color: "#A8453A", lineHeight: "1.7" }}>
                  {ICONE_ABSENCE_CAL[getStatut(e.id, c.dateStr) ?? ""] ?? "⚠️"} {e.prenom}
                </button>
              ))}

              {vacs.map(e => (
                <button key={`v-${e.id}`}
                  onClick={() => setPopover({ date: c.dateStr, employe_id: e.id, mode: "statut" })}
                  className="text-xs rounded-full px-2 truncate text-left"
                  style={{ background: "#F1ECE3", color: "#9A8F7E", lineHeight: "1.7" }}>
                  🌴 {e.prenom}
                </button>
              ))}

              {autres.map(e => {
                const st = STATUTS.find(s => s.val === getStatut(e.id, c.dateStr));
                return (
                  <button key={`o-${e.id}`}
                    onClick={() => setPopover({ date: c.dateStr, employe_id: e.id, mode: "statut" })}
                    className="text-xs rounded-full px-2 truncate text-left"
                    style={{ background: st?.bg, color: st?.text, lineHeight: "1.7" }}>
                    {st?.emoji} {e.prenom}
                  </button>
                );
              })}

              <button
                onClick={() => setPopover(popActif && popover?.mode === "add" ? null : { date: c.dateStr, employe_id: null, mode: "add" })}
                className="no-print mt-auto text-xs rounded-md py-0.5"
                style={{ color: "#9AA3B2", border: "0.5px dashed rgba(27,43,94,0.2)" }}>
                +
              </button>

              {popActif && popover?.mode === "statut" && popover.employe_id && (
                <div className="absolute z-50 bg-white rounded-xl shadow-xl border p-2"
                  style={{ minWidth: 150, left: 4, top: 30 }}>
                  <div className="text-xs font-semibold mb-1 px-1" style={{ color: "#1B2B5E" }}>{prenomParId[popover.employe_id]}</div>
                  {STATUTS.map(s => (
                    <button key={s.val} onClick={() => changerStatut(popover.employe_id!, popover.date, s.val)}
                      className="w-full text-left px-3 py-1.5 rounded-lg text-xs font-semibold hover:opacity-80 mb-1"
                      style={{ backgroundColor: s.bg, color: s.text }}>
                      {s.label}
                    </button>
                  ))}
                </div>
              )}

              {popActif && popover?.mode === "add" && (
                <div className="absolute z-50 bg-white rounded-xl shadow-xl border p-2"
                  style={{ minWidth: 160, left: 4, top: 30 }}>
                  <div className="text-xs font-semibold mb-1 px-1" style={{ color: "#1B2B5E" }}>Ajouter (présent)</div>
                  {ajoutables.length === 0 && (
                    <div className="text-xs px-1 py-1" style={{ color: "#9AA3B2" }}>Tout le monde est déjà présent</div>
                  )}
                  {ajoutables.map(e => (
                    <button key={e.id} onClick={() => changerStatut(e.id, c.dateStr, "travail")}
                      className="w-full text-left px-3 py-1.5 rounded-lg text-xs font-semibold hover:opacity-80 mb-1 flex items-center gap-2"
                      style={{ backgroundColor: couleurParId[e.id]?.bg, color: couleurParId[e.id]?.fg }}>
                      {estCfc(e) && <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: couleurParId[e.id]?.fg }} />}
                      {e.prenom}{estCfc(e) ? " · CFC" : ""}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-5 bg-white rounded-xl p-4 shadow-sm">
        <div className="text-xs font-semibold mb-2" style={{ color: "rgba(27,43,94,0.55)" }}>Récapitulatif du mois</div>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {employesAffichage.map(e => {
            const s = statsEmp(e);
            return (
              <div key={e.id} className="flex items-center gap-2 text-sm" style={{ color: "#1B2B5E" }}>
                <span className="inline-block rounded-full" style={{ width: 11, height: 11, background: couleurParId[e.id]?.fg }} />
                {estCfc(e) && <span style={{ fontSize: 10, color: "#1F6E5B", fontWeight: 700 }}>CFC</span>}
                <span className="font-semibold">{e.prenom}</span>
                <span style={{ color: "rgba(27,43,94,0.6)" }}>{s.jours} j · {s.we} we · {e.taux_travail}%</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mt-4 text-sm">
        <span className="flex items-center gap-2" style={{ color: "#1B2B5E" }}>
          <span className="inline-block rounded-full" style={{ width: 6, height: 6, background: "#1F6E5B" }} /> point = gardienne CFC
        </span>
        <span className="flex items-center gap-2" style={{ color: "#A8453A" }}>
          <span className="inline-block rounded" style={{ width: 12, height: 12, background: "#FBE2DE", border: "1px solid #A8453A" }} /> absent / malade
        </span>
        <span className="flex items-center gap-2" style={{ color: "#9A8F7E" }}>🌴 vacances</span>
        <span className="flex items-center gap-2" style={{ color: "#6E5410" }}>
          <span className="inline-block rounded" style={{ width: 12, height: 12, background: "#F8EFD3", border: "1px solid #C9A84C" }} /> férié
        </span>
        <span className="flex items-center gap-2" style={{ color: "#B45309" }}>
          <span style={{ fontSize: 9, fontWeight: 700, background: "#FEF3C7", borderRadius: 4, padding: "0 4px" }}>seul</span> 1 seule personne
        </span>
        <span className="flex items-center gap-2" style={{ color: "#2E8B7E" }}>
          <span className="inline-block rounded" style={{ width: 12, height: 12, border: "2px solid #2E8B7E" }} /> aujourd'hui
        </span>
      </div>
      </div>

      {popover && (
        <div className="fixed inset-0 z-40" onClick={() => setPopover(null)} />
      )}
    </div>
    </>
  );
}
