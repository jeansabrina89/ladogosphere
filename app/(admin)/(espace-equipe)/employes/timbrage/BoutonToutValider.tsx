"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function BoutonToutValider({
  empId,
  mois,
}: {
  empId: string;
  mois: string; // "YYYY-MM"
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur]   = useState<string | null>(null);

  const handleClick = async () => {
    if (!window.confirm(`Valider tous les timbrages de ${mois} pour cet employé ?`)) return;
    setLoading(true);
    setErreur(null);
    const res = await fetch("/api/rh/timbrage", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employe_id: empId, mois }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErreur(data.error ?? "Erreur réseau");
      return;
    }
    router.refresh();
  };

  return (
    <div className="flex items-center gap-3">
      {erreur && <span className="text-xs text-red-500 font-semibold">❌ {erreur}</span>}
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="px-4 py-2 rounded-xl font-semibold text-white text-sm disabled:opacity-50"
        style={{ backgroundColor: "#16A34A" }}
      >
        {loading ? "En cours…" : "✓ Tout valider le mois"}
      </button>
    </div>
  );
}
