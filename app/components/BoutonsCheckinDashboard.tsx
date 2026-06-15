"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function BoutonsCheckinDashboard({
  checkin_id,
  statut,
  type,
}: {
  checkin_id: string;
  statut: string;
  type: "arrivee" | "depart";
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const callAction = async (action: string) => {
    setLoading(true);
    const res = await fetch(`/api/checkin/${checkin_id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "Erreur lors de l'opération.");
      setLoading(false);
      return;
    }
    router.refresh();
    setLoading(false);
  };

  if (type === "arrivee") {
    if (statut === "attendu") {
      return (
        <button
          onClick={() => callAction("checkin")}
          disabled={loading}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: "#4AAEA0" }}>
          {loading ? "…" : "✅ Valider l'arrivée"}
        </button>
      );
    }
    if (statut === "arrive" || statut === "a_recuperer") {
      return (
        <button
          onClick={() => {
            if (!window.confirm("Annuler l'arrivée de ce chien ?")) return;
            callAction("annuler_checkin");
          }}
          disabled={loading}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
          style={{ backgroundColor: "#F3F4F6", color: "#6B7280", border: "1px solid #E5E7EB" }}>
          {loading ? "…" : "↩️ Annuler l'arrivée"}
        </button>
      );
    }
  }

  if (type === "depart") {
    if (statut === "arrive" || statut === "a_recuperer") {
      return (
        <button
          onClick={() => callAction("checkout")}
          disabled={loading}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: "#E8847A" }}>
          {loading ? "…" : "🚪 Valider le départ"}
        </button>
      );
    }
    if (statut === "parti") {
      return (
        <button
          onClick={() => {
            if (!window.confirm("Annuler le départ de ce chien ?")) return;
            callAction("annuler_checkout");
          }}
          disabled={loading}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
          style={{ backgroundColor: "#F3F4F6", color: "#6B7280", border: "1px solid #E5E7EB" }}>
          {loading ? "…" : "↩️ Annuler le départ"}
        </button>
      );
    }
  }

  return null;
}
