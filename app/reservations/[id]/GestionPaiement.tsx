"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function GestionPaiement({
  reservation_id,
  montant_final,
  statut_paiement,
  montant_paye,
  date_paiement,
  mode_paiement,
}: {
  reservation_id: string;
  montant_final: number | null;
  statut_paiement: string | null;
  montant_paye: number | null;
  date_paiement: string | null;
  mode_paiement: string | null;
}) {
  const [statut, setStatut] = useState(statut_paiement || "impaye");
  const [montantPaye, setMontantPaye] = useState(montant_paye?.toString() || "");
  const [date, setDate] = useState(date_paiement || "");
  const [mode, setMode] = useState(mode_paiement || "");
  const [loading, setLoading] = useState(false);
  const [sauvegarde, setSauvegarde] = useState(false);
  const router = useRouter();

  const handleSauvegarder = async () => {
    setLoading(true);
    const response = await fetch(`/api/reservations/${reservation_id}/paiement`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        statut_paiement: statut,
        montant_paye: montantPaye ? parseFloat(montantPaye) : 0,
        date_paiement: date || null,
        mode_paiement: mode || null,
      }),
    });
    if (response.ok) {
      setSauvegarde(true);
      setTimeout(() => setSauvegarde(false), 3000);
      router.refresh();
    }
    setLoading(false);
  };

  return (
    <div className="border-t pt-6 mb-6">
      <h2 className="text-2xl font-bold mb-4" style={{ color: "#1B2B5E" }}>💳 Paiement</h2>

      <div className="bg-slate-50 rounded-xl p-4 space-y-4">

        {/* Statut */}
        <div>
          <label className="block font-semibold mb-2" style={{ color: "#1B2B5E" }}>Statut du paiement</label>
          <div className="flex gap-2">
            {[
              { val: "impaye", label: "❌ Impayé" },
              { val: "partiel", label: "⚠️ Partiel" },
              { val: "paye", label: "✅ Payé" },
            ].map(s => (
              <button key={s.val} onClick={() => setStatut(s.val)}
                className="px-4 py-2 rounded-xl text-sm font-semibold border-2 transition"
                style={{
                  borderColor: statut === s.val ? "#4AAEA0" : "#E2E8F0",
                  backgroundColor: statut === s.val ? "#4AAEA0" : "white",
                  color: statut === s.val ? "white" : "#1B2B5E",
                }}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Montant payé */}
        {(statut === "partiel" || statut === "paye") && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>
                Montant reçu (CHF)
              </label>
              <input type="number" step="0.05"
                value={montantPaye}
                onChange={e => setMontantPaye(e.target.value)}
                placeholder={montant_final?.toString() || "0"}
                className="w-full border rounded-xl p-3" />
            </div>
            <div>
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
          </div>
        )}

        {/* Date de paiement */}
        {(statut === "partiel" || statut === "paye") && (
          <div>
            <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>
              Date de paiement
            </label>
            <input type="date" value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full border rounded-xl p-3" />
          </div>
        )}

        {/* Résumé */}
        {montant_final && (
          <div className="flex justify-between items-center pt-2 border-t">
            <div>
              <p className="text-sm text-gray-500">Total facturé</p>
              <p className="text-xl font-bold" style={{ color: "#1B2B5E" }}>{montant_final} CHF</p>
            </div>
            {statut === "partiel" && montantPaye && (
              <div className="text-right">
                <p className="text-sm text-gray-500">Reste à payer</p>
                <p className="text-xl font-bold text-orange-600">
                  {(montant_final - parseFloat(montantPaye)).toFixed(2)} CHF
                </p>
              </div>
            )}
          </div>
        )}

        <button onClick={handleSauvegarder} disabled={loading}
          className="w-full py-2 rounded-xl font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: "#1B2B5E" }}>
          {sauvegarde ? "✅ Sauvegardé !" : loading ? "..." : "💾 Enregistrer le paiement"}
        </button>

      </div>
    </div>
  );
}