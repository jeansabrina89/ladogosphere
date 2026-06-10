"use client";

import { useState, useEffect } from "react";
import { formatBoxLabel } from "../../../../src/lib/boxes";

type Suggestion = {
  box_id: string;
  numero: number;
  nom?: string | null;
  score: number;
  raisons: string[];
  problemes: string[];
  nb_chiens_presents: number;
  chiens_presents: string[];
};

export default function SuggestionBox({
  chien_ids,
  date_debut,
  date_fin,
  heure_arrivee,
  heure_depart,
  reservation_id,
  onSelectBox,
}: {
  chien_ids: string[];
  date_debut: string;
  date_fin: string;
  heure_arrivee?: string | null;
  heure_depart?: string | null;
  reservation_id: string;
  onSelectBox: (box_id: string) => void;
}) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [ouvert, setOuvert] = useState(false);
  const [autoSelectMessage, setAutoSelectMessage] = useState<string | null>(null);

  // Sélection automatique au chargement
  useEffect(() => {
    if (chien_ids.length === 0 || !date_debut || !date_fin) return;

    const chercher = async () => {
      setLoading(true);
      try {
        // D'abord essayer la suggestion rapide (box_compatible en priorité)
        const res = await fetch("/api/boxes/suggestion", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chien_ids,
            date_debut,
            date_fin,
            heure_arrivee,
            heure_depart,
          }),
        });
        const data = await res.json();
        if (data.box_id) {
          onSelectBox(data.box_id);
          setAutoSelectMessage(data.message);
        }
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    };

    chercher();
  }, []);

  const chargerSuggestions = async () => {
    if (chien_ids.length === 0) return;
    setLoading(true);
    const response = await fetch("/api/reservations/suggerer-box", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chien_ids, date_debut, date_fin, heure_arrivee, heure_depart, reservation_id }),
    });
    const data = await response.json();
    setSuggestions(data.suggestions || []);
    setLoading(false);
    setOuvert(true);
  };

  const getCouleur = (score: number) => {
    if (score >= 100) return { bg: "#E8F5F4", border: "#4AAEA0", text: "#1B5E4F" };
    if (score >= 70) return { bg: "#FFF8E1", border: "#C9A84C", text: "#7A5C00" };
    return { bg: "#FEF2F2", border: "#E8847A", text: "#7F1D1D" };
  };

  return (
    <div className="mb-4">
      {/* Message de sélection automatique */}
      {autoSelectMessage && (
        <div className="mb-2 px-3 py-2 rounded-xl text-sm font-semibold bg-blue-50 text-blue-700">
          🤖 {autoSelectMessage}
        </div>
      )}

      {loading && (
        <p className="text-xs text-gray-400 mb-2">🔍 Recherche du meilleur box...</p>
      )}

      <button type="button" onClick={chargerSuggestions} disabled={loading}
        className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
        style={{ backgroundColor: "#C9A84C" }}>
        {loading ? "Calcul en cours..." : "🤝 Voir toutes les suggestions de box"}
      </button>

      {ouvert && suggestions.length > 0 && (
        <div className="mt-3 space-y-2 max-h-96 overflow-y-auto">
          <p className="text-sm font-semibold mb-2" style={{ color: "#1B2B5E" }}>
            Suggestions (du meilleur au moins bon) :
          </p>
          {suggestions.slice(0, 8).map(s => {
            const couleur = getCouleur(s.score);
            return (
              <div key={s.box_id}
                className="rounded-xl p-3 border-2 cursor-pointer hover:opacity-80 transition"
                style={{ backgroundColor: couleur.bg, borderColor: couleur.border }}
                onClick={() => { onSelectBox(s.box_id); setOuvert(false); setAutoSelectMessage(`${formatBoxLabel(s)} sélectionné`); }}>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-bold" style={{ color: couleur.text }}>
                      {formatBoxLabel(s)}
                      {s.nb_chiens_presents === 0 && " — Libre"}
                      {s.nb_chiens_presents > 0 && ` — ${s.nb_chiens_presents} chien(s) : ${s.chiens_presents.join(", ")}`}
                    </p>
                    {s.raisons.map((r, i) => (
                      <p key={i} className="text-xs mt-0.5" style={{ color: couleur.text }}>{r}</p>
                    ))}
                    {s.problemes.map((p, i) => (
                      <p key={i} className="text-xs mt-0.5 text-orange-600">{p}</p>
                    ))}
                  </div>
                  <span className="text-xs font-bold px-2 py-1 rounded-full ml-2"
                    style={{ backgroundColor: couleur.border, color: "white" }}>
                    Score {s.score}
                  </span>
                </div>
              </div>
            );
          })}
          <button type="button" onClick={() => setOuvert(false)}
            className="text-xs text-gray-400 hover:text-gray-600 mt-1">
            Fermer les suggestions
          </button>
        </div>
      )}
    </div>
  );
}