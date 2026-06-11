"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ajouterAvoir, retirerAvoir } from "./actions";
import type { MouvementAvoir } from "../../../src/lib/avoirs";

const LABELS_TYPE: Record<string, string> = {
  ajout_manuel: "➕ Ajout manuel",
  retrait_manuel: "➖ Retrait manuel",
  annulation_paiement: "↩️ Annulation paiement",
  utilisation: "🛒 Utilisation",
};

export default function GestionAvoir({
  client_id,
  solde,
  mouvements,
}: {
  client_id: string;
  solde: number;
  mouvements: MouvementAvoir[];
}) {
  const [mode, setMode] = useState<"ajout" | "retrait" | null>(null);
  const [montant, setMontant] = useState("");
  const [motif, setMotif] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const annuler = () => {
    setMode(null);
    setMontant("");
    setMotif("");
  };

  const handleSubmit = async () => {
    setLoading(true);

    const formData = new FormData();
    formData.set("client_id", client_id);
    formData.set("montant", montant);
    formData.set("motif", motif);

    const action = mode === "ajout" ? ajouterAvoir : retirerAvoir;
    const res = await action(formData);

    if (res?.error) {
      alert(res.error);
      setLoading(false);
      return;
    }

    annuler();
    setLoading(false);
    router.refresh();
  };

  return (
    <div className="border-t pt-6 mb-8">
      <h2 className="text-2xl font-bold mb-4" style={{ color: "#1B2B5E" }}>
        💳 Avoir client
      </h2>

      <div className="flex items-center justify-between mb-4">
        <p className="text-gray-500 text-sm">Solde actuel</p>
        <p className="text-3xl font-bold" style={{ color: solde < 0 ? "#DC2626" : "#4AAEA0" }}>
          CHF {solde.toFixed(2)}
        </p>
      </div>

      {mode === null && (
        <div className="flex gap-3 mb-4">
          <button onClick={() => setMode("ajout")}
            className="px-4 py-2 rounded-xl font-semibold text-white"
            style={{ backgroundColor: "#4AAEA0" }}>
            ➕ Ajouter un avoir
          </button>
          <button onClick={() => setMode("retrait")}
            className="px-4 py-2 rounded-xl font-semibold text-white"
            style={{ backgroundColor: "#E8847A" }}>
            ➖ Retirer un avoir
          </button>
        </div>
      )}

      {mode !== null && (
        <div className="border-2 rounded-xl p-5 space-y-4 mb-4"
          style={{
            borderColor: mode === "ajout" ? "#4AAEA0" : "#E8847A",
            backgroundColor: mode === "ajout" ? "#E8F5F4" : "#FCEEEC",
          }}>
          <p className="font-bold" style={{ color: "#1B2B5E" }}>
            {mode === "ajout" ? "➕ Ajouter un avoir" : "➖ Retirer un avoir"}
          </p>

          <div>
            <label className="block text-sm font-semibold mb-1" style={{ color: "#1B2B5E" }}>
              Montant (CHF) *
            </label>
            <input type="number" min="0.01" step="0.01" value={montant}
              onChange={e => setMontant(e.target.value)}
              className="border rounded-xl p-2 text-sm w-40" />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1" style={{ color: "#1B2B5E" }}>
              Motif *
            </label>
            <input type="text" value={motif}
              onChange={e => setMotif(e.target.value)}
              className="border rounded-xl p-2 text-sm w-full" />
          </div>

          <div className="flex gap-3">
            <button onClick={handleSubmit} disabled={loading}
              className="px-5 py-2 rounded-xl font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: mode === "ajout" ? "#4AAEA0" : "#E8847A" }}>
              {loading ? "Enregistrement..." : "💾 Confirmer"}
            </button>
            <button onClick={annuler}
              className="px-5 py-2 rounded-xl font-semibold"
              style={{ backgroundColor: "#EDE8DF", color: "#1B2B5E" }}>
              ✖ Annuler
            </button>
          </div>
        </div>
      )}

      {mouvements.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Historique</p>
          {mouvements.map((m) => (
            <div key={m.id} className="flex justify-between items-center border rounded-xl p-3">
              <div>
                <p className="font-semibold text-sm" style={{ color: "#1B2B5E" }}>
                  {LABELS_TYPE[m.type] ?? m.type}
                </p>
                <p className="text-xs text-gray-500">
                  {m.motif || "—"} — {new Date(m.created_at).toLocaleDateString("fr-CH")}
                </p>
              </div>
              <p className="font-bold text-sm" style={{ color: m.montant < 0 ? "#DC2626" : "#4AAEA0" }}>
                {m.montant >= 0 ? "+" : ""}{m.montant.toFixed(2)} CHF
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-gray-400 text-sm">Aucun mouvement enregistré.</p>
      )}
    </div>
  );
}
