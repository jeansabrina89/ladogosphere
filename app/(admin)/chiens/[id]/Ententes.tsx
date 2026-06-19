"use client";

import { useState, useEffect } from "react";

type Chien = { id: string; nom: string; race: string };
type Entente = {
  id: string;
  chien_cible_id: string;
  type: string;
  note: string;
  chien_cible: { nom: string; race: string };
};

export default function Ententes({
  chien_id,
  tous_chiens,
  doit_etre_isole,
  perm_chiens_modifier,
}: {
  chien_id: string;
  tous_chiens: Chien[];
  doit_etre_isole?: boolean;
  perm_chiens_modifier: boolean;
}) {
  const [ententes, setEntentes] = useState<Entente[]>([]);
  const [chienCible, setChienCible] = useState("");
  const [type, setType] = useState("ok");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [familleUniquement, setFamilleUniquement] = useState(false);
  const [doitEtreIsole, setDoitEtreIsole] = useState(!!doit_etre_isole);

  const charger = async () => {
    const res = await fetch(`/api/chiens/${chien_id}/ententes`);
    const data = await res.json();
    setEntentes(data.ententes || []);
    setFamilleUniquement(data.famille_uniquement || false);
  };

  useEffect(() => { charger(); }, [chien_id]);

  const handleAjouter = async () => {
    if (!chienCible) return;
    setLoading(true);
    await fetch(`/api/chiens/${chien_id}/ententes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chien_cible_id: chienCible, type, note }),
    });
    setChienCible("");
    setNote("");
    await charger();
    setLoading(false);
  };

  const handleSupprimer = async (entente_id: string) => {
    await fetch(`/api/chiens/${chien_id}/ententes/${entente_id}`, { method: "DELETE" });
    await charger();
  };

  const handleFamilleUniquement = async () => {
    const nouvelleValeur = !familleUniquement;
    setFamilleUniquement(nouvelleValeur);
    const res = await fetch(`/api/chiens/${chien_id}/ententes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "famille_uniquement", famille_uniquement: true }),
    });
    if (!res.ok) setFamilleUniquement(!nouvelleValeur);
  };

  const handleDoitEtreIsole = async () => {
    const nouvelleValeur = !doitEtreIsole;
    setDoitEtreIsole(nouvelleValeur);
    const res = await fetch(`/api/chiens/${chien_id}/isolement`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ doit_etre_isole: nouvelleValeur }),
    });
    if (!res.ok) setDoitEtreIsole(!nouvelleValeur);
  };

  const chiensDisponibles = tous_chiens.filter(c =>
    c.id !== chien_id && !ententes.find(e => e.chien_cible_id === c.id)
  );

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "ok":
        return { emoji: "✅", label: "S'entend bien", color: "text-green-600", bg: "bg-green-50", border: "border-green-200" };
      case "interdit":
        return { emoji: "❌", label: "Incompatibles", color: "text-red-600", bg: "bg-red-50", border: "border-red-200" };
      case "box_compatible":
        return { emoji: "🏠", label: "Peut aller au box avec", color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200" };
      default:
        return { emoji: "🏠", label: "Famille", color: "text-orange-600", bg: "bg-orange-50", border: "border-orange-200" };
    }
  };

  return (
    <div>
      <h2 style={{ fontFamily: "Georgia, 'Times New Roman', serif", color: "#1B2B5E", fontSize: 18, fontWeight: 700, margin: "0 0 16px" }}>
        🤝 Ententes individuelles
      </h2>

      {/* Option famille uniquement */}
      <div className="mb-4 p-3 rounded-xl border-2"
        style={{ borderColor: familleUniquement ? "#E8847A" : "#E2E8F0", backgroundColor: familleUniquement ? "#FEF2F2" : "white" }}>
        {perm_chiens_modifier ? (
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={familleUniquement} onChange={handleFamilleUniquement} />
            <span className="font-semibold" style={{ color: "#1B2B5E" }}>
              🏠 Famille uniquement — ne pas mélanger avec d'autres chiens
            </span>
          </label>
        ) : (
          <p className="font-semibold" style={{ color: "#1B2B5E" }}>
            🏠 Famille uniquement — ne pas mélanger avec d'autres chiens{familleUniquement ? " ✅" : " ❌"}
          </p>
        )}
      </div>

      {/* Option doit être isolé */}
      <div className="mb-4 p-3 rounded-xl border-2"
        style={{ borderColor: doitEtreIsole ? "#E8847A" : "#E2E8F0", backgroundColor: doitEtreIsole ? "#FEF2F2" : "white" }}>
        {perm_chiens_modifier ? (
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={doitEtreIsole} onChange={handleDoitEtreIsole} />
            <span className="font-semibold" style={{ color: "#1B2B5E" }}>
              🚫 Doit être isolé — box exclusif, jamais avec d'autres chiens
            </span>
          </label>
        ) : (
          <p className="font-semibold" style={{ color: "#1B2B5E" }}>
            🚫 Doit être isolé — box exclusif, jamais avec d'autres chiens{doitEtreIsole ? " ✅" : " ❌"}
          </p>
        )}
      </div>

      {/* Explication box_compatible */}
      <div className="mb-4 p-3 rounded-xl bg-blue-50 border border-blue-200 text-sm text-blue-700">
        💡 <strong>Peut aller au box avec</strong> — prioritaire sur les restrictions générales de compatibilité.
        Si ce chien et l'autre sont marqués ainsi, ils seront mis ensemble même si leurs profils semblent incompatibles.
      </div>

      {/* Liste des ententes */}
      {ententes.length > 0 && (
        <div className="space-y-2 mb-4">
          {ententes.map(e => {
            const style = getTypeLabel(e.type);
            return (
              <div key={e.id} className={`flex justify-between items-center border rounded-xl p-3 ${style.bg} ${style.border}`}>
                <div>
                  <span className={`font-semibold ${style.color}`}>
                    {style.emoji} {e.chien_cible?.nom}
                    <span className="ml-2 text-xs font-normal opacity-70">— {style.label}</span>
                  </span>
                  {e.note && <p className="text-xs text-gray-500 mt-0.5">{e.note}</p>}
                </div>
                {perm_chiens_modifier && (
                  <button onClick={() => handleSupprimer(e.id)} className="text-xs text-red-400 hover:text-red-600">
                    Supprimer
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Ajouter une entente */}
      {perm_chiens_modifier && chiensDisponibles.length > 0 && (
        <div className="border rounded-xl p-4 space-y-3 bg-slate-50">
          <p className="font-semibold text-sm" style={{ color: "#1B2B5E" }}>Ajouter une entente</p>
          <div className="grid grid-cols-2 gap-3">
            <select value={chienCible} onChange={e => setChienCible(e.target.value)} className="border rounded-xl p-2 text-sm">
              <option value="">-- Choisir un chien --</option>
              {chiensDisponibles.map(c => (
                <option key={c.id} value={c.id}>{c.nom} — {c.race || "—"}</option>
              ))}
            </select>
            <select value={type} onChange={e => setType(e.target.value)} className="border rounded-xl p-2 text-sm">
              <option value="ok">✅ S'entend bien</option>
              <option value="box_compatible">🏠 Peut aller au box avec</option>
              <option value="interdit">❌ Incompatibles</option>
            </select>
          </div>
          <input type="text" value={note} onChange={e => setNote(e.target.value)}
            placeholder="Note (optionnel)" className="w-full border rounded-xl p-2 text-sm" />
          <button onClick={handleAjouter} disabled={!chienCible || loading}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: "#2E8B7E" }}>
            {loading ? "..." : "➕ Ajouter"}
          </button>
        </div>
      )}
    </div>
  );
}
