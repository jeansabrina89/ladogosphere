"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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

const STATUTS = [
  { val: "travail", label: "✅ Travail", bg: "#E8F5F4", text: "#4AAEA0" },
  { val: "repos", label: "😴 Repos", bg: "#F1F5F9", text: "#6B7280" },
  { val: "vacances", label: "🏖️ Vacances", bg: "#FEF9C3", text: "#CA8A04" },
  { val: "absent", label: "🚫 Absent", bg: "#FEE2E2", text: "#DC2626" },
  { val: "maladie", label: "🤒 Maladie", bg: "#FEE2E2", text: "#DC2626" },
  { val: "accident", label: "🤕 Accident", bg: "#FEE2E2", text: "#DC2626" },
  { val: "militaire", label: "🎖️ Militaire", bg: "#EDE9FE", text: "#7C3AED" },
  { val: "ferie_travaille", label: "🎉 Férié+1j", bg: "#FEF3C7", text: "#D97706" },
  { val: "heures_sup", label: "⏱️ Déd. H.sup", bg: "#DBEAFE", text: "#2563EB" },
  { val: "autre", label: "📋 Autre", bg: "#F1F5F9", text: "#6B7280" },
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
  employes,
  mois,
  annee,
  planningExistant,
  vacancesAcceptees,
  indisponibilites,
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
  const [celluleActive, setCelluleActive] = useState<{ employe_id: string; date: string } | null>(null);

  const joursParMois = new Date(annee, mois, 0).getDate();
  const joursFeries = getJoursFeries(annee);

  const [planning, setPlanning] = useState<Record<string, Record<string, JourPlanning>>>(() => {
    const init: Record<string, Record<string, JourPlanning>> = {};
    employes.forEach(emp => {
      init[emp.id] = {};
      planningExistant
        .filter(p => p.employe_id === emp.id)
        .forEach(p => { init[emp.id][p.date] = p; });
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
      const dateStr = `${annee}-${String(mois).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      dates.push(dateStr);
    }
    return dates;
  };

  const estWeekend = (dateStr: string) => {
    const j = new Date(dateStr + "T12:00:00").getDay();
    return j === 0 || j === 6;
  };

  const estFerie = (dateStr: string) => joursFeries.includes(dateStr);

  const estEnVacances = (employe_id: string, dateStr: string) => {
    return vacancesAcceptees.some(v =>
      v.employes_rh?.id === employe_id &&
      dateStr >= v.date_debut && dateStr <= v.date_fin
    );
  };

  const estIndispo = (employe_id: string, dateStr: string) => {
    return indisponibilites.some(i =>
      i.employe_id === employe_id && i.date === dateStr
    );
  };

  const getStatut = (employe_id: string, dateStr: string) => {
    return planning[employe_id]?.[dateStr]?.statut || null;
  };

  const getStyle = (statut: string | null, estWE: boolean) => {
    if (!statut) return { bg: estWE ? "#F8FAFC" : "white", text: "#CBD5E1" };
    const s = STATUTS.find(x => x.val === statut);
    return { bg: s?.bg || "white", text: s?.text || "#6B7280" };
  };

  const changerStatut = (employe_id: string, date: string, statut: string) => {
    setPlanning(prev => ({
      ...prev,
      [employe_id]: {
        ...prev[employe_id],
        [date]: { employe_id, date, statut },
      }
    }));
    setCelluleActive(null);
  };

  const generer = async () => {
    setLoading(true);
    const dates = getDates();
    const nouveauPlanning: Record<string, Record<string, JourPlanning>> = {};
    const nbEmployesActifs = employes.filter(e => e.actif).length;

    // Initialiser avec planning existant
    employes.forEach(emp => {
      nouveauPlanning[emp.id] = { ...planning[emp.id] };
    });

    // Compteurs weekends pour équilibrage
    const weekendsTravailles: Record<string, number> = {};
    employes.forEach(emp => { weekendsTravailles[emp.id] = 0; });

    // Jours théoriques par semaine par employé
    const joursParSemaine: Record<string, number> = {};
    employes.forEach(emp => {
      joursParSemaine[emp.id] = Math.round(emp.taux_travail / 100 * 5);
    });

    // Traiter jour par jour
    dates.forEach(dateStr => {
      const jourSemaine = new Date(dateStr + "T12:00:00").getDay();
      const estWE = jourSemaine === 0 || jourSemaine === 6;

      // Nombre de personnes requises
      // 1-3 employés: 1 personne toujours présente (2 en semaine si possible)
      // 4+ employés: 2 personnes toujours présentes
      const nbRequis = nbEmployesActifs >= 4 ? 2 : (estWE ? 1 : Math.min(2, nbEmployesActifs));

      // Compter jours déjà planifiés
      const joursDejaPlanifies: Record<string, number> = {};
      employes.forEach(emp => {
        joursDejaPlanifies[emp.id] = Object.values(nouveauPlanning[emp.id] || {})
          .filter(j => j.statut === "travail").length;
      });

      // D'abord assigner les statuts fixes (vacances, indispo)
      employes.forEach(emp => {
        if (nouveauPlanning[emp.id][dateStr]) return;
        if (!emp.actif) return;

        if (estEnVacances(emp.id, dateStr)) {
          nouveauPlanning[emp.id][dateStr] = { employe_id: emp.id, date: dateStr, statut: "vacances" };
        } else if (estIndispo(emp.id, dateStr)) {
          nouveauPlanning[emp.id][dateStr] = { employe_id: emp.id, date: dateStr, statut: "absent" };
        }
      });

      // Disponibles = actifs, pas en vacances, pas indispo, pas encore définis
      const dispos = employes.filter(emp => {
        if (!emp.actif) return false;
        const statut = nouveauPlanning[emp.id][dateStr]?.statut;
        if (statut) return false; // déjà défini
        return true;
      });

      // Déjà en travail
      const dejaTravaillent = employes.filter(emp =>
        nouveauPlanning[emp.id][dateStr]?.statut === "travail"
      );

      let placesRestantes = Math.max(0, nbRequis - dejaTravaillent.length);

      // Trier par priorité
      const disponiblesTries = [...dispos].sort((a, b) => {
        const aRestants = joursParSemaine[a.id] * 4 - joursDejaPlanifies[a.id];
        const bRestants = joursParSemaine[b.id] * 4 - joursDejaPlanifies[b.id];
        if (estWE) {
          // Weekend : favoriser ceux qui ont le moins de weekends
          return weekendsTravailles[a.id] - weekendsTravailles[b.id];
        }
        // Semaine : favoriser ceux qui ont le plus de jours restants
        return bRestants - aRestants;
      });

      disponiblesTries.forEach(emp => {
        const restants = joursParSemaine[emp.id] * 4 - joursDejaPlanifies[emp.id];

        if (placesRestantes > 0 && restants > 0) {
          nouveauPlanning[emp.id][dateStr] = { employe_id: emp.id, date: dateStr, statut: "travail" };
          joursDejaPlanifies[emp.id]++;
          if (estWE) weekendsTravailles[emp.id]++;
          placesRestantes--;
        } else {
          nouveauPlanning[emp.id][dateStr] = { employe_id: emp.id, date: dateStr, statut: "repos" };
        }
      });

      // Si personne n'est disponible mais il faut quand même quelqu'un
      // → forcer le premier actif disponible (hors vacances)
      const travaillentAuj = employes.filter(emp =>
        nouveauPlanning[emp.id][dateStr]?.statut === "travail"
      );
      if (travaillentAuj.length === 0) {
        const forceable = employes.find(emp =>
          emp.actif &&
          nouveauPlanning[emp.id][dateStr]?.statut === "repos"
        );
        if (forceable) {
          nouveauPlanning[forceable.id][dateStr] = {
            employe_id: forceable.id, date: dateStr, statut: "travail"
          };
          if (estWE) weekendsTravailles[forceable.id]++;
        }
      }
    });

    setPlanning(nouveauPlanning);
    setLoading(false);
  };

  const sauvegarder = async () => {
    setSaving(true);
    const lignes: JourPlanning[] = [];
    Object.values(planning).forEach(empPlanning => {
      Object.values(empPlanning).forEach(jour => {
        if (jour.statut) lignes.push(jour);
      });
    });

    await fetch("/api/rh/planning", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lignes }),
    });

    setSaving(false);
    router.refresh();
  };

  const dates = getDates();

  const getStats = (emp: Employe) => {
    const p = planning[emp.id] || {};
    const joursT = Object.values(p).filter(j => j.statut === "travail").length;
    const joursV = Object.values(p).filter(j => j.statut === "vacances").length;
    const joursHS = Object.values(p).filter(j => j.statut === "heures_sup").length;
    const joursFT = Object.values(p).filter(j => j.statut === "ferie_travaille").length;
    return { joursT, joursV, joursHS, joursFT };
  };

  return (
    <div>
      {/* Navigation mois */}
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

      {/* Boutons */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <button onClick={generer} disabled={loading}
          className="px-6 py-3 rounded-xl font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: "#4AAEA0" }}>
          {loading ? "Génération..." : "⚡ Générer automatiquement"}
        </button>
        <button onClick={sauvegarder} disabled={saving}
          className="px-6 py-3 rounded-xl font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: "#1B2B5E" }}>
          {saving ? "Sauvegarde..." : "💾 Sauvegarder"}
        </button>
      </div>

      {/* Légende */}
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

      {/* Tableau planning */}
      <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr style={{ backgroundColor: "#1B2B5E" }}>
              <th className="px-4 py-3 text-left text-sm font-semibold text-white sticky left-0"
                style={{ backgroundColor: "#1B2B5E", minWidth: "150px" }}>
                Employé
              </th>
              {dates.map(dateStr => {
                const d = new Date(dateStr + "T12:00:00");
                const estWE = d.getDay() === 0 || d.getDay() === 6;
                const estF = estFerie(dateStr);
                return (
                  <th key={dateStr}
                    className="px-1 py-2 text-center text-xs font-semibold text-white"
                    style={{
                      minWidth: "36px",
                      backgroundColor: estWE ? "#0f1d3e" : estF ? "#2d4a8a" : "#1B2B5E"
                    }}>
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
                            backgroundColor: style.bg,
                            color: style.text,
                            border: estActif ? "2px solid #4AAEA0" : estF ? "1px dashed #D97706" : "1px solid #E2E8F0",
                          }}
                          title={statut || (estF ? "Jour férié" : estWE ? "Weekend" : "")}>
                          {statut ? STATUTS.find(s => s.val === statut)?.label.split(" ")[0] : estF ? "🎉" : ""}
                        </button>

                        {estActif && (
                          <div className="absolute z-50 top-9 left-0 bg-white rounded-xl shadow-xl border p-2"
                            style={{ minWidth: "160px" }}>
                            {STATUTS.map(s => (
                              <button key={s.val}
                                onClick={() => changerStatut(emp.id, dateStr, s.val)}
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
                    {stats.joursV > 0 && <div style={{ color: "#CA8A04" }}>{stats.joursV}j 🏖️</div>}
                    {stats.joursHS > 0 && <div style={{ color: "#2563EB" }}>{stats.joursHS}j ⏱️</div>}
                    {stats.joursFT > 0 && <div style={{ color: "#D97706" }}>{stats.joursFT}j 🎉</div>}
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