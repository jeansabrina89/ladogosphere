"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function BoutonGestionVacances({ id }: { id: string }) {
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [ouvert, setOuvert] = useState(false);
  const router = useRouter();

  const traiter = async (statut: "acceptee" | "refusee") => {
    setLoading(true);
    await fetch("/api/rh/vacances", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, statut, note_admin: note || null }),
    });
    setLoading(false);
    setOuvert(false);
    router.refresh();
  };

  return (
    <>
      <button onClick={() => setOuvert(true)}
        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
        style={{ backgroundColor: "#4AAEA0" }}>
        Traiter
      </button>

      {ouvert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="bg-white rounded-xl p-6 shadow-xl w-full max-w-sm">
            <h3 className="font-bold mb-4" style={{ color: "#1B2B5E" }}>
              Traiter la demande
            </h3>
            <div className="mb-4">
              <label className="block text-sm font-semibold mb-1" style={{ color: "#1B2B5E" }}>
                Note (optionnel)
              </label>
              <input type="text" value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Commentaire pour l'employé..."
                className="w-full border rounded-xl p-3 text-sm" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => traiter("acceptee")} disabled={loading}
                className="flex-1 py-2 rounded-xl font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: "#4AAEA0" }}>
                ✅ Accepter
              </button>
              <button onClick={() => traiter("refusee")} disabled={loading}
                className="flex-1 py-2 rounded-xl font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: "#E8847A" }}>
                ❌ Refuser
              </button>
            </div>
            <button onClick={() => setOuvert(false)}
              className="w-full mt-3 py-2 rounded-xl text-sm font-semibold"
              style={{ backgroundColor: "#EDE8DF", color: "#1B2B5E" }}>
              Annuler
            </button>
          </div>
        </div>
      )}
    </>
  );
}