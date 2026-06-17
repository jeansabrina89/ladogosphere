"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function BoutonConfirmerCotisation({
  cotisation_id,
  statut,
  perm_encaissements,
}: {
  cotisation_id: string;
  statut: string;
  perm_encaissements: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const router = useRouter();

  if (statut !== "en_attente" || !perm_encaissements) return null;

  const confirmer = async (mode_paiement: "cash" | "virement") => {
    setLoading(true);
    setErreur(null);
    const res = await fetch(`/api/clients/cotisation/${cotisation_id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode_paiement }),
    });
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setErreur(data.error || "Erreur lors de la confirmation.");
    }
    setLoading(false);
  };

  return (
    <div className="mt-2 flex flex-col items-end gap-1">
      <div className="flex gap-1">
        <button
          onClick={() => confirmer("cash")}
          disabled={loading}
          className="px-2 py-1 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: "#4AAEA0" }}
        >
          {loading ? "…" : "✅ Espèces"}
        </button>
        <button
          onClick={() => confirmer("virement")}
          disabled={loading}
          className="px-2 py-1 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: "#1B2B5E" }}
        >
          {loading ? "…" : "🏦 Virement"}
        </button>
      </div>
      {erreur && (
        <p className="text-xs text-red-600">{erreur}</p>
      )}
    </div>
  );
}
