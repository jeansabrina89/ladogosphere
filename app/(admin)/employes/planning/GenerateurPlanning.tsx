"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { sauvegarderPlanning } from "./actions";
import { joursTravaillesSemaine, reequilibrerCfc, equilibrerPlanningMois } from "@/src/lib/planningUtils";

type Employe = {
  id: string;
  prenom: string;
  nom: string;
  taux_travail: number;
  email: string;
  actif: boolean;
  poste?: string | null;
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
];


const JOURS_FERIES_2026 = [
  "2026-01-01", "2026-03-19", "2026-05-14", "2026-06-04",
  "2026-08-01", "2026-08-15", "2026-11-01", "2026-12-08", "2026-12-25"
];
const JOURS_FERIES_2027 = [
  "2027-01-01", "2027-03-19", "2027-05-06", "2027-05-27",
  "2027-08-01", "2027-08-15", "2027-11-01", "2027-12-08", "2027-12-25"
];

function getJoursFeries(annee: number): string[] {
  if (annee === 2026) return JOURS_FERIES_2026;
  if (annee === 2027) return JOURS_FERIES_2027;
  return [];
}

const NOMS_MOIS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];


export default function GenerateurPlanning({
  employes, mois, annee, planningExistant, vacancesAcceptees, indisponibilites,
}: {
  employes: Employe[];
  mois: number;
  annee: number;
  planningExistant: any[];
  vacancesAcceptees: any[];
  indisponibilites: any[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [erreurSave, setErreurSave] = useState<string | null>(null);
  const [celluleActive, setCelluleActive] = useState<{ employe_id: string; date: string } | null>(null);
  const [joursSansCfc, setJoursSansCfc] = useState<string[]>([]);

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

  const getStyle = (statut: string | null, estWE: boolean) => {
    if (!statut) return { bg: estWE ? "#F8FAFC" : "white", text: "#CBD5E1" };
    const s = STATUTS.find(x => x.val === statut);
    return { bg: s?.bg || "white", text: s?.text || "#6B7280" };
  };

  const changerStatut = (employe_id: string, date: string, statut: string) => {
    setPlanning(prev => ({
      ...prev,
      [employe_id]: { ...prev[employe_id], [date]: { employe_id, date, statut } }
    }));
    setCelluleActive(null);
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

    // Carry inter-semaines : nb de jours de travail consécutifs terminant la semaine précédente
    const carry: Record<string, number> = {};
    employesActifs.forEach(emp => { carry[emp.id] = 0; });

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
        const cible = joursTravaillesSemaine(emp.taux_travail, idxSemaine + rangDephasage[emp.id]);
        const joursLibres = semaine.filter(d => !fixes[emp.id][d]);
        if (joursLibres.length === 0) return;
        choisirEtAppliquerJours(emp, joursLibres, Math.min(cible, joursLibres.length));
      });

      // 2 passes de ré-optimisation pour stabiliser l'équilibre global
      for (let pass = 0; pass < 2; pass++) {
        empOrdres.forEach(emp => {
          const cible = joursTravaillesSemaine(emp.taux_travail, idxSemaine + rangDephasage[emp.id]);
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

    // Avertissement : jours du mois cible sans aucune gardienne CFC reellement presente
    const sansCfc: string[] = [];
    Array.from(new Set(semaines.flatMap(s => s.days).filter(d => d.startsWith(datePrefix))))
      .sort()
      .forEach(dateStr => {
        const couvert = cfcActifs.some(emp => {
          const j = nouveauPlanning[emp.id]?.[dateStr];
          return j && (j.statut === "travail" || j.statut === "ferie_travaille");
        });
        if (!couvert) sansCfc.push(dateStr);
      });
    setJoursSansCfc(sansCfc);

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

  const dates = getDates();

  const employesAffichage = employes
    .filter(e => e.actif)
    .sort((a, b) => {
      const aCfc = a.poste === "Gardien-ne d'animaux CFC" ? 0 : 1;
      const bCfc = b.poste === "Gardien-ne d'animaux CFC" ? 0 : 1;
      if (aCfc !== bCfc) return aCfc - bCfc;
      if (b.taux_travail !== a.taux_travail) return b.taux_travail - a.taux_travail;
      return a.nom.localeCompare(b.nom);
    });

  const getStats = (emp: Employe) => {
    const p = planning[emp.id] || {};
    return {
      joursT:  Object.values(p).filter(j => j.statut === "travail").length,
      joursV:  Object.values(p).filter(j => j.statut === "vacances").length,
      joursFT: Object.values(p).filter(j => j.statut === "ferie_travaille").length,
      joursHS: Object.values(p).filter(j => j.statut === "heures_sup").length,
    };
  };

  return (
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
        <a
          href={`/employes/planning-equipe?mois=${mois}&annee=${annee}`}
          className="inline-flex items-center px-6 py-3 rounded-xl font-semibold text-white"
          style={{ backgroundColor: "#2E8B7E" }}
        >
          🖨️ Imprimer le planning
        </a>
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

      <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
        <div className="flex flex-wrap gap-2">
          {STATUTS.map(s => (
            <span key={s.val} className="px-2 py-1 rounded-full text-xs font-semibold"
              style={{ backgroundColor: s.bg, color: s.text }}>
              {s.label}
            </span>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr style={{ backgroundColor: "#1B2B5E" }}>
              <th className="px-4 py-3 text-left text-sm font-semibold text-white sticky left-0"
                style={{ backgroundColor: "#1B2B5E", minWidth: "150px" }}>Employé</th>
              {dates.map(dateStr => {
                const d = new Date(dateStr + "T12:00:00");
                const estWE = [0, 6].includes(d.getDay());
                const estF = estFerie(dateStr);
                return (
                  <th key={dateStr} className="px-1 py-2 text-center text-xs font-semibold text-white"
                    style={{ minWidth: "36px", backgroundColor: estWE ? "#0f1d3e" : estF ? "#2d4a8a" : "#1B2B5E" }}>
                    <div>{["Di", "Lu", "Ma", "Me", "Je", "Ve", "Sa"][d.getDay()]}</div>
                    <div>{d.getDate()}</div>
                  </th>
                );
              })}
              <th className="px-3 py-3 text-center text-xs font-semibold text-white">Stats</th>
            </tr>
          </thead>
          <tbody>
            {employesAffichage.map((emp, idx) => {
              const stats = getStats(emp);
              return (
                <tr key={emp.id} style={{ borderBottom: "1px solid #E2E8F0" }}
                  className={idx % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                  <td className="px-4 py-2 sticky left-0 bg-white font-semibold text-sm"
                    style={{ color: "#1B2B5E", borderRight: "1px solid #E2E8F0" }}>
                    {emp.prenom} {emp.nom}
                    <span className="block text-xs text-gray-400 font-normal">{emp.taux_travail}%</span>
                  </td>
                  {dates.map(dateStr => {
                    const statut = getStatut(emp.id, dateStr);
                    const estWE = estWeekend(dateStr);
                    const estF = estFerie(dateStr);
                    const style = getStyle(statut, estWE);
                    const estActif = celluleActive?.employe_id === emp.id && celluleActive?.date === dateStr;
                    return (
                      <td key={dateStr} className="p-0.5 relative">
                        <button
                          onClick={() => setCelluleActive(estActif ? null : { employe_id: emp.id, date: dateStr })}
                          className="w-full h-8 rounded text-xs font-semibold transition"
                          style={{
                            backgroundColor: style.bg, color: style.text,
                            border: estActif ? "2px solid #4AAEA0" : estF ? "1px dashed #D97706" : "1px solid #E2E8F0",
                          }}>
                          {statut ? (STATUTS.find(s => s.val === statut)?.emoji ?? "") : estF ? "🎉" : ""}
                        </button>
                        {estActif && (
                          <div className="absolute z-50 top-9 left-0 bg-white rounded-xl shadow-xl border p-2"
                            style={{ minWidth: "160px" }}>
                            {STATUTS.map(s => (
                              <button key={s.val} onClick={() => changerStatut(emp.id, dateStr, s.val)}
                                className="w-full text-left px-3 py-1.5 rounded-lg text-xs font-semibold hover:opacity-80 mb-1"
                                style={{ backgroundColor: s.bg, color: s.text }}>
                                {s.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-xs text-center">
                    <div style={{ color: "#4AAEA0" }} className="font-bold">{stats.joursT}j ✅</div>
                    {stats.joursV  > 0 && <div style={{ color: "#CA8A04" }}>{stats.joursV}j 🏖️</div>}
                    {stats.joursFT > 0 && <div style={{ color: "#D97706" }}>{stats.joursFT}j 🎉</div>}
                    {stats.joursHS > 0 && <div style={{ color: "#2563EB" }}>{stats.joursHS}j ⏱️</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {celluleActive && (
        <div className="fixed inset-0 z-40" onClick={() => setCelluleActive(null)} />
      )}
    </div>
  );
}
