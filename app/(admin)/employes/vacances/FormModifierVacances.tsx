"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { joursVacancesTheoriques } from "@/src/lib/planningUtils";

export default function FormModifierVacances({
  id,
  date_debut_initiale,
  date_fin_initiale,
  statut,
  taux_travail,
  note_admin_initiale,
}: {
  id: string;
  date_debut_initiale: string;
  date_fin_initiale: string;
  statut: string;
  taux_travail: number;
  note_admin_initiale: string | null;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [dateDebut, setDateDebut] = useState(date_debut_initiale);
  const [dateFin, setDateFin] = useState(date_fin_initiale);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const estimation =
    dateDebut && dateFin && dateFin >= dateDebut
      ? joursVacancesTheoriques(taux_travail, dateDebut, dateFin)
      : 0;

  const enregistrer = async () => {
    if (!dateDebut || !dateFin) {
      setError("Renseigne les deux dates.");
      return;
    }
    if (dateFin < dateDebut) {
      setError("La date de fin doit être après la date de début.");
      return;
    }
    setError("");
    setLoading(true);

    try {
      // Si la vacance est validée, on défait d'abord l'ancienne période
      if (statut === "acceptee") {
        const r1 = await fetch("/api/rh/vacances", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, statut: "en_attente", note_admin: note_admin_initiale }),
        });
        if (!r1.ok) throw new Error((await r1.json().catch(() => ({}))).error ?? "Erreur (étape 1).");
      }

      // Changer les dates
      const r2 = await fetch("/api/rh/vacances", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, date_debut: dateDebut, date_fin: dateFin, nb_jours: estimation }),
      });
      if (!r2.ok) throw new Error((await r2.json().catch(() => ({}))).error ?? "Erreur lors de la modification.");

      // Si elle était validée, on la re-valide sur la nouvelle période (recalcul + planning)
      if (statut === "acceptee") {
        const r3 = await fetch("/api/rh/vacances", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, statut: "acceptee", note_admin: note_admin_initiale }),
        });
        if (!r3.ok) throw new Error((await r3.json().catch(() => ({}))).error ?? "Erreur (revalidation).");
      }

      setOuvert(false);
      router.refresh();
    } catch (e: any) {
      setError(e.message ?? "Erreur.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button onClick={() => setOuvert(true)}
        className="px-3 py-1.5 rounded-lg text-xs font-semibold"
        style={{ backgroundColor: "#EDE8DF", color: "#1B2B5E" }}
        title="Modifier les dates">
        ✏️
      </button>

      {ouvert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="bg-white rounded-xl p-6 shadow-xl w-full max-w-md">
            <h3 className="font-bold mb-4 text-lg" style={{ color: "#1B2B5E" }}>
              Modifier les dates
            </h3>

            {error && (
              <div className="bg-red-100 text-red-700 px-4 py-3 rounded-xl text-sm mb-4">{error}</div>
            )}

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
              <div className="rounded-xl p-3 text-sm font-semibold bg-green-50 text-green-700 mt-4">
                ≈ {estimation}j décomptés (recalculé automatiquement)
              </div>
            )}

            <div className="flex gap-3 mt-5">
              <button onClick={enregistrer} disabled={loading}
                className="flex-1 py-2 rounded-xl font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: "#2E8B7E" }}>
                {loading ? "Enregistrement..." : "Enregistrer"}
              </button>
              <button onClick={() => { setOuvert(false); setDateDebut(date_debut_initiale); setDateFin(date_fin_initiale); setError(""); }}
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
