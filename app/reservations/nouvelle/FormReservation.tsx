"use client";

import { useState } from "react";

type Client = { id: string; prenom: string; nom: string; membre: boolean };
type Chien = { id: string; nom: string; race: string; categorie_poids: string; poids: number; client_id: string };
type Box = { id: string; numero: number };

export default function FormReservation({
  clients,
  chiens,
  boxes,
}: {
  clients: Client[];
  chiens: Chien[];
  boxes: Box[];
}) {
  const [type, setType] = useState("journee");
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [heureArrivee, setHeureArrivee] = useState("");
  const [heureDepart, setHeureDepart] = useState("");
  const [loading, setLoading] = useState(false);

  const handleTypeChange = (val: string) => {
    setType(val);
    if (val === "journee" && dateDebut) setDateFin(dateDebut);
  };

  const handleDateDebutChange = (val: string) => {
    setDateDebut(val);
    if (type === "journee") setDateFin(val);
  };

  const verifierHoraires = (): boolean => {
    if (type === "journee") {
      const arriveeOk = !heureArrivee || (heureArrivee >= "07:35" && heureArrivee <= "10:00");
      const departOk = !heureDepart || (heureDepart >= "17:00" && heureDepart <= "18:00");
      if (!arriveeOk || !departOk) {
        return confirm(
          "⚠️ Horaire hors plage habituelle !\n" +
          "Journée : arrivée 7h35–10h00 · départ 17h00–18h00\n\n" +
          "Confirmer quand même ?"
        );
      }
    }
    if (type === "sejour") {
      const arriveeOk = !heureArrivee || (heureArrivee >= "09:00" && heureArrivee <= "10:00");
      const departOk = !heureDepart || (heureDepart >= "17:00" && heureDepart <= "18:00");
      if (!arriveeOk || !departOk) {
        return confirm(
          "⚠️ Horaire hors plage habituelle !\n" +
          "Séjour : arrivée 9h00–10h00 · départ 17h00–18h00\n\n" +
          "Confirmer quand même ?"
        );
      }
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!verifierHoraires()) return;

    setLoading(true);

    const form = e.currentTarget;
    const formData = new FormData(form);

    if (type === "journee") {
      formData.set("date_fin", dateDebut);
    }

    const response = await fetch("/api/reservations", {
      method: "POST",
      body: formData,
    });

    if (response.ok) {
      const { id } = await response.json();
      window.location.href = `/reservations/${id}`;
    } else {
      const { error } = await response.json();
      alert("Erreur : " + error);
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-100 p-8">
      <div className="max-w-3xl mx-auto bg-white rounded-xl p-8 shadow">

        <h1 className="text-4xl font-bold mb-6">➕ Nouvelle réservation</h1>

        <form onSubmit={handleSubmit} className="space-y-6">

          {/* Client */}
          <div>
            <label className="block font-semibold mb-1">Client *</label>
            <select name="client_id" required className="w-full border rounded-xl p-3">
              <option value="">-- Sélectionner un client --</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>
                  {c.prenom} {c.nom} {c.membre ? "⭐" : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Chiens */}
          <div>
            <label className="block font-semibold mb-1">Chien(s) *</label>
            <div className="border rounded-xl p-3 space-y-2 max-h-48 overflow-y-auto">
              {chiens.map(c => (
                <label key={c.id} className="flex items-center gap-2">
                  <input type="checkbox" name="chien_ids" value={c.id} />
                  <span>
                    {c.nom} — {c.race || "—"} —{" "}
                    {c.poids ? `${c.poids} kg` : "?"} —{" "}
                    {c.categorie_poids === "moins_15kg" ? "🟢 Petit" :
                     c.categorie_poids === "15_30kg" ? "🟡 Moyen" :
                     c.categorie_poids === "30_40kg" ? "🔴 Grand" : "—"}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Box */}
          <div>
            <label className="block font-semibold mb-1">Box *</label>
            <select name="box_id" required className="w-full border rounded-xl p-3">
              <option value="">-- Sélectionner un box --</option>
              {boxes.map(b => (
                <option key={b.id} value={b.id}>Box {b.numero}</option>
              ))}
            </select>
          </div>

          {/* Type */}
          <div>
            <label className="block font-semibold mb-1">Type *</label>
            <select name="type_reservation" required className="w-full border rounded-xl p-3"
              value={type} onChange={e => handleTypeChange(e.target.value)}>
              <option value="journee">Journée</option>
              <option value="sejour">Séjour</option>
            </select>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold mb-1">Date début *</label>
              <input name="date_debut" type="date" required
                value={dateDebut}
                onChange={e => handleDateDebutChange(e.target.value)}
                className="w-full border rounded-xl p-3" />
            </div>
            <div>
              <label className="block font-semibold mb-1">Date fin *</label>
              {type === "journee" ? (
                <>
                  <input name="date_fin" type="date"
                    value={dateDebut}
                    readOnly
                    className="w-full border rounded-xl p-3 bg-gray-100 text-gray-500 cursor-not-allowed" />
                  <p className="text-xs text-gray-400 mt-1">Même jour que l'arrivée</p>
                </>
              ) : (
                <input name="date_fin" type="date" required
                  value={dateFin}
                  min={dateDebut}
                  onChange={e => setDateFin(e.target.value)}
                  className="w-full border rounded-xl p-3" />
              )}
            </div>
          </div>

          {/* Heures */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold mb-1">
                Heure arrivée
                <span className="text-gray-400 font-normal text-xs ml-1">
                  {type === "journee" ? "(7h35–10h00)" : "(9h00–10h00)"}
                </span>
              </label>
              <input name="heure_arrivee" type="time"
                value={heureArrivee}
                onChange={e => setHeureArrivee(e.target.value)}
                className="w-full border rounded-xl p-3" />
            </div>
            <div>
              <label className="block font-semibold mb-1">
                Heure départ
                <span className="text-gray-400 font-normal text-xs ml-1">(17h00–18h00)</span>
              </label>
              <input name="heure_depart" type="time"
                value={heureDepart}
                onChange={e => setHeureDepart(e.target.value)}
                className="w-full border rounded-xl p-3" />
            </div>
          </div>

          {/* Urgence */}
          <div className="flex items-center gap-2">
            <input type="checkbox" name="urgence" id="urgence" />
            <label htmlFor="urgence" className="font-semibold">
              🚨 Réservation urgence (membres uniquement)
            </label>
          </div>

          {/* Statut */}
          <div>
            <label className="block font-semibold mb-1">Statut</label>
            <select name="statut" className="w-full border rounded-xl p-3">
              <option value="en_attente">⏳ En attente</option>
              <option value="confirmee">✅ Confirmée</option>
            </select>
          </div>

          {/* Commentaire */}
          <div>
            <label className="block font-semibold mb-1">Commentaire admin</label>
            <textarea name="commentaire_admin" rows={3}
              className="w-full border rounded-xl p-3" />
          </div>

          {/* Boutons */}
          <div className="flex gap-3 pt-4 border-t">
            <button type="submit" disabled={loading}
              className="bg-blue-600 text-white px-6 py-3 rounded-xl hover:bg-blue-700 disabled:opacity-50">
              {loading ? "Enregistrement..." : "💾 Enregistrer"}
            </button>
            <a href="/reservations"
              className="bg-gray-200 text-gray-700 px-6 py-3 rounded-xl hover:bg-gray-300">
              ✖ Annuler
            </a>
          </div>

        </form>
      </div>
    </main>
  );
}