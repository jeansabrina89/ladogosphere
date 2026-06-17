"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function BoutonsJourneeEssai({
  chien_id,
  journee_essai_effectuee,
  journee_essai_invalide,
  journee_essai_note,
  perm_journee_essai,
}: {
  chien_id: string;
  journee_essai_effectuee: boolean;
  journee_essai_invalide: boolean;
  journee_essai_note: string | null;
  perm_journee_essai: boolean;
}) {
  if (!perm_journee_essai) return null;
  const [note, setNote] = useState(journee_essai_note || "");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const mettre_a_jour = async (data: object) => {
    setLoading(true);
    await fetch(`/api/chiens/${chien_id}/journee-essai`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    router.refresh();
    setLoading(false);
  };

  return (
    <div className="space-y-3">
      {/* Bouton effectuée */}
      <div className="flex gap-3 flex-wrap">
        <button
          onClick={() => mettre_a_jour({
            journee_essai_effectuee: !journee_essai_effectuee,
          })}
          disabled={loading || journee_essai_invalide}
          className="px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: journee_essai_effectuee ? "#6B7280" : "#4AAEA0" }}>
          {journee_essai_effectuee ? "↩️ Annuler journée d'essai" : "✅ Marquer comme effectuée"}
        </button>

        <button
          onClick={() => mettre_a_jour({
            journee_essai_invalide: !journee_essai_invalide,
            journee_essai_note: note || null,
          })}
          disabled={loading}
          className="px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: journee_essai_invalide ? "#6B7280" : "#E8847A" }}>
          {journee_essai_invalide ? "↩️ Annuler invalidation" : "❌ Marquer comme invalide"}
        </button>
      </div>

      {/* Note */}
      <div>
        <label className="block text-sm font-semibold mb-1" style={{ color: "#1B2B5E" }}>
          Note / annotation
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Ex: chien agressif avec les autres..."
            className="flex-1 border rounded-xl p-2 text-sm"
          />
          <button
            onClick={() => mettre_a_jour({ journee_essai_note: note || null })}
            disabled={loading}
            className="px-3 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: "#1B2B5E" }}>
            💾
          </button>
        </div>
      </div>
    </div>
  );
}