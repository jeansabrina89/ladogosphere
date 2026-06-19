"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { joursVacancesTheoriques } from "@/src/lib/planningUtils";

type Employe = { id: string; prenom: string; nom: string; taux_travail: number };

export default function FormPoserVacances({ employes }: { employes: Employe[] }) {
  const [ouvert, setOuvert] = useState(false);
  const [employeId, setEmployeId] = useState("");
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const emp = employes.find((e) => e.id === employeId);
  const estimation =
    emp && dateDebut && dateFin && dateFin >= dateDebut
      ? joursVacancesTheoriques(emp.taux_travail, dateDebut, dateFin)
      : 0;

  const reinit = () => {
    setEmployeId(""); setDateDebut(""); setDateFin(""); setNote(""); setError("");
  };

  const enregistrer = async () => {
    if (!employeId || !dateDebut || !dateFin) {
      setError("Choisis un employé et les deux dates.");
      return;
    }
    if (dateFin < dateDebut) {
      setError("La date de fin doit être après la date de début.");
      return;
    }
    setError("");
    setLoading(true);

    // 1. Créer la demande
    const resCreer = await fetch("/api/rh/vacances", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employe_id: employeId,
        date_debut: dateDebut,
        date_fin: dateFin,
        nb_jours: estimation,
        note_employe: null,
      }),
    });
    const dataCreer = await resCreer.json().catch(() => ({}));
    if (!resCreer.ok) {
      setLoading(false);
      setError(dataCreer.error ?? "Erreur lors de la création.");
      return;
    }

    // 2. Valider d'office → calcule les jours définitifs + met à jour planning et heures
    const resValider = await fetch("/api/rh/vacances", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: dataCreer.id,
        statut: "acceptee",
        note_admin: note || null,
      }),
    });
    setLoading(false);
    if (!resValider.ok) {
      const dataValider = await resValider.json().catch(() => ({}));
      setError(dataValider.error ?? "Vacances créées mais validation impossible.");
      return;
    }

    setOuvert(false);
    reinit();
    router.refresh();
  };

  return (
    <>
      <button onClick={() => setOuvert(true)}
        className="px-4 py-2 rounded-xl font-semibold text-white text-sm"
        style={{ backgroundColor: "#2E8B7E" }}>
        ➕ Poser des vacances
      </button>

      {ouvert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="bg-white rounded-xl p-6 shadow-xl w-full max-w-md">
            <h3 className="font-bold mb-4 text-lg" style={{ color: "#1B2B5E" }}>
              Poser des vacances
            </h3>

            {error && (
              <div className="bg-red-100 text-red-700 px-4 py-3 rounded-xl text-sm mb-4">{error}</div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-1" style={{ color: "#1B2B5E" }}>
                  Employé *
                </label>
                <select value={employeId} onChange={(e) => setEmployeId(e.target.value)}
                  className="w-full border rounded-xl p-3">
                  <option value="">— Choisir —</option>
                  {employes.map((e) => (
                    <option key={e.id} value={e.id}>{e.prenom} {e.nom} — {e.taux_travail}%</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-1" style={{ color: "#1B2B5E" }}>
                    Date début *
                  </label>
                  <input type="date" value={dateDebut}
                    onChange={(e) => setDateDebut(e.target.value)}
                    className="w-full border rounded-xl p-3" />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1" style={{ color: "#1B2B5E" }}>
                    Date fin *
                  </label>
                  <input type="date" value={dateFin} min={dateDebut || undefined}
                    onChange={(e) => setDateFin(e.target.value)}
                    className="w-full border rounded-xl p-3" />
                </div>
              </div>

              {estimation > 0 && (
                <div className="rounded-xl p-3 text-sm font-semibold bg-green-50 text-green-700">
                  ≈ {estimation}j décomptés (calcul automatique selon le taux)
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold mb-1" style={{ color: "#1B2B5E" }}>
                  Note (optionnel)
                </label>
                <textarea value={note} onChange={(e) => setNote(e.target.value)}
                  rows={2} placeholder="Motif, commentaire..."
                  className="w-full border rounded-xl p-3 text-sm" />
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button onClick={enregistrer} disabled={loading}
                className="flex-1 py-2 rounded-xl font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: "#2E8B7E" }}>
                {loading ? "Enregistrement..." : "Valider les vacances"}
              </button>
              <button onClick={() => { setOuvert(false); reinit(); }}
                className="px-4 py-2 rounded-xl text-sm font-semibold"
                style={{ backgroundColor: "#EDE8DF", color: "#1B2B5E" }}>
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
