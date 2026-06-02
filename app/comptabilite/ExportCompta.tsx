"use client";

import { useState } from "react";

export default function ExportCompta() {
  const [mois, setMois] = useState("");
  const [annee, setAnnee] = useState(new Date().getFullYear().toString());
  const [filtreCompta, setFiltreCompta] = useState("tous");

  const handleExport = () => {
    const params = new URLSearchParams();
    if (mois) params.set("mois", mois);
    if (annee) params.set("annee", annee);
    if (filtreCompta !== "tous") params.set("paiement", filtreCompta);
    window.open(`/api/comptabilite/export?${params.toString()}`, "_blank");
  };

  return (
    <div className="flex flex-wrap items-center gap-3 bg-white rounded-xl p-4 shadow-sm">

      <select value={mois} onChange={e => setMois(e.target.value)}
        className="border rounded-lg p-2 text-sm">
        <option value="">Tous les mois</option>
        {Array.from({ length: 12 }, (_, i) => (
          <option key={i + 1} value={i + 1}>
            {new Date(2024, i, 1).toLocaleDateString("fr-CH", { month: "long" })}
          </option>
        ))}
      </select>

      <select value={annee} onChange={e => setAnnee(e.target.value)}
        className="border rounded-lg p-2 text-sm">
        {[2024, 2025, 2026, 2027].map(a => (
          <option key={a} value={a}>{a}</option>
        ))}
      </select>

      <select value={filtreCompta} onChange={e => setFiltreCompta(e.target.value)}
        className="border rounded-lg p-2 text-sm">
        <option value="tous">Toutes</option>
        <option value="paye">✅ Encaissées</option>
        <option value="partiel">⚠️ Partielles</option>
        <option value="impaye">❌ À encaisser</option>
      </select>

      <button onClick={handleExport}
        className="px-4 py-2 rounded-lg font-semibold text-white text-sm"
        style={{ backgroundColor: "#C9A84C" }}>
        📥 Exporter Excel
      </button>

    </div>
  );
}