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
  tarifs, annee, anneesDisponibles, cotisationMontant, ibanInitial,
  tvaAssujettie, tvaTaux, tvaNumero, tvaDateDebut, tvaTauxDetteNette,
}: {
  tarifs: Tarif[];
  annee: number;
  anneesDisponibles: number[];
  cotisationMontant: number;
  ibanInitial: string;
  tvaAssujettie: boolean;
  tvaTaux: string;
  tvaNumero: string;
  tvaDateDebut: string;
  tvaTauxDetteNette: string;
}) {
  const router = useRouter();
  const [tarifsLocaux, setTarifsLocaux] = useState<Record<string, number>>(
    Object.fromEntries(tarifs.map(t => [`${t.categorie}_${t.membre}`, parseFloat(t.prix)]))
  );
  const [cotisation, setCotisation] = useState(cotisationMontant);
  const [iban, setIban] = useState(ibanInitial);
  const [tvaOn, setTvaOn] = useState(tvaAssujettie);
  const [tvaTauxVal, setTvaTauxVal] = useState(tvaTaux);
  const [tvaNumVal, setTvaNumVal] = useState(tvaNumero);
  const [tvaDateVal, setTvaDateVal] = useState(tvaDateDebut);
  const [tvaDettVal, setTvaDettVal] = useState(tvaTauxDetteNette);
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
      body: JSON.stringify({
        updates, cotisation, iban,
        tva: {
          tva_assujettie: tvaOn ? "true" : "false",
          tva_taux: tvaTauxVal,
          tva_numero: tvaNumVal,
          tva_date_debut: tvaDateVal,
          tva_taux_dette_nette: tvaDettVal,
        },
      }),
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
          ⭐ Adhésion membre {annee}
        </h2>
        <div className="flex items-center gap-4 flex-wrap">
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

      {/* IBAN */}
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <h2 className="text-xl font-bold mb-4" style={{ color: "#1B2B5E" }}>
          🏦 IBAN La Dogosphère Sàrl
        </h2>
        <div className="flex items-center gap-4 flex-wrap">
          <input type="text" value={iban}
            onChange={e => setIban(e.target.value)}
            className="border rounded-xl p-3 flex-1 font-mono text-sm"
            placeholder="CH00 0000 0000 0000 0000 0"
            style={{ color: "#1B2B5E" }} />
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Utilisé dans les emails de demande de paiement et rappels d'adhésion.
        </p>
      </div>

      {/* TVA */}
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <h2 className="text-xl font-bold mb-4" style={{ color: "#1B2B5E" }}>
          🧾 TVA
        </h2>
        <div className="space-y-5">
          <div className="flex items-center gap-4">
            <label className="font-semibold text-sm w-64" style={{ color: "#1B2B5E" }}>
              Assujettie à la TVA
            </label>
            <button
              type="button"
              onClick={() => setTvaOn(v => !v)}
              className="relative inline-flex h-7 w-12 items-center rounded-full transition-colors"
              style={{ backgroundColor: tvaOn ? "#4AAEA0" : "#D1D5DB" }}
            >
              <span
                className="inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform"
                style={{ transform: tvaOn ? "translateX(22px)" : "translateX(2px)" }}
              />
            </button>
            <span className="text-sm text-gray-500">{tvaOn ? "Oui" : "Non"}</span>
          </div>
          <div className="flex items-center gap-4">
            <label className="font-semibold text-sm w-64" style={{ color: "#1B2B5E" }}>
              Date de début d'assujettissement
            </label>
            <input type="date" value={tvaDateVal}
              onChange={e => setTvaDateVal(e.target.value)}
              className="border rounded-xl p-2 text-sm" />
          </div>
          <div className="flex items-center gap-4">
            <label className="font-semibold text-sm w-64" style={{ color: "#1B2B5E" }}>
              N° TVA
            </label>
            <input type="text" value={tvaNumVal}
              onChange={e => setTvaNumVal(e.target.value)}
              placeholder="CHE-123.456.789 TVA"
              className="border rounded-xl p-2 text-sm w-56" />
          </div>
          <div className="flex items-center gap-4">
            <label className="font-semibold text-sm w-64" style={{ color: "#1B2B5E" }}>
              Taux légal facturé (%)
            </label>
            <input type="number" value={tvaTauxVal} step="0.1"
              onChange={e => setTvaTauxVal(e.target.value)}
              className="border rounded-xl p-2 text-sm w-28" />
          </div>
          <div className="flex items-center gap-4">
            <label className="font-semibold text-sm w-64" style={{ color: "#1B2B5E" }}>
              Taux de la dette fiscale nette (%)
            </label>
            <input type="number" value={tvaDettVal} step="0.1"
              onChange={e => setTvaDettVal(e.target.value)}
              placeholder="Ex. 5.9"
              className="border rounded-xl p-2 text-sm w-28" />
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-5">
          Les factures sont toujours établies au taux légal (8.1 %). Le taux de la dette fiscale nette est informatif (méthode forfaitaire pour le décompte AFC) et n'apparaît pas sur les factures.
        </p>
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