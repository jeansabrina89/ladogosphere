"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { marquerFactureReglee } from "./actions";

export default function BoutonReglement({ facture_id }: { facture_id: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const handleRegler = async (mode: "cash" | "virement") => {
    const label = mode === "cash" ? "espèces" : "virement";
    if (!confirm(`Marquer cette facture comme réglée par ${label} ?\nToutes les réservations liées seront marquées payées.`)) return;
    setLoading(true);
    setErreur(null);
    const res = await marquerFactureReglee(facture_id, mode);
    if (res.error) {
      setErreur(res.error);
      setLoading(false);
      return;
    }
    router.refresh();
    setLoading(false);
  };

  return (
    <div>
      <p className="font-semibold mb-3" style={{ color: "#1B2B5E" }}>
        💳 Enregistrer le règlement
      </p>
      {erreur && (
        <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2 mb-3">
          ❌ {erreur}
        </p>
      )}
      <div className="flex gap-3 flex-wrap">
        <button
          onClick={() => handleRegler("cash")}
          disabled={loading}
          className="px-4 py-2 rounded-xl font-semibold text-white text-sm disabled:opacity-50"
          style={{ backgroundColor: "#4AAEA0" }}
        >
          {loading ? "..." : "💵 Marquer réglée (espèces)"}
        </button>
        <button
          onClick={() => handleRegler("virement")}
          disabled={loading}
          className="px-4 py-2 rounded-xl font-semibold text-white text-sm disabled:opacity-50"
          style={{ backgroundColor: "#1B2B5E" }}
        >
          {loading ? "..." : "🏦 Marquer réglée (virement)"}
        </button>
      </div>
    </div>
  );
}
