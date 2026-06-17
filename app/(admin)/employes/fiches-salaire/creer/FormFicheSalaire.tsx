"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type Employe = { id: string; prenom: string; nom: string; salaire_base: number; taux_travail: number };
type Modele = { id: string; label: string; type: string; valeur: number; actif: boolean };
type LigneDeduction = { label: string; type: string; valeur: number; montant_calcule: number; ordre: number };

const MOIS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

export default function FormFicheSalaire({
  employes, modeles, employe_id_initial,
}: {
  employes: Employe[];
  modeles: Modele[];
  employe_id_initial: string;
}) {
  const [employeId, setEmployeId] = useState(employe_id_initial);
  const [mois, setMois] = useState(new Date().getMonth() + 1);
  const [annee, setAnnee] = useState(new Date().getFullYear());
  const [salaireBrut, setSalaireBrut] = useState(0);
  const [deductions, setDeductions] = useState<LigneDeduction[]>([]);
  const [commentaire, setCommentaire] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const employe = employes.find(e => e.id === employeId);

  // Initialiser le salaire brut et les déductions quand l'employé change
  useEffect(() => {
    if (employe) {
      const brut = employe.salaire_base * employe.taux_travail / 100;
      setSalaireBrut(brut);
      calculerDeductions(brut);
    }
  }, [employeId]);

  // Recalculer les déductions quand le salaire brut change
  useEffect(() => {
    if (salaireBrut > 0) {
      calculerDeductions(salaireBrut);
    }
  }, [salaireBrut]);

  const calculerDeductions = (brut: number) => {
    const lignes = modeles.map((m, i) => ({
      label: m.label,
      type: m.type,
      valeur: m.valeur,
      montant_calcule: m.type === "pourcentage"
        ? Math.round(brut * m.valeur / 100 * 100) / 100
        : m.valeur,
      ordre: i + 1,
    }));
    setDeductions(lignes);
  };

  const totalDeductions = deductions.reduce((acc, d) => acc + d.montant_calcule, 0);
  const salaireNet = salaireBrut - totalDeductions;

  const handleDeductionChange = (index: number, field: string, value: any) => {
    const newDeductions = [...deductions];
    newDeductions[index] = { ...newDeductions[index], [field]: value };

    if (field === "valeur" || field === "type") {
      const d = newDeductions[index];
      newDeductions[index].montant_calcule = d.type === "pourcentage"
        ? Math.round(salaireBrut * d.valeur / 100 * 100) / 100
        : d.valeur;
    }
    setDeductions(newDeductions);
  };

  const ajouterLigne = () => {
    setDeductions([...deductions, {
      label: "",
      type: "montant_fixe",
      valeur: 0,
      montant_calcule: 0,
      ordre: deductions.length + 1,
    }]);
  };

  const supprimerLigne = (index: number) => {
    setDeductions(deductions.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!employeId || salaireBrut <= 0) {
      alert("Veuillez sélectionner un employé et saisir un salaire.");
      return;
    }
    setLoading(true);

    const res = await fetch("/api/rh/fiches-salaire", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employe_id: employeId,
        mois,
        annee,
        salaire_brut: salaireBrut,
        salaire_net: salaireNet,
        total_deductions: totalDeductions,
        commentaire,
        deductions,
      }),
    });

    if (res.ok) {
      const { id } = await res.json();
      router.push(`/employes/fiches-salaire/${id}`);
    } else {
      const data = await res.json();
      alert(data.error || "Erreur lors de la création.");
    }
    setLoading(false);
  };

  return (
    <div className="bg-white rounded-xl p-8 shadow-sm space-y-6">

      {/* Employé */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>Employé *</label>
          <select value={employeId} onChange={e => setEmployeId(e.target.value)}
            className="w-full border rounded-xl p-3">
            <option value="">-- Sélectionner --</option>
            {employes.map(e => (
              <option key={e.id} value={e.id}>{e.prenom} {e.nom}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>Mois *</label>
            <select value={mois} onChange={e => setMois(parseInt(e.target.value))}
              className="w-full border rounded-xl p-3">
              {MOIS.map((m, i) => (
                <option key={i + 1} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>Année *</label>
            <input type="number" value={annee} onChange={e => setAnnee(parseInt(e.target.value))}
              className="w-full border rounded-xl p-3" />
          </div>
        </div>
      </div>

      {/* Salaire brut */}
      <div>
        <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>
          Salaire brut (CHF) *
        </label>
        <input type="number" step="0.05" value={salaireBrut}
          onChange={e => setSalaireBrut(parseFloat(e.target.value) || 0)}
          className="w-full border rounded-xl p-3 text-lg font-bold" />
        {employe && (
          <p className="text-xs text-gray-400 mt-1">
            Base : CHF {(employe.salaire_base * employe.taux_travail / 100).toFixed(2)} ({employe.taux_travail}%)
          </p>
        )}
      </div>

      {/* Déductions */}
      <div>
        <div className="flex justify-between items-center mb-3">
          <label className="font-semibold" style={{ color: "#1B2B5E" }}>Déductions</label>
          <button onClick={ajouterLigne} type="button"
            className="px-3 py-1 rounded-lg text-sm font-semibold text-white"
            style={{ backgroundColor: "#4AAEA0" }}>
            ➕ Ajouter
          </button>
        </div>
        <div className="space-y-2">
          {deductions.map((d, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center">
              <input value={d.label} onChange={e => handleDeductionChange(i, "label", e.target.value)}
                className="col-span-4 border rounded-lg p-2 text-sm" placeholder="Label" />
              <select value={d.type} onChange={e => handleDeductionChange(i, "type", e.target.value)}
                className="col-span-3 border rounded-lg p-2 text-sm">
                <option value="pourcentage">%</option>
                <option value="montant_fixe">CHF fixe</option>
              </select>
              <input type="number" step="0.01" value={d.valeur}
                onChange={e => handleDeductionChange(i, "valeur", parseFloat(e.target.value) || 0)}
                className="col-span-2 border rounded-lg p-2 text-sm" />
              <div className="col-span-2 text-right text-sm font-bold" style={{ color: "#E8847A" }}>
                -{d.montant_calcule.toFixed(2)}
              </div>
              <button onClick={() => supprimerLigne(i)}
                className="col-span-1 text-red-400 hover:text-red-600 text-center">
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Récap */}
      <div className="bg-gray-50 rounded-xl p-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Salaire brut</span>
          <span className="font-bold">CHF {salaireBrut.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-sm text-red-600">
          <span>Total déductions</span>
          <span className="font-bold">- CHF {totalDeductions.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-lg font-bold border-t pt-2" style={{ color: "#1B2B5E" }}>
          <span>Salaire net</span>
          <span>CHF {salaireNet.toFixed(2)}</span>
        </div>
      </div>

      {/* Commentaire */}
      <div>
        <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>Commentaire (optionnel)</label>
        <textarea value={commentaire} onChange={e => setCommentaire(e.target.value)}
          rows={2} className="w-full border rounded-xl p-3 text-sm" />
      </div>

      {/* Boutons */}
      <div className="flex gap-3 pt-4 border-t">
        <button onClick={handleSubmit} disabled={loading}
          className="px-6 py-3 rounded-xl font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: "#4AAEA0" }}>
          {loading ? "Génération..." : "💾 Générer la fiche"}
        </button>
        <a href="/employes/fiches-salaire"
          className="px-6 py-3 rounded-xl font-semibold"
          style={{ backgroundColor: "#EDE8DF", color: "#1B2B5E" }}>
          ✖ Annuler
        </a>
      </div>
    </div>
  );
}