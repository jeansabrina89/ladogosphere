"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function FormIndisponibilites({ employe_id }: { employe_id: string }) {
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const demain = new Date();
  demain.setDate(demain.getDate() + 1);
  const dateMin = demain.toISOString().split("T")[0];

  const handleSubmit = async () => {
    if (!date) { setError("Veuillez sélectionner une date."); return; }
    setError("");
    setLoading(true);

    const res = await fetch("/api/rh/indisponibilites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employe_id, date, note: note || null }),
    });

    if (res.ok) {
      setSuccess(true);
      setDate("");
      setNote("");
      setTimeout(() => setSuccess(false), 3000);
      router.refresh();
    } else {
      const data = await res.json();
      setError(data.error || "Erreur.");
    }
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      {error && <div className="bg-red-100 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>}
      {success && <div className="bg-green-100 text-green-700 px-4 py-3 rounded-xl text-sm font-semibold">✅ Indisponibilité ajoutée !</div>}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold mb-1" style={{ color: "#1B2B5E" }}>
            Date *
          </label>
          <input type="date" value={date} min={dateMin}
            onChange={e => setDate(e.target.value)}
            className="w-full border rounded-xl p-3" />
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1" style={{ color: "#1B2B5E" }}>
            Note (optionnel)
          </label>
          <input type="text" value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Ex: rendez-vous médical..."
            className="w-full border rounded-xl p-3" />
        </div>
      </div>

      <button onClick={handleSubmit} disabled={loading}
        className="w-full py-3 rounded-xl font-semibold text-white disabled:opacity-50"
        style={{ backgroundColor: "#E8847A" }}>
        {loading ? "Enregistrement..." : "🚫 Ajouter l'indisponibilité"}
      </button>
    </div>
  );
}