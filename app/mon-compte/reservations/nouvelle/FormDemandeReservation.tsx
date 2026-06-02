"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Chien = { id: string; nom: string; race: string; poids: number; categorie_poids: string };

// Générer les créneaux par tranches de 15 min
function genererCreneaux(heureDebut: string, heureFin: string): string[] {
  const creneaux: string[] = [];
  const [hD, mD] = heureDebut.split(":").map(Number);
  const [hF, mF] = heureFin.split(":").map(Number);
  let h = hD, m = mD;
  while (h < hF || (h === hF && m <= mF)) {
    creneaux.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    m += 15;
    if (m >= 60) { m -= 60; h++; }
  }
  return creneaux;
}

const creneauxArriveeJournee = genererCreneaux("07:35", "10:00");
const creneauxArriveeSeJour = genererCreneaux("09:00", "10:00");
const creneauxDepart = genererCreneaux("17:00", "18:00");

export default function FormDemandeReservation({
  client_id,
  chiens,
  est_membre,
}: {
  client_id: string;
  chiens: Chien[];
  est_membre: boolean;
}) {
  const [type, setType] = useState("journee");
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [heureArrivee, setHeureArrivee] = useState("");
  const [heureDepart, setHeureDepart] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const handleDateDebutChange = (val: string) => {
    setDateDebut(val);
    if (type === "journee") setDateFin(val);
  };

  const creneauxArrivee = type === "journee" ? creneauxArriveeJournee : creneauxArriveeSeJour;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const form = e.currentTarget;
    const formData = new FormData(form);
    formData.set("client_id", client_id);
    if (type === "journee") formData.set("date_fin", dateDebut);

    const response = await fetch("/api/reservations/client", {
      method: "POST",
      body: formData,
    });

    if (response.ok) {
      router.push("/mon-compte/reservations");
      router.refresh();
    } else {
      const data = await response.json();
      setError(data.error || "Une erreur est survenue.");
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">

      {error && (
        <div className="bg-red-100 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>
      )}

      {/* Chiens */}
      <div>
        <label className="block font-semibold mb-2" style={{ color: "#1B2B5E" }}>
          Chien(s) *
        </label>
        {chiens.length === 0 ? (
          <p className="text-gray-400 text-sm">
            Aucun chien enregistré.{" "}
            <a href="/mon-compte/chiens/nouveau" style={{ color: "#4AAEA0" }}>
              Ajouter un chien →
            </a>
          </p>
        ) : (
          <div className="border rounded-xl p-3 space-y-2">
            {chiens.map(c => (
              <label key={c.id} className="flex items-center gap-2">
                <input type="checkbox" name="chien_ids" value={c.id} />
                <span className="text-sm">
                  {c.nom} — {c.race || "—"} —{" "}
                  {c.poids ? `${c.poids} kg` : "?"} —{" "}
                  {c.categorie_poids === "moins_15kg" ? "🟢 Petit" :
                   c.categorie_poids === "15_30kg" ? "🟡 Moyen" :
                   c.categorie_poids === "30_40kg" ? "🔴 Grand" : "—"}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Type */}
      <div>
        <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>Type *</label>
        <select name="type_reservation" required
          value={type} onChange={e => {
            setType(e.target.value);
            setHeureArrivee("");
            if (e.target.value === "journee" && dateDebut) setDateFin(dateDebut);
          }}
          className="w-full border rounded-xl p-3">
          <option value="journee">Journée</option>
          <option value="sejour">Séjour</option>
        </select>
      </div>

      {/* Dates */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>Date arrivée *</label>
          <input name="date_debut" type="date" required
            value={dateDebut}
            onChange={e => handleDateDebutChange(e.target.value)}
            className="w-full border rounded-xl p-3" />
        </div>
        <div>
          <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>Date départ *</label>
          {type === "journee" ? (
            <>
              <input type="date" value={dateDebut} readOnly
                className="w-full border rounded-xl p-3 bg-gray-100 text-gray-500 cursor-not-allowed" />
              <p className="text-xs text-gray-400 mt-1">Même jour</p>
            </>
          ) : (
            <input name="date_fin" type="date" required
              value={dateFin} min={dateDebut}
              onChange={e => setDateFin(e.target.value)}
              className="w-full border rounded-xl p-3" />
          )}
        </div>
      </div>

      {/* Heures */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>
            Heure arrivée *
            <span className="text-gray-400 font-normal text-xs ml-1">
              {type === "journee" ? "(7h35–10h)" : "(9h–10h)"}
            </span>
          </label>
          <select name="heure_arrivee" required
            value={heureArrivee}
            onChange={e => setHeureArrivee(e.target.value)}
            className="w-full border rounded-xl p-3">
            <option value="">-- Choisir --</option>
            {creneauxArrivee.map(h => (
              <option key={h} value={h}>{h}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>
            Heure départ *
            <span className="text-gray-400 font-normal text-xs ml-1">(17h–18h)</span>
          </label>
          <select name="heure_depart" required
            value={heureDepart}
            onChange={e => setHeureDepart(e.target.value)}
            className="w-full border rounded-xl p-3">
            <option value="">-- Choisir --</option>
            {creneauxDepart.map(h => (
              <option key={h} value={h}>{h}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Commentaire */}
      <div>
        <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>
          Message / remarques
        </label>
        <textarea name="commentaire_client" rows={3}
          placeholder="Informations particulières, demandes spéciales..."
          className="w-full border rounded-xl p-3" />
      </div>

      {/* Info */}
      <div className="rounded-xl p-4 text-sm"
        style={{ backgroundColor: "#E8F5F4", border: "1px solid #4AAEA0", color: "#1B2B5E" }}>
        ℹ️ Votre demande sera traitée par notre équipe. Vous recevrez une confirmation sous 24h.
        {est_membre && <span className="block mt-1 font-semibold">⭐ Tarifs membres appliqués.</span>}
      </div>

      <div className="flex gap-3 pt-2">
        <button type="submit" disabled={loading}
          className="px-6 py-3 rounded-xl font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: "#4AAEA0" }}>
          {loading ? "Envoi en cours..." : "📤 Envoyer la demande"}
        </button>
        <a href="/mon-compte/reservations"
          className="px-6 py-3 rounded-xl font-semibold"
          style={{ backgroundColor: "#EDE8DF", color: "#1B2B5E" }}>
          ✖ Annuler
        </a>
      </div>

    </form>
  );
}