"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function BoutonPaiementRapide({
  reservation_id,
  montant_final,
  statut_paiement,
}: {
  reservation_id: string;
  montant_final: number | null;
  statut_paiement: string | null;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [mode, setMode] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handlePayer = async () => {
    setLoading(true);
    const response = await fetch(`/api/reservations/${reservation_id}/paiement`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        statut_paiement: "paye",
        montant_paye: montant_final,
        date_paiement: new Date().toISOString().split("T")[0],
        mode_paiement: mode || null,
      }),
    });
    if (response.ok) {
      setOuvert(false);
      router.refresh();
    }
    setLoading(false);
  };

  return (
    <>
      <button onClick={() => setOuvert(true)}
        className="px-3 py-1 rounded-lg text-xs font-semibold text-white"
        style={{ backgroundColor: "#C9A84C" }}>
        💳 Marquer payé
      </button>

      {ouvert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="bg-white rounded-xl p-6 shadow-xl w-full max-w-sm mx-4">

            <h2 className="text-xl font-bold mb-4" style={{ color: "#1B2B5E" }}>
              💳 Enregistrer le paiement
            </h2>

            {montant_final && (
              <p className="text-2xl font-bold mb-4 text-center" style={{ color: "#4AAEA0" }}>
                {montant_final} CHF
              </p>
            )}

            <div className="mb-4">
              <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>
                Mode de paiement
              </label>
              <select value={mode} onChange={e => setMode(e.target.value)}
                className="w-full border rounded-xl p-3">
                <option value="">-- Choisir --</option>
                <option value="twint">Twint</option>
                <option value="cash">Cash</option>
                <option value="iban">Virement IBAN</option>
                <option value="stripe">Stripe</option>
                <option value="autre">Autre</option>
              </select>
            </div>

            <div className="flex gap-3">
              <button onClick={handlePayer} disabled={loading}
                className="flex-1 py-2 rounded-xl font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: "#4AAEA0" }}>
                {loading ? "..." : "✅ Confirmer"}
              </button>
              <button onClick={() => setOuvert(false)}
                className="flex-1 py-2 rounded-xl font-semibold"
                style={{ backgroundColor: "#EDE8DF", color: "#1B2B5E" }}>
                ✖ Annuler
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
}