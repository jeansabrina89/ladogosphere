"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Modele = {
  id: string;
  label: string;
  type: "pourcentage" | "montant_fixe";
  valeur: number;
  actif: boolean;
  ordre: number;
};

export default function GestionModeles({ modeles }: { modeles: Modele[] }) {
  const [liste, setListe] = useState<Modele[]>(modeles);
  const [nouveauLabel, setNouveauLabel] = useState("");
  const [nouveauType, setNouveauType] = useState<"pourcentage" | "montant_fixe">("pourcentage");
  const [nouvelleValeur, setNouvelleValeur] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const sauvegarderModele = async (modele: Modele) => {
    await fetch("/api/rh/modeles-deductions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(modele),
    });
    router.refresh();
  };

  const ajouterModele = async () => {
    if (!nouveauLabel || !nouvelleValeur) return;
    setLoading(true);
    const res = await fetch("/api/rh/modeles-deductions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: nouveauLabel,
        type: nouveauType,
        valeur: parseFloat(nouvelleValeur),
        ordre: liste.length + 1,
      }),
    });
    const data = await res.json();
    if (data.modele) {
      setListe([...liste, data.modele]);
      setNouveauLabel("");
      setNouvelleValeur("");
    }
    setLoading(false);
    router.refresh();
  };

  const supprimerModele = async (id: string) => {
    if (!confirm("Supprimer cette déduction ?")) return;
    await fetch(`/api/rh/modeles-deductions?id=${id}`, { method: "DELETE" });
    setListe(liste.filter(m => m.id !== id));
    router.refresh();
  };

  return (
    <div className="space-y-3">
      {liste.map(m => (
        <div key={m.id} className="flex items-center gap-3 border rounded-xl p-3">
          <div className="flex-1 grid grid-cols-3 gap-2">
            <input
              value={m.label}
              onChange={e => setListe(liste.map(x => x.id === m.id ? { ...x, label: e.target.value } : x))}
              className="border rounded-lg p-2 text-sm"
              placeholder="Label" />
            <select
              value={m.type}
              onChange={e => setListe(liste.map(x => x.id === m.id ? { ...x, type: e.target.value as any } : x))}
              className="border rounded-lg p-2 text-sm">
              <option value="pourcentage">% du brut</option>
              <option value="montant_fixe">CHF fixe</option>
            </select>
            <input
              type="number" step="0.01"
              value={m.valeur}
              onChange={e => setListe(liste.map(x => x.id === m.id ? { ...x, valeur: parseFloat(e.target.value) } : x))}
              className="border rounded-lg p-2 text-sm"
              placeholder="Valeur" />
          </div>
          <div className="flex gap-2">
            <label className="flex items-center gap-1 text-sm cursor-pointer">
              <input type="checkbox" checked={m.actif}
                onChange={e => setListe(liste.map(x => x.id === m.id ? { ...x, actif: e.target.checked } : x))} />
              Actif
            </label>
            <button onClick={() => sauvegarderModele(m)}
              className="px-3 py-1 rounded-lg text-sm font-semibold text-white"
              style={{ backgroundColor: "#4AAEA0" }}>
              💾
            </button>
            <button onClick={() => supprimerModele(m.id)}
              className="px-3 py-1 rounded-lg text-sm font-semibold text-white"
              style={{ backgroundColor: "#E8847A" }}>
              🗑️
            </button>
          </div>
        </div>
      ))}

      {/* Ajouter une déduction */}
      <div className="flex items-center gap-3 border-2 border-dashed rounded-xl p-3"
        style={{ borderColor: "#4AAEA0" }}>
        <div className="flex-1 grid grid-cols-3 gap-2">
          <input value={nouveauLabel} onChange={e => setNouveauLabel(e.target.value)}
            className="border rounded-lg p-2 text-sm" placeholder="Ex: Mutuelle" />
          <select value={nouveauType} onChange={e => setNouveauType(e.target.value as any)}
            className="border rounded-lg p-2 text-sm">
            <option value="pourcentage">% du brut</option>
            <option value="montant_fixe">CHF fixe</option>
          </select>
          <input type="number" step="0.01" value={nouvelleValeur}
            onChange={e => setNouvelleValeur(e.target.value)}
            className="border rounded-lg p-2 text-sm" placeholder="Valeur" />
        </div>
        <button onClick={ajouterModele} disabled={loading}
          className="px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: "#4AAEA0" }}>
          ➕ Ajouter
        </button>
      </div>
    </div>
  );
}