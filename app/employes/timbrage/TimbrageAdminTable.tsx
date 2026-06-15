"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import type { JourDecompte } from "../../../src/lib/decompteHeures";

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

// ── Helpers visuels ──────────────────────────────────────────────────────────

const NOMS_JOURS = ["Di", "Lu", "Ma", "Me", "Je", "Ve", "Sa"];

function labelStatut(s: string | null): string {
  const MAP: Record<string, string> = {
    travail: "Travail", ferie_travaille: "Ferie+", repos: "Repos",
    repos_vacances: "RV", vacances: "Vacances", absent: "Absent",
    maladie: "Maladie", accident: "Accident", militaire: "Militaire",
    heures_sup: "H.sup", autre: "Autre",
  };
  return s ? (MAP[s] ?? s) : "—";
}
function bgStatut(s: string | null): string {
  const MAP: Record<string, string> = {
    travail: "#E8F5F4", ferie_travaille: "#FEF3C7", repos: "#F1F5F9",
    repos_vacances: "#FFFBEB", vacances: "#FEF9C3",
    absent: "#FEE2E2", maladie: "#FEE2E2", accident: "#FEE2E2",
    militaire: "#EDE9FE", heures_sup: "#DBEAFE", autre: "#F1F5F9",
  };
  return s ? (MAP[s] ?? "#F1F5F9") : "#F1F5F9";
}
function textStatut(s: string | null): string {
  const MAP: Record<string, string> = {
    travail: "#4AAEA0", ferie_travaille: "#D97706", repos: "#6B7280",
    repos_vacances: "#D97706", vacances: "#CA8A04",
    absent: "#DC2626", maladie: "#DC2626", accident: "#DC2626",
    militaire: "#7C3AED", heures_sup: "#2563EB", autre: "#6B7280",
  };
  return s ? (MAP[s] ?? "#9CA3AF") : "#9CA3AF";
}
function labelAbsence(t: string | null): string {
  const MAP: Record<string, string> = {
    maladie: "Maladie", accident: "Accident", militaire: "Militaire",
    vacances: "Vacances", autre: "Autre",
  };
  return t ? (MAP[t] ?? t) : "";
}

function calculerDuree(d: string, f: string): number {
  if (!d || !f) return 0;
  const [hD, mD] = d.split(":").map(Number);
  const [hF, mF] = f.split(":").map(Number);
  return (hF * 60 + mF - (hD * 60 + mD)) / 60;
}

// ── FormPanel (formulaire inline édition/création) ────────────────────────────

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
  const [typeAbs, setTypeAbs] = useState(timbrage?.type_absence ?? "maladie");
  const [note, setNote] = useState(timbrage?.note ?? "");
  const [valideAdmin, setValideAdmin] = useState(timbrage?.valide_admin ?? false);
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const totalMatin = calculerDuree(hdm, hfm);
  const totalAprem = calculerDuree(hda, hfa);
  const total = totalMatin + totalAprem;

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

  const inputCls = "w-full border border-gray-200 rounded-xl p-2 text-sm";
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
    <div className="p-4 border-t border-gray-100" style={{ backgroundColor: "#F0FAF9" }}>
      {erreur && (
        <div className="bg-red-100 text-red-700 px-3 py-2 rounded-xl text-sm mb-3">❌ {erreur}</div>
      )}

      <div className="flex gap-3 mb-4">
        {modeBtn("travail",  "✅ Travail",  "#4AAEA0")}
        {modeBtn("absence",  "🏥 Absence",  "#E8847A")}
      </div>

      {mode === "travail" ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Début matin</label>
            <input type="time" value={hdm} onChange={e => setHdm(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Fin matin</label>
            <input type="time" value={hfm} onChange={e => setHfm(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Début après-midi</label>
            <input type="time" value={hda} onChange={e => setHda(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Fin après-midi</label>
            <input type="time" value={hfa} onChange={e => setHfa(e.target.value)} className={inputCls} />
          </div>
          <p className="col-span-full text-right text-sm font-semibold" style={{ color: "#4AAEA0" }}>
            {totalMatin.toFixed(1)}h + {totalAprem.toFixed(1)}h = <strong>{total.toFixed(1)}h</strong>
          </p>
        </div>
      ) : (
        <div className="mb-4">
          <label className="text-xs text-gray-500 block mb-1">Type d'absence</label>
          <select value={typeAbs} onChange={e => setTypeAbs(e.target.value)}
            className={inputCls}>
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
            placeholder="Remarque…" className={inputCls} />
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

      <div className="flex gap-2">
        <button type="button" onClick={handleSave} disabled={loading}
          className="px-5 py-2 rounded-xl font-semibold text-white text-sm disabled:opacity-50"
          style={{ backgroundColor: "#4AAEA0" }}>
          {loading ? "Enregistrement…" : timbrage ? "💾 Modifier" : "💾 Enregistrer"}
        </button>
        <button type="button" onClick={onClose}
          className="px-5 py-2 rounded-xl font-semibold text-sm"
          style={{ backgroundColor: "#EDE8DF", color: "#1B2B5E" }}>
          Annuler
        </button>
      </div>
    </div>
  );
}

// ── TimbrageAdminTable (principal) ────────────────────────────────────────────

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
  const [editDate, setEditDate] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);

  // Index par date
  const planningParDate: Record<string, string> = {};
  planningData.forEach(p => { planningParDate[p.date] = p.statut; });

  const timbragesParDate: Record<string, TimbrageRow> = {};
  timbragesData.forEach(t => { timbragesParDate[t.date] = t; });

  const decompteParDate: Record<string, JourDecompte> = {};
  joursDecompte.forEach(j => { decompteParDate[j.date] = j; });

  const nbJours = new Date(annee, mois, 0).getDate();

  const handleDelete = async (dateStr: string) => {
    if (!window.confirm(`Supprimer le timbrage du ${dateStr} ?`)) return;
    setDeleteLoading(dateStr);
    const res = await fetch("/api/rh/timbrage", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employe_id: empId, date: dateStr }),
    });
    setDeleteLoading(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(`Erreur : ${data.error ?? "Erreur réseau"}`);
      return;
    }
    if (editDate === dateStr) setEditDate(null);
    router.refresh();
  };

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
      <table className="min-w-full">
        <thead>
          <tr style={{ backgroundColor: "#1B2B5E" }}>
            {["Jour", "Statut", "Dû", "Fait", "Solde", "Absence", "Valid.", ""].map(h => (
              <th key={h} className={`px-3 py-2 text-xs font-semibold text-white ${h === "Dû" || h === "Fait" || h === "Solde" ? "text-right" : "text-left"}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: nbJours }, (_, i) => {
            const jour = i + 1;
            const dateStr = `${annee}-${moisPad}-${String(jour).padStart(2, "0")}`;
            const jourSemaine = new Date(dateStr + "T12:00:00").getDay();
            const estWeekend = jourSemaine === 0 || jourSemaine === 6;
            const estFutur = dateStr > aujourd_hui;
            const estEnEdition = editDate === dateStr;

            const statut = planningParDate[dateStr] ?? null;
            const t = timbragesParDate[dateStr] ?? null;
            const j = decompteParDate[dateStr] ?? null;
            const soldeJour = j ? j.pointe - j.du : null;

            let bgRow = "white";
            if (estEnEdition)  bgRow = "#E8F5F4";
            else if (estFutur) bgRow = "#FAFAFA";
            else if (estWeekend) bgRow = "#F1F5F9";

            return (
              <React.Fragment key={dateStr}>
                <tr style={{ backgroundColor: bgRow, borderBottom: "1px solid #E2E8F0", opacity: estFutur ? 0.6 : 1 }}>

                  {/* Jour */}
                  <td className="px-3 py-1.5 text-sm whitespace-nowrap">
                    <span className="font-bold" style={{ color: estWeekend ? "#94A3B8" : "#1B2B5E" }}>
                      {jour}
                    </span>
                    <span className="ml-1 text-xs text-gray-400">{NOMS_JOURS[jourSemaine]}</span>
                    {estFutur && (
                      <span className="ml-1 text-xs text-gray-300">›</span>
                    )}
                  </td>

                  {/* Statut planning */}
                  <td className="px-3 py-1.5">
                    {statut ? (
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                        style={{ backgroundColor: bgStatut(statut), color: textStatut(statut) }}>
                        {labelStatut(statut)}
                      </span>
                    ) : <span className="text-xs text-gray-300">—</span>}
                  </td>

                  {/* Dû */}
                  <td className="px-3 py-1.5 text-right text-sm">
                    {!estFutur && j && j.du > 0
                      ? <span className="font-semibold text-gray-600">{j.du.toFixed(1)}h</span>
                      : <span className="text-gray-300">—</span>}
                  </td>

                  {/* Fait */}
                  <td className="px-3 py-1.5 text-right text-sm">
                    {!estFutur && j?.timbreExiste && j.pointe > 0
                      ? <span className="font-semibold" style={{ color: "#1B2B5E" }}>{j.pointe.toFixed(1)}h</span>
                      : !estFutur && j?.timbreExiste && j.typeAbsence !== null
                        ? <span className="text-gray-400 text-xs">—</span>
                        : !estFutur && !j?.timbreExiste && j?.du && j.du > 0
                          ? <span className="text-orange-400 text-xs font-semibold">manquant</span>
                          : <span className="text-gray-300">—</span>}
                  </td>

                  {/* Solde */}
                  <td className="px-3 py-1.5 text-right text-sm">
                    {!estFutur && j && j.du > 0 && j.timbreExiste
                      ? <span className="font-bold"
                          style={{ color: (soldeJour ?? 0) >= 0 ? "#4AAEA0" : "#D97706" }}>
                          {(soldeJour ?? 0) >= 0 ? "+" : ""}{(soldeJour ?? 0).toFixed(1)}h
                        </span>
                      : <span className="text-gray-300">—</span>}
                  </td>

                  {/* Absence */}
                  <td className="px-3 py-1.5">
                    {t?.type_absence && (
                      <span className="px-2 py-0.5 rounded-full text-xs"
                        style={{ backgroundColor: "#FFF7ED", color: "#C2410C" }}>
                        {labelAbsence(t.type_absence)}
                      </span>
                    )}
                  </td>

                  {/* Validation */}
                  <td className="px-3 py-1.5 text-center">
                    {t?.valide_admin === false
                      ? <span className="text-orange-400 text-sm font-bold" title="Non validé">⚠</span>
                      : t?.valide_admin === true
                        ? <span className="text-green-500 text-sm" title="Validé">✓</span>
                        : <span className="text-gray-200">·</span>}
                  </td>

                  {/* Actions */}
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    <div className="flex gap-1 justify-end">
                      <button
                        type="button"
                        onClick={() => setEditDate(estEnEdition ? null : dateStr)}
                        className="px-2 py-1 rounded-lg text-xs font-semibold"
                        style={{
                          backgroundColor: estEnEdition ? "#E8847A" : "#EDE8DF",
                          color: estEnEdition ? "white" : "#1B2B5E",
                        }}
                        title={estEnEdition ? "Fermer" : "Modifier"}>
                        {estEnEdition ? "✕" : "✏️"}
                      </button>
                      {t && (
                        <button
                          type="button"
                          onClick={() => handleDelete(dateStr)}
                          disabled={deleteLoading === dateStr}
                          className="px-2 py-1 rounded-lg text-xs font-semibold text-white disabled:opacity-40"
                          style={{ backgroundColor: "#DC2626" }}
                          title="Supprimer le timbrage">
                          {deleteLoading === dateStr ? "…" : "🗑"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>

                {/* Formulaire d'édition inline */}
                {estEnEdition && (
                  <tr>
                    <td colSpan={8} style={{ padding: 0 }}>
                      <FormPanel
                        key={dateStr}
                        empId={empId}
                        date={dateStr}
                        timbrage={t}
                        onClose={() => setEditDate(null)}
                        onSaved={() => { setEditDate(null); router.refresh(); }}
                      />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
