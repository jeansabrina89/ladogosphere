"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  RESULTATS_ESSAI,
  LIBELLES_RESULTAT,
  statutEssaiDe,
  type ResultatEssai,
} from "@/src/lib/journeeEssai";

const COULEURS: Record<ResultatEssai, { fond: string; bord: string; texte: string; icone: string }> = {
  valide: { fond: "#DBEFEA", bord: "#4AAEA0", texte: "#1F6E5B", icone: "✅" },
  seconde_journee: { fond: "#F4EAC9", bord: "#C9A84C", texte: "#6E5410", icone: "🔁" },
  refuse: { fond: "#FBE2DE", bord: "#E8847A", texte: "#A8453A", icone: "❌" },
};

/**
 * Correction du résultat de la journée d'essai après coup, depuis la fiche chien.
 * Mêmes trois valeurs qu'au départ, avec la trace de qui a saisi et quand.
 */
export default function BoutonsJourneeEssai({
  chien_id,
  statut_essai,
  journee_essai_note,
  perm_journee_essai,
}: {
  chien_id: string;
  statut_essai: string | null;
  journee_essai_note: string | null;
  perm_journee_essai: boolean;
}) {
  const statutActuel = statutEssaiDe({ statut_essai });
  const [note, setNote] = useState(journee_essai_note || "");
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const router = useRouter();

  if (!perm_journee_essai) return null;

  const enregistrer = async (corps: Record<string, unknown>) => {
    setLoading(true);
    setErreur(null);
    const res = await fetch(`/api/chiens/${chien_id}/journee-essai`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corps),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErreur(data.error ?? "Erreur lors de l'enregistrement.");
      setLoading(false);
      return;
    }
    router.refresh();
    setLoading(false);
  };

  return (
    <div className="space-y-3">
      <p className="text-sm" style={{ color: "rgba(27,43,94,0.6)", margin: 0 }}>
        Le résultat est normalement saisi au départ du chien. Vous pouvez le corriger ici.
      </p>

      <div className="flex gap-3 flex-wrap">
        {RESULTATS_ESSAI.map((r) => {
          const c = COULEURS[r];
          const actif = statutActuel === r;
          return (
            <button
              key={r}
              onClick={() => enregistrer({ statut_essai: r, journee_essai_note: note || null })}
              disabled={loading || actif}
              className="px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-100 disabled:cursor-default"
              style={{
                backgroundColor: actif ? c.fond : "#FFFFFF",
                border: actif ? `2px solid ${c.bord}` : "2px solid rgba(27,43,94,0.15)",
                color: actif ? c.texte : "#1B2B5E",
                cursor: loading || actif ? "default" : "pointer",
              }}
            >
              {c.icone} {LIBELLES_RESULTAT[r]}{actif ? " — actuel" : ""}
            </button>
          );
        })}
      </div>

      {(statutActuel === "non_programme" || statutActuel === "programme") && (
        <p className="text-sm" style={{ color: "rgba(27,43,94,0.55)", margin: 0 }}>
          Statut actuel : {statutActuel === "programme" ? "journée d'essai réservée" : "journée d'essai à réserver"}.
        </p>
      )}

      <div>
        <label className="block text-sm font-semibold mb-1" style={{ color: "#1B2B5E" }}>
          Note interne (jamais envoyée au client)
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ex. : craintif avec les grands gabarits…"
            className="flex-1 border rounded-xl p-2 text-sm"
          />
          <button
            onClick={() => enregistrer({ journee_essai_note: note || null })}
            disabled={loading}
            className="px-3 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: "#1B2B5E" }}>
            💾
          </button>
        </div>
      </div>

      {erreur && <p className="text-sm text-red-600">{erreur}</p>}
    </div>
  );
}
