"use client";

import { useState } from "react";
import { calculerMontant } from "../../../src/lib/calculTarif";

type Tarif = { categorie: string; membre: boolean; prix: string };

export default function CalculFacture({
  reservation,
  nb_chiens,
  est_membre,
  tarifs,
  montant_actuel,
}: {
  reservation: any;
  nb_chiens: number;
  est_membre: boolean;
  tarifs: Tarif[];
  montant_actuel: number | null;
}) {
  console.log("CalculFacture rendu", { nb_chiens, est_membre, tarifs: tarifs.length });

  const [est_privatif, setEstPrivatif] = useState(false);
  const [sauvegarde, setSauvegarde] = useState(false);
  const [loading, setLoading] = useState(false);

  const montant = calculerMontant({
    tarifs,
    type_reservation: reservation.type_reservation,
    nb_chiens,
    est_membre,
    est_urgence: reservation.urgence,
    est_privatif,
    date_debut: reservation.date_debut,
    date_fin: reservation.date_fin,
  });

  const handleSauvegarder = async () => {
    setLoading(true);
    const res = await fetch(`/api/reservations/${reservation.id}/montant`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ montant }),
    });
    if (res.ok) setSauvegarde(true);
    setLoading(false);
  };

  return (
    <div className="border-t pt-6 mb-6">
      <h2 className="text-2xl font-bold mb-4">💰 Facturation</h2>

      <div className="bg-slate-50 rounded-xl p-4 space-y-3">

        <div className="flex items-center gap-3">
          <input type="checkbox" id="privatif"
            checked={est_privatif}
            onChange={e => setEstPrivatif(e.target.checked)} />
          <label htmlFor="privatif" className="font-semibold cursor-pointer">
            Box privatif
          </label>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-500">Type</p>
            <p className="font-semibold">
              {reservation.type_reservation === "journee" ? "Journée" : "Séjour"}
            </p>
          </div>
          <div>
            <p className="text-gray-500">Nb chiens</p>
            <p className="font-semibold">{nb_chiens}</p>
          </div>
          <div>
            <p className="text-gray-500">Client</p>
            <p className="font-semibold">{est_membre ? "⭐ Membre" : "Standard"}</p>
          </div>
          <div>
            <p className="text-gray-500">Urgence</p>
            <p className="font-semibold">{reservation.urgence ? "🚨 Oui" : "Non"}</p>
          </div>
          {reservation.type_reservation === "sejour" && (
            <div>
              <p className="text-gray-500">Durée</p>
              <p className="font-semibold">
                {Math.max(1, Math.round((new Date(reservation.date_fin).getTime() - new Date(reservation.date_debut).getTime()) / (1000 * 60 * 60 * 24)) + 1)} jour(s)
              </p>
            </div>
          )}
        </div>

        <div className="border-t pt-3 flex justify-between items-center">
          <div>
            <p className="text-gray-500 text-sm">Montant calculé</p>
            <p className="text-3xl font-bold text-blue-600">{montant} CHF</p>
          </div>
          <div className="text-right">
            {montant_actuel && (
              <p className="text-sm text-gray-400 mb-1">
                Actuel : {montant_actuel} CHF
              </p>
            )}
            <button onClick={handleSauvegarder} disabled={loading}
              className="bg-blue-600 text-white px-4 py-2 rounded-xl hover:bg-blue-700 disabled:opacity-50">
              {sauvegarde ? "✅ Sauvegardé" : loading ? "..." : "💾 Sauvegarder"}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}