"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function BoutonCotisation({
  client_id, client_nom, est_membre, cotisation_existante, montant, annee,
  est_exempte = false, raison_exemption,
}: {
  client_id: string;
  client_nom: string;
  est_membre: boolean;
  cotisation_existante: boolean;
  montant: number;
  annee: number;
  est_exempte?: boolean;
  raison_exemption?: string | null;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [mode, setMode] = useState<"cash" | "virement" | "prochaine_resa">("cash");
  const [datePaiement, setDatePaiement] = useState(new Date().toISOString().split("T")[0]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSauvegarder = async () => {
    setLoading(true);
    const res = await fetch("/api/clients/cotisation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id,
        annee,
        montant,
        mode_paiement: mode,
        statut: mode === "prochaine_resa" ? "en_attente" : "payee",
        date_paiement: mode === "prochaine_resa" ? null : datePaiement,
      }),
    });

    if (res.ok) {
      setOuvert(false);
      router.refresh();
    } else {
      const data = await res.json();
      alert(data.error || "Erreur lors de l'enregistrement.");
    }
    setLoading(false);
  };

  if (est_exempte) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm font-semibold text-amber-800">
        🎟️ Client exempté d'adhésion{raison_exemption ? ` — ${raison_exemption}` : ""}
      </div>
    );
  }

  if (cotisation_existante) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-700 font-semibold">
        ✅ Adhésion {annee} enregistrée
      </div>
    );
  }

  return (
    <div>
      {!ouvert ? (
        <button onClick={() => setOuvert(true)}
          className="px-5 py-2 rounded-xl font-semibold text-white"
          style={{ backgroundColor: est_membre ? "#C9A84C" : "#4AAEA0" }}>
          {est_membre ? `🔄 Renouveler adhésion ${annee}` : `⭐ Enregistrer comme membre ${annee}`}
        </button>
      ) : (
        <div className="border-2 rounded-xl p-5 space-y-4"
          style={{ borderColor: "#4AAEA0", backgroundColor: "#E8F5F4" }}>
          <p className="font-bold" style={{ color: "#1B2B5E" }}>
            {est_membre ? `🔄 Renouvellement adhésion ${annee}` : `⭐ Inscription membre ${annee}`} — {client_nom}
          </p>
          <p className="text-sm text-gray-600">
            Montant : <strong>CHF {montant.toFixed(2)}</strong>
          </p>

          <div>
            <label className="block text-sm font-semibold mb-2" style={{ color: "#1B2B5E" }}>
              Mode de paiement *
            </label>
            <div className="flex gap-3 flex-wrap">
              {[
                { value: "cash", label: "💵 Cash" },
                { value: "virement", label: "🏦 Virement IBAN" },
                { value: "prochaine_resa", label: "📅 Prochaine réservation" },
              ].map(opt => (
                <button key={opt.value} type="button"
                  onClick={() => setMode(opt.value as any)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold border-2 transition"
                  style={{
                    backgroundColor: mode === opt.value ? "#4AAEA0" : "white",
                    borderColor: mode === opt.value ? "#4AAEA0" : "#E2E8F0",
                    color: mode === opt.value ? "white" : "#1B2B5E",
                  }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {mode !== "prochaine_resa" && (
            <div>
              <label className="block text-sm font-semibold mb-1" style={{ color: "#1B2B5E" }}>
                Date de paiement *
              </label>
              <input type="date" value={datePaiement}
                onChange={e => setDatePaiement(e.target.value)}
                className="border rounded-xl p-2 text-sm" />
            </div>
          )}

          {mode === "prochaine_resa" && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-sm text-yellow-700">
              ℹ️ L'adhésion sera ajoutée à la prochaine facture du client. Le statut membre est activé immédiatement.
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={handleSauvegarder} disabled={loading}
              className="px-5 py-2 rounded-xl font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: "#4AAEA0" }}>
              {loading ? "Enregistrement..." : "💾 Confirmer"}
            </button>
            <button onClick={() => setOuvert(false)}
              className="px-5 py-2 rounded-xl font-semibold"
              style={{ backgroundColor: "#EDE8DF", color: "#1B2B5E" }}>
              ✖ Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}