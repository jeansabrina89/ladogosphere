"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { calculerPeriodeCotisation } from "@/src/lib/cotisationPeriode";
import { formatDateLong } from "@/src/lib/dates";

export default function BoutonConfirmerCotisation({
  cotisation_id,
  statut,
  perm_encaissements,
  fin_precedente = null,
}: {
  cotisation_id: string;
  statut: string;
  perm_encaissements: boolean;
  /** date_fin de la cotisation PAYÉE en cours du client (renouvellement anticipé). */
  fin_precedente?: string | null;
}) {
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [datePaiement, setDatePaiement] = useState(new Date().toISOString().split("T")[0]);
  const router = useRouter();

  if (!perm_encaissements) return null;

  // Aperçu de la période AVANT validation (mêmes règles que le serveur).
  const periode = datePaiement ? calculerPeriodeCotisation(datePaiement, fin_precedente) : null;

  const confirmer = async (mode_paiement: "cash" | "virement") => {
    setLoading(true);
    setErreur(null);
    const res = await fetch(`/api/clients/cotisation/${cotisation_id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode_paiement, date_paiement: datePaiement || undefined }),
    });
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setErreur(data.error || "Erreur lors de la confirmation.");
    }
    setLoading(false);
  };

  const annuler = async () => {
    if (!confirm("Annuler le paiement de cette adhésion ? Elle repassera en « en attente ».")) return;
    setLoading(true);
    setErreur(null);
    const res = await fetch(`/api/clients/cotisation/${cotisation_id}`, {
      method: "PATCH",
    });
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setErreur(data.error || "Erreur lors de l'annulation.");
    }
    setLoading(false);
  };

  if (statut === "en_attente") {
    return (
      <div className="mt-2 flex flex-col items-end gap-1">
        <label className="flex items-center gap-1 text-xs" style={{ color: "rgba(27,43,94,0.6)" }}>
          Payée le
          <input
            type="date"
            value={datePaiement}
            onChange={(e) => setDatePaiement(e.target.value)}
            className="border rounded-lg px-1 py-0.5 text-xs"
          />
        </label>
        {periode && (
          <p className="text-xs text-right" style={{ color: "#1F6E5B" }}>
            Valable du {formatDateLong(periode.date_debut)} au {formatDateLong(periode.date_fin)}
          </p>
        )}
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
        {erreur && <p className="text-xs text-red-600">{erreur}</p>}
      </div>
    );
  }

  if (statut === "payee") {
    return (
      <div className="mt-2 flex flex-col items-end gap-1">
        <button
          onClick={annuler}
          disabled={loading}
          className="px-2 py-1 rounded-lg text-xs font-semibold disabled:opacity-50"
          style={{ backgroundColor: "#EDE8DF", color: "#1B2B5E" }}
        >
          {loading ? "…" : "↩︎ Annuler le paiement"}
        </button>
        {erreur && <p className="text-xs text-red-600">{erreur}</p>}
      </div>
    );
  }

  return null;
}
