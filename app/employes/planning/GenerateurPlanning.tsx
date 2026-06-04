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
    const employesActifs = employes.filter(e => e.actif);
    const nbEmployesActifs = employesActifs.length;

    employes.forEach(emp => { nouveauPlanning[emp.id] = {}; });

    // Compteur weekends et jours consécutifs par employé
    const weekendsTravailles: Record<string, number> = {};
    const dernierJourTravaille: Record<string, string | null> = {};
    const joursConsecutifs: Record<string, number> = {};
    employesActifs.forEach(emp => {
      weekendsTravailles[emp.id] = 0;
      dernierJourTravaille[emp.id] = null;
      joursConsecutifs[emp.id] = 0;
    });

    // Grouper par semaine lundi→dimanche
    const semaines: string[][] = [];
    let semaineCourante: string[] = [];
    dates.forEach(dateStr => {
      const j = new Date(dateStr + "T12:00:00").getDay();
      if (j === 1 && semaineCourante.length > 0) {
        semaines.push(semaineCourante);
        semaineCourante = [];
      }
      semaineCourante.push(dateStr);
    });
    if (semaineCourante.length > 0) semaines.push(semaineCourante);

    // Traiter semaine par semaine
    semaines.forEach(semaine => {

      // ÉTAPE 1 : Statuts fixes (vacances, indispo)
      const statutsFixes: Record<string, Record<string, string>> = {};
      employesActifs.forEach(emp => {
        statutsFixes[emp.id] = {};
        semaine.forEach(d => {
          if (estEnVacances(emp.id, d)) statutsFixes[emp.id][d] = "vacances";
          else if (estIndispo(emp.id, d)) statutsFixes[emp.id][d] = "absent";
        });
      });

      // ÉTAPE 2 : Calculer les jours de travail de chaque employé
      const joursChoisis: Record<string, Set<string>> = {};

      employesActifs.forEach(emp => {
        joursChoisis[emp.id] = new Set();

        // Jours disponibles (pas fixés)
        const dispo = semaine.filter(d => !statutsFixes[emp.id][d]);

        // Jours à travailler selon le taux (sur 7 jours)
        const joursAFaire = Math.round(emp.taux_travail / 100 * 7);
        // Mais limité aux jours disponibles
        const nbTravail = Math.min(joursAFaire, dispo.length);
        const nbRepos = dispo.length - nbTravail;

        if (nbRepos <= 0) {
          // Tout travailler
          dispo.forEach(d => joursChoisis[emp.id].add(d));
          return;
        }

        // Trouver le meilleur bloc de repos consécutifs
        // Essayer de mettre les repos en bloc
        let meilleurBloc: string[] = [];
        let meilleurScore = -1;

        for (let debut = 0; debut <= dispo.length - nbRepos; debut++) {
          const bloc = dispo.slice(debut, debut + nbRepos);

          // Vérifier que le bloc est consécutif
          let estConsecutif = true;
          for (let i = 0; i < bloc.length - 1; i++) {
            const diff = (new Date(bloc[i + 1] + "T12:00:00").getTime() -
              new Date(bloc[i] + "T12:00:00").getTime()) / 86400000;
            if (diff > 1) { estConsecutif = false; break; }
          }

          if (estConsecutif) {
            // Score: préférer que les jours de travail soient en semaine
            const joursRestants = dispo.filter(d => !bloc.includes(d));
            const travailSemaine = joursRestants.filter(d => {
              const j = new Date(d + "T12:00:00").getDay();
              return j !== 0 && j !== 6;
            }).length;
            const score = travailSemaine;

            if (score > meilleurScore) {
              meilleurScore = score;
              meilleurBloc = bloc;
            }
          }
        }

        if (meilleurBloc.length === nbRepos) {
          // Travailler tout sauf le bloc de repos
          dispo.filter(d => !meilleurBloc.includes(d)).forEach(d => {
            joursChoisis[emp.id].add(d);
          });
        } else {
          // Pas de bloc consécutif possible → prendre les jours ouvrables d'abord
          const ouvrables = dispo.filter(d => {
            const j = new Date(d + "T12:00:00").getDay();
            return j !== 0 && j !== 6;
          });
          const we = dispo.filter(d => {
            const j = new Date(d + "T12:00:00").getDay();
            return j === 0 || j === 6;
          });
          ouvrables.slice(0, nbTravail).forEach(d => joursChoisis[emp.id].add(d));
          const reste = nbTravail - Math.min(ouvrables.length, nbTravail);
          if (reste > 0) we.slice(0, reste).forEach(d => joursChoisis[emp.id].add(d));
        }
      });

      // ÉTAPE 3 : Vérifier couverture minimale
      semaine.forEach(dateStr => {
        const jourSemaine = new Date(dateStr + "T12:00:00").getDay();
        const estWE = jourSemaine === 0 || jourSemaine === 6;
        const nbRequis = nbEmployesActifs >= 4 ? 2 : (estWE ? 1 : Math.min(2, nbEmployesActifs));

        const travaillent = employesActifs.filter(emp => joursChoisis[emp.id].has(dateStr));

        if (travaillent.length < nbRequis) {
          const manque = nbRequis - travaillent.length;
          // Forcer en priorité les employés avec le plus haut taux
          const candidats = employesActifs
            .filter(emp =>
              !joursChoisis[emp.id].has(dateStr) &&
              !statutsFixes[emp.id][dateStr]
            )
            .sort((a, b) => b.taux_travail - a.taux_travail);

          candidats.slice(0, manque).forEach(emp => {
            joursChoisis[emp.id].add(dateStr);
            if (estWE) weekendsTravailles[emp.id]++;
          });
        }
      });

      // ÉTAPE 4 : Vérifier max 6j consécutifs (en tenant compte des semaines précédentes)
      employesActifs.forEach(emp => {
        semaine.forEach(dateStr => {
          if (!joursChoisis[emp.id].has(dateStr)) return;

          const prev = dernierJourTravaille[emp.id];
          if (prev) {
            const diff = (new Date(dateStr + "T12:00:00").getTime() -
              new Date(prev + "T12:00:00").getTime()) / 86400000;
            if (diff === 1) {
              joursConsecutifs[emp.id]++;
            } else {
              joursConsecutifs[emp.id] = 1;
            }
          } else {
            joursConsecutifs[emp.id] = 1;
          }

          // Si trop de jours consécutifs → forcer un repos
          if (joursConsecutifs[emp.id] > 6) {
            joursChoisis[emp.id].delete(dateStr);
            joursConsecutifs[emp.id] = 0;
            // Vérifier couverture après suppression
            const jourSemaine = new Date(dateStr + "T12:00:00").getDay();
            const estWE = jourSemaine === 0 || jourSemaine === 6;
            const nbRequis = nbEmployesActifs >= 4 ? 2 : (estWE ? 1 : Math.min(2, nbEmployesActifs));
            const travaillent = employesActifs.filter(e => joursChoisis[e.id].has(dateStr));
            if (travaillent.length < nbRequis) {
              // Remplacer par quelqu'un d'autre
              const remplacant = employesActifs
                .filter(e =>
                  e.id !== emp.id &&
                  !joursChoisis[e.id].has(dateStr) &&
                  !statutsFixes[e.id][dateStr] &&
                  joursConsecutifs[e.id] < 6
                )
                .sort((a, b) => b.taux_travail - a.taux_travail)[0];
              if (remplacant) {
                joursChoisis[remplacant.id].add(dateStr);
              }
            }
            dernierJourTravaille[emp.id] = null;
          } else {
            dernierJourTravaille[emp.id] = dateStr;
          }
        });

        // Mettre à jour dernier jour si repos
        semaine.forEach(dateStr => {
          if (!joursChoisis[emp.id].has(dateStr) && !statutsFixes[emp.id][dateStr]) {
            joursConsecutifs[emp.id] = 0;
            dernierJourTravaille[emp.id] = null;
          }
        });
      });

      // ÉTAPE 5 : Appliquer le planning
      employesActifs.forEach(emp => {
        semaine.forEach(dateStr => {
          if (statutsFixes[emp.id][dateStr]) {
            nouveauPlanning[emp.id][dateStr] = {
              employe_id: emp.id, date: dateStr,
              statut: statutsFixes[emp.id][dateStr]
            };
            joursConsecutifs[emp.id] = 0;
            dernierJourTravaille[emp.id] = null;
          } else if (joursChoisis[emp.id].has(dateStr)) {
            nouveauPlanning[emp.id][dateStr] = {
              employe_id: emp.id, date: dateStr, statut: "travail"
            };
          } else {
            nouveauPlanning[emp.id][dateStr] = {
              employe_id: emp.id, date: dateStr, statut: "repos"
            };
            joursConsecutifs[emp.id] = 0;
            dernierJourTravaille[emp.id] = null;
          }
        });
      });
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
                          }}>
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