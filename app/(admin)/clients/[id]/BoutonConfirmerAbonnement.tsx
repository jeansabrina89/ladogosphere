"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { confirmerPaiementAbonnement } from "./actions";

const MODES = [
  { value: "cash", label: "Espèces" },
  { value: "twint", label: "TWINT" },
  { value: "virement", label: "Virement" },
  { value: "stripe", label: "Stripe" },
];

export default function BoutonConfirmerAbonnement({ abonnementId }: { abonnementId: string }) {
  const [mode, setMode] = useState("cash");
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const router = useRouter();

  async function confirmer() {
    setLoading(true);
    setErreur(null);
    const res = await confirmerPaiementAbonnement(abonnementId, mode);
    setLoading(false);
    if (res?.error) {
      setErreur(res.error);
      return;
    }
    router.refresh();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, marginTop: 6 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value)}
          disabled={loading}
          style={{
            fontSize: 12,
            borderRadius: 8,
            border: "1px solid rgba(27,43,94,0.2)",
            padding: "4px 8px",
            backgroundColor: "#fff",
            color: "#1B2B5E",
          }}
        >
          {MODES.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
        <button
          onClick={confirmer}
          disabled={loading}
          className="px-2 py-1 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: "#4AAEA0" }}
        >
          {loading ? "…" : "Confirmer le paiement"}
        </button>
      </div>
      {erreur && <p style={{ color: "#A8453A", fontSize: 12, margin: 0 }}>{erreur}</p>}
    </div>
  );
}
