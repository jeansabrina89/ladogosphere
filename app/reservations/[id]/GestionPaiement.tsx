"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Smartphone, Banknote, Landmark, CreditCard, Wallet, MoreHorizontal } from "lucide-react";
import { enregistrerPaiement, annulerPaiement } from "./actions";

const MODES_PAIEMENT = [
  { val: "twint", label: "Twint", Icon: Smartphone },
  { val: "cash", label: "Cash", Icon: Banknote },
  { val: "iban", label: "Virement IBAN", Icon: Landmark },
  { val: "stripe", label: "Stripe", Icon: CreditCard },
  { val: "avoir", label: "Avoir", Icon: Wallet },
  { val: "autre", label: "Autre", Icon: MoreHorizontal },
];

const STATUT_LABELS: Record<string, string> = {
  impaye: "❌ Impayé",
  partiel: "⚠️ Partiel",
  paye: "✅ Payé",
};

export default function GestionPaiement({
  reservation_id,
  client_id,
  solde_avoir,
  montant_final,
  statut_paiement,
  montant_paye,
  date_paiement,
  mode_paiement,
}: {
  reservation_id: string;
  client_id?: string;
  solde_avoir?: number;
  montant_final: number | null;
  statut_paiement: string | null;
  montant_paye: number | null;
  date_paiement: string | null;
  mode_paiement: string | null;
}) {
  const [montantPaye, setMontantPaye] = useState(montant_paye?.toString() || "");
  const [date, setDate] = useState(date_paiement || "");
  const [mode, setMode] = useState(mode_paiement || "");
  const [loading, setLoading] = useState(false);
  const [sauvegarde, setSauvegarde] = useState(false);
  const [annulationLoading, setAnnulationLoading] = useState(false);
  const router = useRouter();

  const total = Number(montant_final ?? 0);
  const statut = statut_paiement || "impaye";
  const dejaPaye = Number(montant_paye) || 0;
  const estPaye = statut === "paye";
  const montantSaisi = parseFloat(montantPaye || "0");
  const resteSaisi = total > 0 ? total - (isNaN(montantSaisi) ? 0 : montantSaisi) : 0;

  const handleSauvegarder = async () => {
    if (montantSaisi > 0 && !mode) { alert("Choisis un mode de paiement."); return; }
    setLoading(true);

    const formData = new FormData();
    formData.set("reservation_id", reservation_id);
    formData.set("client_id", client_id || "");
    formData.set("montant_paye", montantPaye ? montantPaye : "0");
    formData.set("date_paiement", date || "");
    formData.set("mode_paiement", mode || "");

    const res = await enregistrerPaiement(formData);
    if (res?.error) {
      alert(res.error);
      setLoading(false);
      return;
    }
    setSauvegarde(true);
    setTimeout(() => setSauvegarde(false), 3000);
    router.refresh();
    setLoading(false);
  };

  const handleAnnulerPaiement = async () => {
    if (!confirm(`Annuler le paiement de CHF ${dejaPaye.toFixed(2)} ?`)) return;

    let mettreEnAvoir = true;
    if (mode_paiement === "avoir") {
      alert(
        "Ce paiement a été réglé avec le crédit du client. " +
        "À l'annulation, le crédit lui sera automatiquement restauré."
      );
    } else {
      mettreEnAvoir = confirm(
        "Mettre le montant en avoir pour le client ?\n\n" +
        "OK = Oui, créditer l'avoir du client\n" +
        "Annuler = Non, ne rien créditer"
      );
    }

    setAnnulationLoading(true);
    const formData = new FormData();
    formData.set("reservation_id", reservation_id);
    formData.set("client_id", client_id || "");
    formData.set("mettre_en_avoir", mettreEnAvoir ? "true" : "false");
    const res = await annulerPaiement(formData);
    if (res?.error) {
      alert(res.error);
      setAnnulationLoading(false);
      return;
    }
    router.refresh();
    setAnnulationLoading(false);
  };

  return (
    <div className="border-t pt-6 mb-6">
      <h2 className="text-2xl font-bold mb-4" style={{ color: "#1B2B5E" }}>💳 Paiement</h2>

      <div className="bg-slate-50 rounded-xl p-4 space-y-4">

        {/* Statut — automatique, lecture seule */}
        <div>
          <label className="block font-semibold mb-2" style={{ color: "#1B2B5E" }}>Statut du paiement</label>
          <span className="inline-block px-4 py-2 rounded-xl text-sm font-semibold text-white"
            style={{ backgroundColor: estPaye ? "#4AAEA0" : statut === "partiel" ? "#E0A23B" : "#E8847A" }}>
            {STATUT_LABELS[statut] || statut}
          </span>
          <p className="text-xs text-gray-500 mt-1">
            Le statut se met à jour automatiquement selon le montant payé.
          </p>
        </div>

        {/* Montant + mode */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>
              Montant payé — total reçu (CHF)
            </label>
            <input type="number" step="0.05" min="0"
              value={montantPaye}
              onChange={e => setMontantPaye(e.target.value)}
              placeholder={montant_final?.toString() || "0"}
              className="w-full border rounded-xl p-3" />
            {total > 0 && (
              <p className="text-xs text-gray-500 mt-1">
                Maximum : {total.toFixed(2)} CHF (total de la réservation).
              </p>
            )}
          </div>
          <div>
            <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>
              Mode de paiement
            </label>
            <div className="flex flex-wrap gap-2">
              {MODES_PAIEMENT.map(m => (
                <button key={m.val} type="button" onClick={() => setMode(m.val)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold border-2 transition"
                  style={{
                    borderColor: mode === m.val ? "#4AAEA0" : "#E2E8F0",
                    backgroundColor: mode === m.val ? "#4AAEA0" : "white",
                    color: mode === m.val ? "white" : "#1B2B5E",
                  }}>
                  <m.Icon size={16} />
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Avoir disponible */}
        {typeof solde_avoir === "number" && (
          <div className="text-sm rounded-xl px-3 py-2"
            style={{ backgroundColor: "#E8F5F4", color: "#1B2B5E" }}>
            👛 Avoir disponible pour ce client : <strong>CHF {solde_avoir.toFixed(2)}</strong>
            {mode === "avoir" && (
              <span className="block mt-1 text-xs text-gray-600">
                Le montant total saisi sera débité de cet avoir (plafonné au solde et au total de la réservation).
              </span>
            )}
          </div>
        )}

        {/* Date */}
        <div>
          <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>
            Date de paiement
          </label>
          <input type="date" value={date}
            onChange={e => setDate(e.target.value)}
            className="w-full border rounded-xl p-3" />
        </div>

        {/* Résumé */}
        {total > 0 && (
          <div className="flex justify-between items-center pt-2 border-t">
            <div>
              <p className="text-sm text-gray-500">Total facturé</p>
              <p className="text-xl font-bold" style={{ color: "#1B2B5E" }}>{total.toFixed(2)} CHF</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">Reste à payer</p>
              <p className="text-xl font-bold" style={{ color: resteSaisi > 0 ? "#E0A23B" : "#4AAEA0" }}>
                {(resteSaisi > 0 ? resteSaisi : 0).toFixed(2)} CHF
              </p>
            </div>
          </div>
        )}

        {/* Enregistrer / Modifier */}
        <button onClick={handleSauvegarder} disabled={loading}
          className="w-full py-2 rounded-xl font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: "#1B2B5E" }}>
          {sauvegarde ? "✅ Sauvegardé !" : loading ? "..." : estPaye ? "✏️ Modifier le paiement" : "💾 Enregistrer le paiement"}
        </button>

        {/* Annuler */}
        {dejaPaye > 0 && (
          <button onClick={handleAnnulerPaiement} disabled={annulationLoading}
            className="w-full py-2 rounded-xl font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: "#E8847A" }}>
            {annulationLoading ? "..." : "🗑️ Annuler le paiement"}
          </button>
        )}

      </div>
    </div>
  );
}