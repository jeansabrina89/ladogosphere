"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { sauvegarderPlanning } from "./actions";
import BoutonPdf from "./BoutonPdf";
import { joursTravaillesSemaine } from "../../../src/lib/planningUtils";

type Employe = {
  id: string;
  prenom: string;
  nom: string;
  taux_travail: number;
  email: string;
  actif: boolean;
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
    const dates = getDates();
    const nouveauPlanning: Record<string, Record<string, JourPlanning>> = {};
    const employesActifs = employes.filter(e => e.actif);

    employes.forEach(emp => { nouveauPlanning[emp.id] = {}; });

    const semaines: string[][] = [];
    let semaineCourante: string[] = [];
    dates.forEach(dateStr => {
      const j = new Date(dateStr + "T12:00:00").getDay();
      if (j === 1 && semaineCourante.length > 0) { semaines.push(semaineCourante); semaineCourante = []; }
      semaineCourante.push(dateStr);
    });
    if (semaineCourante.length > 0) semaines.push(semaineCourante);

    // Rang de déphasage par employé : index parmi les collègues de même taux (tri déterministe par id)
    // Pour un taux entier le décalage est neutre ; pour un taux .5 il inverse la parité → totaux stables
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

    semaines.forEach((semaine, idxSemaine) => {
      const fixes: Record<string, Record<string, string>> = {};
      employesActifs.forEach(emp => {
        fixes[emp.id] = {};
        semaine.forEach(d => {
          if (estEnVacances(emp.id, d)) fixes[emp.id][d] = "vacances";
          else if (estIndispo(emp.id, d)) fixes[emp.id][d] = "absent";
        });
      });

      // Trier : repos décroissant (taux croissant) → les plus contraints d'abord
      const empOrdres = [...employesActifs].sort((a, b) => a.taux_travail - b.taux_travail);

      // Compteur de présence : nb d'employés au travail chaque jour
      const presence: Record<string, number> = {};
      semaine.forEach(d => { presence[d] = 0; });

      const joursChoisis: Record<string, Set<string>> = {};
      employesActifs.forEach(emp => { joursChoisis[emp.id] = new Set(); });

      // Score d'un décalage de bloc de repos : somme des carrés de présence après ajout.
      // Minimiser → remplit les creux, évite les pics → couverture plate autour de 2.
      const scorerOffset = (joursLibres: string[], reposCount: number, offset: number): number => {
        const n = joursLibres.length;
        const reposPos = new Set<number>();
        for (let i = 0; i < reposCount; i++) reposPos.add((offset + i) % n);
        const travailDays = new Set<string>(joursLibres.filter((_, i) => !reposPos.has(i)));
        let score = 0;
        semaine.forEach(d => { score += (presence[d] + (travailDays.has(d) ? 1 : 0)) ** 2; });
        return score;
      };

      const choisirOffset = (joursLibres: string[], cible_actual: number): number => {
        const n = joursLibres.length;
        const reposCount = n - cible_actual;
        // Par défaut idxSemaine % n pour varier d'une semaine à l'autre en cas d'ex-aequo
        let bestOffset = idxSemaine % Math.max(1, n);
        let bestScore = Infinity;
        for (let off = 0; off < n; off++) {
          const s = scorerOffset(joursLibres, reposCount, off);
          if (s < bestScore) { bestScore = s; bestOffset = off; }
        }
        return bestOffset;
      };

      const appliquerOffset = (emp: Employe, joursLibres: string[], cible_actual: number, offset: number) => {
        const n = joursLibres.length;
        const reposCount = n - cible_actual;
        const reposPos = new Set<number>();
        for (let i = 0; i < reposCount; i++) reposPos.add((offset + i) % n);
        joursLibres.forEach((d, idx) => {
          if (!reposPos.has(idx)) { joursChoisis[emp.id].add(d); presence[d]++; }
        });
      };

      // Placement initial : chaque employé choisit le décalage qui équilibre le mieux
      empOrdres.forEach(emp => {
        const cible = joursTravaillesSemaine(emp.taux_travail, idxSemaine + rangDephasage[emp.id]);
        const joursLibres = semaine.filter(d => !fixes[emp.id][d]);
        const n = joursLibres.length;
        if (n === 0) return;
        const cible_actual = Math.min(cible, n);
        if (cible_actual >= n) {
          joursLibres.forEach(d => { joursChoisis[emp.id].add(d); presence[d]++; });
        } else {
          appliquerOffset(emp, joursLibres, cible_actual, choisirOffset(joursLibres, cible_actual));
        }
      });

      // 2 passes de ré-optimisation pour stabiliser l'équilibre global
      for (let pass = 0; pass < 2; pass++) {
        empOrdres.forEach(emp => {
          const cible = joursTravaillesSemaine(emp.taux_travail, idxSemaine + rangDephasage[emp.id]);
          const joursLibres = semaine.filter(d => !fixes[emp.id][d]);
          const n = joursLibres.length;
          if (n === 0) return;
          const cible_actual = Math.min(cible, n);
          if (cible_actual >= n) return;
          // Retirer la contribution actuelle, puis réoptimiser
          joursChoisis[emp.id].forEach(d => { presence[d]--; });
          joursChoisis[emp.id] = new Set();
          appliquerOffset(emp, joursLibres, cible_actual, choisirOffset(joursLibres, cible_actual));
        });
      }

      semaine.forEach(dateStr => {
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

      employesActifs.forEach(emp => {
        semaine.forEach(dateStr => {
          if (fixes[emp.id][dateStr]) {
            nouveauPlanning[emp.id][dateStr] = {
              employe_id: emp.id, date: dateStr, statut: fixes[emp.id][dateStr]
            };
          } else if (joursChoisis[emp.id].has(dateStr)) {
            // Jour férié travaillé → 'ferie_travaille' ; sinon 'travail'
            const estJourFerie = joursFeries.includes(dateStr);
            nouveauPlanning[emp.id][dateStr] = {
              employe_id: emp.id,
              date: dateStr,
              statut: estJourFerie ? "ferie_travaille" : "travail"
            };
          } else {
            nouveauPlanning[emp.id][dateStr] = {
              employe_id: emp.id, date: dateStr, statut: "repos"
            };
          }
        });
      });
    });

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
        <BoutonPdf mois={mois} annee={annee} />
      </div>

      {erreurSave && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-100 text-red-700 text-sm font-semibold">
          ❌ Erreur : {erreurSave}
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
            {employes.filter(e => e.actif).map((emp, idx) => {
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
