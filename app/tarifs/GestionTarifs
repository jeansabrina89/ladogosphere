"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Tarif = {
  id: string;
  categorie: string;
  membre: boolean;
  prix: string;
  annee: number;
};

const LABELS: Record<string, string> = {
  "journee_partage_1": "Journée — 1 chien partagé",
  "journee_partage_2": "Journée — 2 chiens partagés",
  "journee_partage_3": "Journée — 3 chiens partagés",
  "journee_privatif": "Journée — Box privatif",
  "sejour_partage_1": "Séjour 24h — 1 chien partagé",
  "sejour_partage_2": "Séjour 24h — 2 chiens partagés",
  "sejour_partage_3": "Séjour 24h — 3 chiens partagés",
  "sejour_privatif": "Séjour 24h — Box privatif",
  "urgence_partage_1": "Urgence — 1 chien partagé",
  "urgence_partage_2": "Urgence — 2 chiens partagés",
  "urgence_partage_3": "Urgence — 3 chiens partagés",
  "urgence_privatif": "Urgence — Box privatif",
};

const GROUPES = [
  { label: "☀️ Journée", prefix: "journee" },
  { label: "🏠 Séjour 24h", prefix: "sejour" },
  { label: "🚨 Urgence (membres uniquement)", prefix: "urgence" },
];

export default function GestionTarifs({
  tarifs, annee, anneesDisponibles, cotisationMontant,
}: {
  tarifs: Tarif[];
  annee: number;
  anneesDisponibles: number[];
  cotisationMontant: number;
}) {
  const router = useRouter();
  const [tarifsLocaux, setTarifsLocaux] = useState<Record<string, number>>(
    Object.fromEntries(tarifs.map(t => [`${t.categorie}_${t.membre}`, parseFloat(t.prix)]))
  );
  const [cotisation, setCotisation] = useState(cotisationMontant);
  const [nouvelleAnnee, setNouvelleAnnee] = useState(annee + 1);
  const [loading, setLoading] = useState(false);
  const [succes, setSucces] = useState("");

  const getKey = (categorie: string, membre: boolean) => `${categorie}_${membre}`;

  const sauvegarderTarifs = async () => {
    setLoading(true);
    setSucces("");

    const updates = tarifs.map(t => ({
      id: t.id,
      prix: tarifsLocaux[getKey(t.categorie, t.membre)] ?? parseFloat(t.prix),
    }));

    const res = await fetch("/api/tarifs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updates, cotisation }),
    });

    if (res.ok) {
      setSucces("✅ Tarifs sauvegardés !");
      router.refresh();
    }
    setLoading(false);
  };

  const copierPourNouvelleAnnee = async () => {
    if (!confirm(`Copier les tarifs ${annee} pour l'année ${nouvelleAnnee} ?`)) return;
    setLoading(true);

    const res = await fetch("/api/tarifs/copier", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ annee_source: annee, annee_cible: nouvelleAnnee }),
    });

    if (res.ok) {
      setSucces(`✅ Tarifs copiés pour ${nouvelleAnnee} !`);
      router.push(`/tarifs?annee=${nouvelleAnnee}`);
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6">

      {/* Sélecteur d'année */}
      <div className="bg-white rounded-xl p-4 shadow-sm flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="font-semibold text-sm" style={{ color: "#1B2B5E" }}>Année :</label>
          <div className="flex gap-2">
            {anneesDisponibles.map(a => (
              <a key={a} href={`/tarifs?annee=${a}`}
                className="px-3 py-1 rounded-lg text-sm font-semibold"
                style={{
                  backgroundColor: a === annee ? "#1B2B5E" : "#EDE8DF",
                  color: a === annee ? "white" : "#1B2B5E",
                }}>
                {a}
              </a>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <input type="number" value={nouvelleAnnee}
            onChange={e => setNouvelleAnnee(parseInt(e.target.value))}
            className="border rounded-lg p-2 text-sm w-24" />
          <button onClick={copierPourNouvelleAnnee} disabled={loading}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: "#4AAEA0" }}>
            📋 Copier pour {nouvelleAnnee}
          </button>
        </div>
      </div>

      {succes && (
        <div className="bg-green-100 text-green-700 px-4 py-3 rounded-xl text-sm font-semibold">
          {succes}
        </div>
      )}

      {/* Cotisation membre */}
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <h2 className="text-xl font-bold mb-4" style={{ color: "#1B2B5E" }}>
          ⭐ Cotisation membre {annee}
        </h2>
        <div className="flex items-center gap-4">
          <label className="font-semibold text-sm" style={{ color: "#1B2B5E" }}>
            Montant annuel (CHF) :
          </label>
          <input type="number" value={cotisation}
            onChange={e => setCotisation(parseFloat(e.target.value))}
            className="border rounded-xl p-3 w-32 text-lg font-bold text-center"
            style={{ color: "#1B2B5E" }} />
          <span className="text-sm text-gray-500">CHF / an — valable du 01.01 au 31.12.{annee}</span>
        </div>
      </div>

      {/* Tableaux de tarifs par groupe */}
      {GROUPES.map(({ label, prefix }) => {
        const categories = [`${prefix}_partage_1`, `${prefix}_partage_2`, `${prefix}_partage_3`, `${prefix}_privatif`];
        const aMembreUniquement = prefix === "urgence";

        return (
          <div key={prefix} className="bg-white rounded-xl p-6 shadow-sm">
            <h2 className="text-xl font-bold mb-4" style={{ color: "#1B2B5E" }}>{label}</h2>
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left pb-3 text-gray-500 font-semibold">Catégorie</th>
                  {!aMembreUniquement && <th className="pb-3 text-gray-500 font-semibold text-center">Non-membre (CHF)</th>}
                  <th className="pb-3 font-semibold text-center" style={{ color: "#4AAEA0" }}>⭐ Membre (CHF)</th>
                </tr>
              </thead>
              <tbody>
                {categories.map(cat => {
                  const hasTarif = tarifs.some(t => t.categorie === cat);
                  if (!hasTarif) return null;

                  return (
                    <tr key={cat} className="border-t">
                      <td className="py-3 font-medium" style={{ color: "#1B2B5E" }}>
                        {LABELS[cat] || cat}
                      </td>
                      {!aMembreUniquement && (
                        <td className="py-3 text-center">
                          <input
                            type="number"
                            value={tarifsLocaux[getKey(cat, false)] ?? 0}
                            onChange={e => setTarifsLocaux(prev => ({
                              ...prev,
                              [getKey(cat, false)]: parseFloat(e.target.value) || 0,
                            }))}
                            className="border rounded-lg p-2 w-24 text-center font-bold"
                          />
                        </td>
                      )}
                      <td className="py-3 text-center">
                        <input
                          type="number"
                          value={tarifsLocaux[getKey(cat, true)] ?? 0}
                          onChange={e => setTarifsLocaux(prev => ({
                            ...prev,
                            [getKey(cat, true)]: parseFloat(e.target.value) || 0,
                          }))}
                          className="border rounded-lg p-2 w-24 text-center font-bold"
                          style={{ color: "#4AAEA0" }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}

      {/* Bouton sauvegarder */}
      <div className="flex justify-end">
        <button onClick={sauvegarderTarifs} disabled={loading}
          className="px-8 py-3 rounded-xl font-semibold text-white text-lg disabled:opacity-50"
          style={{ backgroundColor: "#4AAEA0" }}>
          {loading ? "Sauvegarde..." : "💾 Sauvegarder les tarifs"}
        </button>
      </div>

    </div>
  );
}