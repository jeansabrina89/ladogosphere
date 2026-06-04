"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function FormDemandeVacances({
  employe_id,
  jours_restants,
  taux_travail,
}: {
  employe_id: string;
  jours_restants: number;
  taux_travail: number;
}) {
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  // Jours travaillés par semaine selon le taux
  const joursParSemaine = Math.round(taux_travail / 100 * 5);

  const calculerJoursVacances = (debut: string, fin: string): number => {
    if (!debut || !fin) return 0;
    // Compter les semaines complètes et partielles
    let totalJours = 0;
    const d = new Date(debut + "T12:00:00");
    const f = new Date(fin + "T12:00:00");

    // Compter les semaines entre les deux dates
    while (d <= f) {
      const jourSemaine = d.getDay();
      // On compte les jours ouvrables (lun-ven)
      if (jourSemaine !== 0 && jourSemaine !== 6) {
        totalJours++;
      }
      d.setDate(d.getDate() + 1);
    }

    // Calculer le nombre de semaines pleines et le reste
    const nbSemainesCompletes = Math.floor(totalJours / 5);
    const joursRestants = totalJours % 5;

    // Pour chaque semaine complète : joursParSemaine jours déduits
    // Pour les jours restants : prorata
    const joursDeduitsComplets = nbSemainesCompletes * joursParSemaine;
    const joursDeduitsReste = Math.round(joursRestants * joursParSemaine / 5);

    return joursDeduitsComplets + joursDeduitsReste;
  };

  const nbJours = calculerJoursVacances(dateDebut, dateFin);
  const depasseSolde = nbJours > jours_restants;

  const handleSubmit = async () => {
    if (!dateDebut || !dateFin) {
      setError("Veuillez sélectionner les dates.");
      return;
    }
    if (nbJours <= 0) {
      setError("La période sélectionnée ne contient aucun jour travaillé.");
      return;
    }
    if (depasseSolde) {
      setError("Vous n'avez pas assez de jours de vacances.");
      return;
    }
    setError("");
    setLoading(true);

    const res = await fetch("/api/rh/vacances", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employe_id,
        date_debut: dateDebut,
        date_fin: dateFin,
        nb_jours: nbJours,
        note_employe: note || null,
      }),
    });

    if (res.ok) {
      setSuccess(true);
      setDateDebut("");
      setDateFin("");
      setNote("");
      router.refresh();
    } else {
      const data = await res.json();
      setError(data.error || "Erreur lors de la demande.");
    }
    setLoading(false);
  };

  const demain = new Date();
  demain.setDate(demain.getDate() + 1);
  const dateMin = demain.toISOString().split("T")[0];

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-100 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>
      )}
      {success && (
        <div className="bg-green-100 text-green-700 px-4 py-3 rounded-xl text-sm font-semibold">
          ✅ Demande envoyée ! En attente de validation.
        </div>
      )}

      <div className="bg-blue-50 rounded-xl p-3 text-xs text-blue-600">
        ℹ️ À {taux_travail}% vous travaillez {joursParSemaine}j/semaine —
        1 semaine de vacances = {joursParSemaine}j déduits
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold mb-1" style={{ color: "#1B2B5E" }}>
            Date début *
          </label>
          <input type="date" value={dateDebut} min={dateMin}
            onChange={e => setDateDebut(e.target.value)}
            className="w-full border rounded-xl p-3" />
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1" style={{ color: "#1B2B5E" }}>
            Date fin *
          </label>
          <input type="date" value={dateFin} min={dateDebut || dateMin}
            onChange={e => setDateFin(e.target.value)}
            className="w-full border rounded-xl p-3" />
        </div>
      </div>

      {nbJours > 0 && (
        <div className={`rounded-xl p-3 text-sm font-semibold ${
          depasseSolde ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"
        }`}>
          {nbJours}j déduits · {jours_restants}j restants
          {depasseSolde && " ⚠️ Solde insuffisant"}
        </div>
      )}

      <div>
        <label className="block text-sm font-semibold mb-1" style={{ color: "#1B2B5E" }}>
          Note (optionnel)
        </label>
        <textarea value={note} onChange={e => setNote(e.target.value)}
          rows={2} placeholder="Motif, commentaire..."
          className="w-full border rounded-xl p-3 text-sm" />
      </div>

      <button onClick={handleSubmit} disabled={loading || depasseSolde || nbJours <= 0}
        className="w-full py-3 rounded-xl font-semibold text-white disabled:opacity-50"
        style={{ backgroundColor: "#C9A84C" }}>
        {loading ? "Envoi..." : "📤 Envoyer la demande"}
      </button>
    </div>
  );
}