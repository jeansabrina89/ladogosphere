"use client";

import { useState } from "react";

export default function ExportCompta() {
  const [mois, setMois] = useState("");
  const [annee, setAnnee] = useState(new Date().getFullYear().toString());
  const [erreur, setErreur] = useState<string | null>(null);

  const handleExport = () => {
    setErreur(null);
    try {
      const params = new URLSearchParams();
      if (mois) params.set("mois", mois);
      if (annee) params.set("annee", annee);
      const w = window.open(`/api/comptabilite/export?${params.toString()}`, "_blank");
      if (!w) setErreur("Échec de l'export, réessaie.");
    } catch {
      setErreur("Échec de l'export, réessaie.");
    }
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

      <button onClick={handleExport}
        className="px-4 py-2 rounded-lg font-semibold text-white text-sm"
        style={{ backgroundColor: "#C9A84C" }}>
        📥 Journal des encaissements
      </button>

      {erreur && (
        <p className="text-sm text-red-600">{erreur}</p>
      )}

    </div>
  );
}
