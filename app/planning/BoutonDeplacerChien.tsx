"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Box = { id: string; numero: number };
type Suggestion = {
  box_id: string;
  numero: number;
  score: number;
  raisons: string[];
  problemes: string[];
  nb_chiens_presents: number;
  chiens_presents: string[];
};

export default function BoutonDeplacerChien({
  occupation_id,
  chien,
  box_actuel,
  boxes,
  date_debut,
  date_fin,
  reservation_id,
}: {
  occupation_id: string;
  chien: any;
  box_actuel: number;
  boxes: Box[];
  date_debut: string;
  date_fin: string;
  reservation_id?: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [nouveauBox, setNouveauBox] = useState("");
  const [mode, setMode] = useState<"tout" | "partir_de">("tout");
  const [dateChangement, setDateChangement] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loadingSugg, setLoadingSugg] = useState(false);
  const router = useRouter();

  const ouvrirPopup = async () => {
    setOuvert(true);
    setLoadingSugg(true);

    // Charger les suggestions
    const response = await fetch("/api/reservations/suggerer-box", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chien_ids: [chien.id],
        date_debut,
        date_fin,
        reservation_id: reservation_id || null,
      }),
    });
    const data = await response.json();
    setSuggestions(data.suggestions || []);
    setLoadingSugg(false);
  };

  const getSuggestion = (box_id: string) =>
    suggestions.find(s => s.box_id === box_id);

  const getCouleurBox = (box_id: string) => {
    const s = getSuggestion(box_id);
    if (!s) return { bg: "white", border: "#E2E8F0" };
    if (s.score >= 100) return { bg: "#E8F5F4", border: "#4AAEA0" };
    if (s.score >= 50) return { bg: "#FFF8E1", border: "#C9A84C" };
    if (s.score < 0) return { bg: "#FEF2F2", border: "#E8847A" };
    return { bg: "white", border: "#E2E8F0" };
  };

  const handleDeplacer = async () => {
    if (!nouveauBox) return;
    if (mode === "partir_de" && !dateChangement) {
      alert("Veuillez choisir une date de changement.");
      return;
    }
    setLoading(true);

    const response = await fetch("/api/planning/deplacer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        occupation_id,
        nouveau_box_id: nouveauBox,
        mode,
        date_changement: mode === "partir_de" ? dateChangement : null,
      }),
    });

    if (response.ok) {
      setOuvert(false);
      router.refresh();
    } else {
      alert("Erreur lors du déplacement.");
    }
    setLoading(false);
  };

  return (
    <>
      <button
        onClick={ouvrirPopup}
        className="text-xs px-2 py-1 rounded font-semibold w-full text-left truncate"
        style={{ backgroundColor: "transparent", border: "none" }}
        title={`${chien.nom} — Cliquer pour déplacer`}>
        {chien.sexe === "F" ? "♀️" : "♂️"} {chien.nom}
      </button>

      {ouvert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="bg-white rounded-xl p-6 shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">

            <h2 className="text-xl font-bold mb-2" style={{ color: "#1B2B5E" }}>
              🐶 Déplacer {chien.nom}
            </h2>

            <div className="bg-slate-50 rounded-xl p-3 mb-4 text-sm space-y-1">
              <p><strong>Race :</strong> {chien.race || "—"}</p>
              <p><strong>Poids :</strong> {chien.poids ? `${chien.poids} kg` : "—"}</p>
              <p><strong>Catégorie :</strong> {
                chien.categorie_poids === "moins_15kg" ? "🟢 Petit" :
                chien.categorie_poids === "15_30kg" ? "🟡 Moyen" :
                chien.categorie_poids === "30_40kg" ? "🔴 Grand" : "—"
              }</p>
              <p><strong>Sexe :</strong> {chien.sexe === "M" ? "♂️ Mâle" : "♀️ Femelle"} {chien.sterilise ? "stérilisé(e)" : "entier(e)"}</p>
              <p><strong>Séjour :</strong> {date_debut} → {date_fin}</p>
              <p><strong>Box actuel :</strong> Box {box_actuel}</p>
            </div>

            {/* Mode */}
            <div className="mb-4">
              <label className="block font-semibold mb-2" style={{ color: "#1B2B5E" }}>
                Type de déplacement
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setMode("tout")}
                  className="py-2 px-3 rounded-xl text-sm font-semibold border-2 transition"
                  style={{
                    borderColor: mode === "tout" ? "#4AAEA0" : "#E2E8F0",
                    backgroundColor: mode === "tout" ? "#E8F5F4" : "white",
                    color: "#1B2B5E",
                  }}>
                  🔄 Tout le séjour
                </button>
                <button type="button" onClick={() => setMode("partir_de")}
                  className="py-2 px-3 rounded-xl text-sm font-semibold border-2 transition"
                  style={{
                    borderColor: mode === "partir_de" ? "#4AAEA0" : "#E2E8F0",
                    backgroundColor: mode === "partir_de" ? "#E8F5F4" : "white",
                    color: "#1B2B5E",
                  }}>
                  ✂️ À partir d'une date
                </button>
              </div>
            </div>

            {/* Date changement */}
            {mode === "partir_de" && (
              <div className="mb-4">
                <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>
                  À partir du *
                </label>
                <input type="date" value={dateChangement}
                  min={date_debut} max={date_fin}
                  onChange={e => setDateChangement(e.target.value)}
                  className="w-full border rounded-xl p-3" />
                {dateChangement && (
                  <p className="text-xs text-gray-500 mt-1">
                    Box {box_actuel} : {date_debut} → {new Date(new Date(dateChangement).getTime() - 86400000).toISOString().split("T")[0]}<br />
                    Nouveau box : {dateChangement} → {date_fin}
                  </p>
                )}
              </div>
            )}

            {/* Sélection du box avec compatibilités */}
            <div className="mb-4">
              <label className="block font-semibold mb-2" style={{ color: "#1B2B5E" }}>
                Choisir un box
                {loadingSugg && <span className="ml-2 text-xs text-gray-400">Calcul des compatibilités...</span>}
              </label>

              <div className="space-y-2 max-h-64 overflow-y-auto">
                {boxes.map(b => {
                  const couleur = getCouleurBox(b.id);
                  const sugg = getSuggestion(b.id);
                  const estActuel = b.numero === box_actuel;

                  return (
                    <div key={b.id}
                      onClick={() => setNouveauBox(b.id)}
                      className="rounded-xl p-3 border-2 cursor-pointer transition"
                      style={{
                        borderColor: nouveauBox === b.id ? "#1B2B5E" : couleur.border,
                        backgroundColor: nouveauBox === b.id ? "#E8F0FB" : couleur.bg,
                        outline: nouveauBox === b.id ? "2px solid #1B2B5E" : "none",
                      }}>
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-bold text-sm" style={{ color: "#1B2B5E" }}>
                            Box {b.numero}
                            {estActuel && <span className="ml-2 text-xs text-gray-400">(actuel)</span>}
                            {sugg && sugg.nb_chiens_presents > 0 && (
                              <span className="ml-2 text-xs text-gray-500">
                                — {sugg.chiens_presents.join(", ")}
                              </span>
                            )}
                            {sugg && sugg.nb_chiens_presents === 0 && (
                              <span className="ml-2 text-xs text-green-600">— Libre</span>
                            )}
                          </p>
                          {sugg && sugg.raisons.map((r, i) => (
                            <p key={i} className="text-xs text-green-600 mt-0.5">{r}</p>
                          ))}
                          {sugg && sugg.problemes.map((p, i) => (
                            <p key={i} className="text-xs text-red-600 mt-0.5">{p}</p>
                          ))}
                        </div>
                        {sugg && (
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full ml-2 flex-shrink-0"
                            style={{
                              backgroundColor: couleur.border,
                              color: "white"
                            }}>
                            {sugg.score > 0 ? `+${sugg.score}` : sugg.score}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={handleDeplacer} disabled={!nouveauBox || loading}
                className="flex-1 py-2 rounded-xl font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: "#4AAEA0" }}>
                {loading ? "Déplacement..." : "✅ Confirmer"}
              </button>
              <button onClick={() => {
                setOuvert(false);
                setMode("tout");
                setDateChangement("");
                setNouveauBox("");
                setSuggestions([]);
              }}
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