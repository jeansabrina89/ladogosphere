"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { JourDecompte } from "@/src/lib/decompteHeures";

// ── Types ─────────────────────────────────────────────────────────────────────

type TimbrageRow = {
  date: string;
  type_absence: string | null;
  heure_debut_matin: string | null;
  heure_fin_matin: string | null;
  heure_debut_aprem: string | null;
  heure_fin_aprem: string | null;
  valide_admin: boolean | null;
  note: string | null;
};

type PlanningRow = { date: string; statut: string };
type BadgeInfo = { label: string; bg: string; text: string };

// ── Helpers visuels ───────────────────────────────────────────────────────────

const JOURS_FR = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MOIS_FR  = ["janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

function formatDateFr(d: string): string {
  const dt = new Date(d + "T12:00:00");
  return `${JOURS_FR[dt.getDay()]} ${dt.getDate()} ${MOIS_FR[dt.getMonth()]} ${dt.getFullYear()}`;
}

function calculerDuree(debut: string | null, fin: string | null): number {
  if (!debut || !fin) return 0;
  const [hD, mD] = debut.split(":").map(Number);
  const [hF, mF] = fin.split(":").map(Number);
  return (hF * 60 + mF - (hD * 60 + mD)) / 60;
}

function labelStatutCourt(s: string): string {
  const M: Record<string, string> = {
    travail: "Travail", ferie_travaille: "Ferie+", repos: "Repos",
    repos_vacances: "RV", vacances: "Vac.", absent: "Absent",
    maladie: "Maladie", accident: "Accident", militaire: "Milit.",
    heures_sup: "H.sup", autre: "Autre",
  };
  return M[s] ?? s;
}

// Fond de la CASE selon le statut planning (doux, pour laisser respirer le badge)
function bgCaseStatut(s: string | null, estWeekend: boolean): string {
  if (!s) return estWeekend ? "#F8FAFC" : "#FFFFFF";
  const M: Record<string, string> = {
    repos: "#F8FAFC", repos_vacances: "#FFFBEB", vacances: "#FEF9C3",
    ferie_travaille: "#F0FDF4", absent: "#FFF5F5", maladie: "#FFF5F5",
    accident: "#FFF5F5", militaire: "#F5F3FF", heures_sup: "#EFF6FF",
  };
  return M[s] ?? "#FFFFFF";
}

// Mini pastille statut (ultra-petite dans la case)
function bgPillStatut(s: string): string {
  const M: Record<string, string> = {
    travail: "#E8F5F4", ferie_travaille: "#DCFCE7", repos: "#F1F5F9",
    repos_vacances: "#FFFBEB", vacances: "#FEF9C3", absent: "#FEE2E2",
    maladie: "#FEE2E2", accident: "#FEE2E2", militaire: "#EDE9FE",
    heures_sup: "#DBEAFE", autre: "#F1F5F9",
  };
  return M[s] ?? "#F1F5F9";
}
function textPillStatut(s: string): string {
  const M: Record<string, string> = {
    travail: "#4AAEA0", ferie_travaille: "#16A34A", repos: "#6B7280",
    repos_vacances: "#D97706", vacances: "#CA8A04", absent: "#DC2626",
    maladie: "#DC2626", accident: "#DC2626", militaire: "#7C3AED",
    heures_sup: "#2563EB", autre: "#6B7280",
  };
  return M[s] ?? "#9CA3AF";
}

// Badge principal (état timbrage)
function getBadge(
  statut: string | null,
  t: TimbrageRow | null,
  j: JourDecompte | null,
  estFutur: boolean,
): BadgeInfo | null {
  if (estFutur) return { label: "à venir", bg: "#F1F5F9", text: "#94A3B8" };

  // Timbrage avec heures réelles
  if (t && !t.type_absence) {
    const h = calculerDuree(t.heure_debut_matin, t.heure_fin_matin)
            + calculerDuree(t.heure_debut_aprem, t.heure_fin_aprem);
    return { label: `✓ ${h.toFixed(1)}h`, bg: "#DCFCE7", text: "#16A34A" };
  }

  // Timbrage d'absence
  if (t && t.type_absence) {
    const LABELS: Record<string, string> = {
      maladie: "Maladie", accident: "Accident", militaire: "Militaire",
      vacances: "Vacances", autre: "Autre",
    };
    const COLORS: Record<string, { bg: string; text: string }> = {
      vacances:  { bg: "#FEF9C3", text: "#CA8A04" },
      maladie:   { bg: "#FEE2E2", text: "#DC2626" },
      accident:  { bg: "#FEE2E2", text: "#DC2626" },
      militaire: { bg: "#EDE9FE", text: "#7C3AED" },
      autre:     { bg: "#F1F5F9", text: "#6B7280" },
    };
    const c = COLORS[t.type_absence] ?? { bg: "#F1F5F9", text: "#6B7280" };
    return { label: LABELS[t.type_absence] ?? t.type_absence, ...c };
  }

  // Aucun timbrage — détermine le badge via decompte ou statut
  if (j && j.du > 0) {
    // Jour de travail passé sans timbrage → "À compléter"
    return { label: "À compléter", bg: "#FEF3C7", text: "#D97706" };
  }
  if (statut === "repos" || statut === "repos_vacances") {
    return { label: "Repos", bg: "#F1F5F9", text: "#9CA3AF" };
  }
  if (statut === "vacances") {
    return { label: "Vacances", bg: "#FEF9C3", text: "#CA8A04" };
  }
  return null;
}

// ── FormPanel ─────────────────────────────────────────────────────────────────

function FormPanel({
  empId, date, timbrage, onClose, onSaved,
}: {
  empId: string;
  date: string;
  timbrage: TimbrageRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [mode, setMode] = useState<"travail" | "absence">(
    timbrage?.type_absence ? "absence" : "travail"
  );
  const [hdm, setHdm] = useState(timbrage?.heure_debut_matin?.slice(0, 5) ?? "07:30");
  const [hfm, setHfm] = useState(timbrage?.heure_fin_matin?.slice(0, 5)   ?? "12:00");
  const [hda, setHda] = useState(timbrage?.heure_debut_aprem?.slice(0, 5) ?? "14:30");
  const [hfa, setHfa] = useState(timbrage?.heure_fin_aprem?.slice(0, 5)   ?? "18:30");
  const [typeAbs, setTypeAbs]       = useState(timbrage?.type_absence ?? "maladie");
  const [note, setNote]             = useState(timbrage?.note ?? "");
  const [valideAdmin, setValideAdmin] = useState(timbrage?.valide_admin ?? false);
  const [loading, setLoading]         = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [erreur, setErreur]           = useState<string | null>(null);

  const matin = calculerDuree(hdm, hfm);
  const aprem = calculerDuree(hda, hfa);

  const handleSave = async () => {
    setLoading(true);
    setErreur(null);
    const body = mode === "travail"
      ? { employe_id: empId, date,
          heure_debut_matin: hdm, heure_fin_matin: hfm,
          heure_debut_aprem: hda, heure_fin_aprem: hfa,
          type_absence: null, note: note || null, valide_admin: valideAdmin }
      : { employe_id: empId, date,
          heure_debut_matin: null, heure_fin_matin: null,
          heure_debut_aprem: null, heure_fin_aprem: null,
          type_absence: typeAbs, note: note || null, valide_admin: valideAdmin };

    const res = await fetch("/api/rh/timbrage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErreur(data.error ?? "Erreur lors de l'enregistrement");
      setLoading(false);
      return;
    }
    setLoading(false);
    onSaved();
  };

  const handleDelete = async () => {
    if (!window.confirm(`Supprimer le timbrage du ${date} ?`)) return;
    setDeleteLoading(true);
    const res = await fetch("/api/rh/timbrage", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employe_id: empId, date }),
    });
    setDeleteLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErreur(data.error ?? "Erreur lors de la suppression");
      return;
    }
    onSaved();
  };

  const inp = "w-full border border-gray-200 rounded-xl p-2 text-sm";
  const modeBtn = (m: "travail" | "absence", label: string, color: string) => (
    <button type="button" onClick={() => setMode(m)}
      className="flex-1 py-2 rounded-xl font-semibold text-sm border-2 transition"
      style={{
        borderColor: mode === m ? color : "#E2E8F0",
        backgroundColor: mode === m ? color : "white",
        color: mode === m ? "white" : "#1B2B5E",
      }}>
      {label}
    </button>
  );

  return (
    <div className="p-4">
      {erreur && (
        <div className="bg-red-100 text-red-700 px-3 py-2 rounded-xl text-sm mb-3">❌ {erreur}</div>
      )}

      <div className="flex gap-3 mb-4">
        {modeBtn("travail", "✅ Travail", "#4AAEA0")}
        {modeBtn("absence", "🏥 Absence", "#E8847A")}
      </div>

      {mode === "travail" ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Début matin</label>
            <input type="time" value={hdm} onChange={e => setHdm(e.target.value)} className={inp} />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Fin matin</label>
            <input type="time" value={hfm} onChange={e => setHfm(e.target.value)} className={inp} />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Début après-midi</label>
            <input type="time" value={hda} onChange={e => setHda(e.target.value)} className={inp} />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Fin après-midi</label>
            <input type="time" value={hfa} onChange={e => setHfa(e.target.value)} className={inp} />
          </div>
          <p className="col-span-full text-right text-sm font-semibold" style={{ color: "#4AAEA0" }}>
            {matin.toFixed(1)}h + {aprem.toFixed(1)}h = <strong>{(matin + aprem).toFixed(1)}h</strong>
          </p>
        </div>
      ) : (
        <div className="mb-4">
          <label className="text-xs text-gray-500 block mb-1">Type d'absence</label>
          <select value={typeAbs} onChange={e => setTypeAbs(e.target.value)} className={inp}>
            <option value="maladie">🤒 Maladie</option>
            <option value="accident">🤕 Accident</option>
            <option value="militaire">🎖️ Service militaire</option>
            <option value="vacances">🏖️ Vacances</option>
            <option value="autre">📋 Autre</option>
          </select>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        <div>
          <label className="text-xs text-gray-500 block mb-1">Note (optionnelle)</label>
          <input type="text" value={note} onChange={e => setNote(e.target.value)}
            placeholder="Remarque…" className={inp} />
        </div>
        <div className="flex items-center gap-3 pt-5">
          <input type="checkbox" id={`va-${date}`} checked={valideAdmin}
            onChange={e => setValideAdmin(e.target.checked)}
            className="w-4 h-4 accent-teal-600" />
          <label htmlFor={`va-${date}`} className="text-sm font-semibold" style={{ color: "#1B2B5E" }}>
            Validé par l'admin
          </label>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <button type="button" onClick={handleSave} disabled={loading}
          className="px-5 py-2 rounded-xl font-semibold text-white text-sm disabled:opacity-50"
          style={{ backgroundColor: "#4AAEA0" }}>
          {loading ? "Enregistrement…" : timbrage ? "💾 Modifier" : "💾 Enregistrer"}
        </button>
        {timbrage && (
          <button type="button" onClick={handleDelete} disabled={deleteLoading}
            className="px-5 py-2 rounded-xl font-semibold text-sm disabled:opacity-50"
            style={{ backgroundColor: "#FEE2E2", color: "#DC2626" }}>
            {deleteLoading ? "…" : "🗑 Supprimer"}
          </button>
        )}
        <button type="button" onClick={onClose}
          className="px-5 py-2 rounded-xl font-semibold text-sm"
          style={{ backgroundColor: "#EDE8DF", color: "#1B2B5E" }}>
          Annuler
        </button>
      </div>
    </div>
  );
}

// ── Calendrier principal ──────────────────────────────────────────────────────

export default function TimbrageAdminTable({
  empId, annee, mois, moisPad, aujourd_hui,
  planningData, timbragesData, joursDecompte,
}: {
  empId: string;
  annee: number;
  mois: number;
  moisPad: string;
  aujourd_hui: string;
  planningData: PlanningRow[];
  timbragesData: TimbrageRow[];
  joursDecompte: JourDecompte[];
}) {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [validerLoading, setValiderLoading] = useState(false);
  const [validerErreur, setValiderErreur] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  // Scroll vers le formulaire quand une case est ouverte
  useEffect(() => {
    if (selectedDate && formRef.current) {
      const id = setTimeout(() => {
        formRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 60);
      return () => clearTimeout(id);
    }
  }, [selectedDate]);

  const handleToutValider = async () => {
    const moisStr = `${annee}-${moisPad}`;
    if (!window.confirm(`Valider tous les timbrages du mois ${moisStr} pour cet employé ?`)) return;
    setValiderLoading(true);
    setValiderErreur(null);
    const res = await fetch("/api/rh/timbrage", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employe_id: empId, mois: moisStr }),
    });
    setValiderLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setValiderErreur(data.error ?? "Erreur réseau");
      return;
    }
    router.refresh();
  };

  // Index par date
  const planningParDate: Record<string, string> = {};
  planningData.forEach(p => { planningParDate[p.date] = p.statut; });

  const timbragesParDate: Record<string, TimbrageRow> = {};
  timbragesData.forEach(t => { timbragesParDate[t.date] = t; });

  const decompteParDate: Record<string, JourDecompte> = {};
  joursDecompte.forEach(j => { decompteParDate[j.date] = j; });

  // Décalage de la grille (lundi = 0)
  const nbJours = new Date(annee, mois, 0).getDate();
  const jourSemaine1 = new Date(`${annee}-${moisPad}-01T12:00:00`).getDay();
  const offset = jourSemaine1 === 0 ? 6 : jourSemaine1 - 1;

  return (
    <div>
      {/* ── Bouton tout valider ── */}
      <div className="flex justify-end items-center gap-3 mb-3">
        {validerErreur && (
          <span className="text-xs text-red-500 font-semibold">❌ {validerErreur}</span>
        )}
        <button type="button" onClick={handleToutValider} disabled={validerLoading}
          className="px-4 py-2 rounded-xl font-semibold text-white text-sm disabled:opacity-50"
          style={{ backgroundColor: "#16A34A" }}>
          {validerLoading ? "En cours…" : "✓ Tout valider le mois"}
        </button>
      </div>

      {/* ── Grille calendrier ── */}
      <div className="bg-white rounded-xl shadow-sm p-3 md:p-4">
        <div className="overflow-x-auto">
          <div style={{ minWidth: "480px" }}>

            {/* Entêtes jours */}
            <div className="grid grid-cols-7 gap-1 mb-1">
              {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map(d => (
                <div key={d} className="text-center text-xs font-semibold text-gray-400 py-2">{d}</div>
              ))}
            </div>

            {/* Cases */}
            <div className="grid grid-cols-7 gap-1">
              {/* Cases vides avant le 1er */}
              {Array.from({ length: offset }, (_, i) => (
                <div key={`v${i}`} />
              ))}

              {/* Jours du mois */}
              {Array.from({ length: nbJours }, (_, i) => {
                const jour = i + 1;
                const dateStr = `${annee}-${moisPad}-${String(jour).padStart(2, "0")}`;
                const jSem = new Date(dateStr + "T12:00:00").getDay();
                const estWeekend   = jSem === 0 || jSem === 6;
                const estFutur     = dateStr > aujourd_hui;
                const estAujourdhui = dateStr === aujourd_hui;
                const estSelectionne = selectedDate === dateStr;

                const statut = planningParDate[dateStr] ?? null;
                const t = timbragesParDate[dateStr] ?? null;
                const j = decompteParDate[dateStr] ?? null;
                const badge = getBadge(statut, t, j, estFutur);

                let bg = bgCaseStatut(statut, estWeekend);
                if (estSelectionne) bg = "#E8F5F4";

                const borderStyle = estSelectionne
                  ? "2px solid #4AAEA0"
                  : estAujourdhui
                    ? "2px solid #64748B"
                    : "1px solid #E2E8F0";

                return (
                  <div
                    key={dateStr}
                    onClick={() => setSelectedDate(estSelectionne ? null : dateStr)}
                    className="rounded-xl p-2 cursor-pointer flex flex-col transition-all hover:shadow-md select-none"
                    style={{
                      backgroundColor: bg,
                      border: borderStyle,
                      opacity: estFutur ? 0.6 : 1,
                      minHeight: "80px",
                    }}
                  >
                    {/* Numéro du jour + indicateur non-validé */}
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-sm font-bold leading-none"
                        style={{ color: estAujourdhui ? "#4AAEA0" : estWeekend ? "#94A3B8" : "#1B2B5E" }}>
                        {jour}
                      </span>
                      {t?.valide_admin === false && (
                        <span style={{ fontSize: "10px", color: "#F97316", lineHeight: 1 }}
                          title="Non validé par l'admin">⚠</span>
                      )}
                    </div>

                    {/* Statut planning (micro-pill) */}
                    {statut && (
                      <span style={{
                        fontSize: "9px", padding: "1px 4px", borderRadius: "999px",
                        backgroundColor: bgPillStatut(statut),
                        color: textPillStatut(statut),
                        fontWeight: 600, display: "inline-block",
                        marginBottom: "3px", alignSelf: "flex-start", lineHeight: "1.4",
                      }}>
                        {labelStatutCourt(statut)}
                      </span>
                    )}

                    {/* Badge timbrage */}
                    {badge && (
                      <span style={{
                        fontSize: "10px", padding: "2px 5px", borderRadius: "999px",
                        backgroundColor: badge.bg, color: badge.text,
                        fontWeight: 700, display: "inline-block",
                        alignSelf: "flex-start", lineHeight: "1.4",
                      }}>
                        {badge.label}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── Légende ── */}
      <div className="flex flex-wrap gap-2 mt-3 px-1 items-center">
        {[
          { label: "✓ Xh Fait",   bg: "#DCFCE7", text: "#16A34A" },
          { label: "À compléter", bg: "#FEF3C7", text: "#D97706" },
          { label: "Absence",     bg: "#FEE2E2", text: "#DC2626" },
          { label: "Repos",       bg: "#F1F5F9", text: "#9CA3AF" },
          { label: "Vacances",    bg: "#FEF9C3", text: "#CA8A04" },
          { label: "à venir",     bg: "#F1F5F9", text: "#94A3B8" },
        ].map(item => (
          <span key={item.label} style={{
            fontSize: "11px", padding: "2px 8px", borderRadius: "999px",
            backgroundColor: item.bg, color: item.text, fontWeight: 600,
          }}>
            {item.label}
          </span>
        ))}
        <span className="text-xs text-orange-400 font-semibold">⚠ = non validé</span>
        <span className="text-xs text-gray-400 ml-2">Cliquez une case pour modifier</span>
      </div>

      {/* ── Panneau de formulaire ── */}
      {selectedDate && (
        <div ref={formRef} className="mt-4 bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 flex justify-between items-center"
            style={{ backgroundColor: "#1B2B5E" }}>
            <h3 className="font-bold text-white text-sm capitalize">
              ✏️ {formatDateFr(selectedDate)}
              {timbragesParDate[selectedDate] ? " — modifier" : " — nouveau timbrage"}
            </h3>
            <button type="button" onClick={() => setSelectedDate(null)}
              className="text-white text-xl font-bold leading-none opacity-70 hover:opacity-100">
              ×
            </button>
          </div>
          <FormPanel
            key={selectedDate}
            empId={empId}
            date={selectedDate}
            timbrage={timbragesParDate[selectedDate] ?? null}
            onClose={() => setSelectedDate(null)}
            onSaved={() => { setSelectedDate(null); router.refresh(); }}
          />
        </div>
      )}
    </div>
  );
}
