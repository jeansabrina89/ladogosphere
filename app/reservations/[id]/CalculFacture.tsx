"use client";

import { useState, useEffect } from "react";
import { calculerMontant } from "../../../src/lib/calculTarif";

type Tarif = { categorie: string; membre: boolean; prix: string };

export default function CalculFacture({
  reservation,
  nb_chiens,
  chien_isole,
  est_membre,
  tarifs,
  montant_actuel,
  cotisation_en_attente,
  cotisation_id,
  cotisation_montant,
}: {
  reservation: any;
  nb_chiens: number;
  chien_isole?: boolean;
  est_membre: boolean;
  tarifs: Tarif[];
  montant_actuel: number | null;
  cotisation_en_attente?: boolean;
  cotisation_id?: string;
  cotisation_montant?: number;
}) {
  const [est_privatif, setEstPrivatif] = useState(!!chien_isole);
  const [inclure_cotisation, setInclureCotisation] = useState(cotisation_en_attente ?? false);
  const [sauvegarde, setSauvegarde] = useState(false);
  const [loading, setLoading] = useState(false);

  const montantBase = calculerMontant({
    tarifs,
    type_reservation: reservation.type_reservation,
    nb_chiens,
    est_membre,
    est_urgence: reservation.urgence,
    est_privatif,
    date_debut: reservation.date_debut,
    date_fin: reservation.date_fin,
  });

  const montantCotisation = inclure_cotisation && cotisation_montant ? cotisation_montant : 0;
  const montantTotal = montantBase + montantCotisation;

  const handleSauvegarder = async () => {
    setLoading(true);

    // Sauvegarder le montant de la réservation
    const res = await fetch(`/api/reservations/${reservation.id}/montant`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ montant: montantTotal }),
    });

    // Si cotisation incluse, la passer en payée
    if (res.ok && inclure_cotisation && cotisation_id) {
      await fetch(`/api/clients/cotisation/${cotisation_id}/payer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date_paiement: new Date().toISOString().split("T")[0] }),
      });
    }

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
            disabled={chien_isole}
            onChange={e => setEstPrivatif(e.target.checked)} />
          <label htmlFor="privatif" className="font-semibold cursor-pointer">
            Box privatif
          </label>
        </div>

        {chien_isole && (
          <p className="text-sm text-red-700 bg-red-50 rounded-xl px-3 py-2">
            🚫🐕 Un chien de cette réservation doit être isolé : tarif privatif appliqué automatiquement.
          </p>
        )}

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-500">Type</p>
            <p className="font-semibold">
              {reservation.type_reservation === "journee" ? "Journée" :
               reservation.type_reservation === "sejour" ? "Séjour" : "Journée d'essai"}
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

        {/* Cotisation en attente */}
        {cotisation_en_attente && cotisation_montant && (
          <div className="border rounded-xl p-3 bg-yellow-50 border-yellow-200">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox"
                checked={inclure_cotisation}
                onChange={e => setInclureCotisation(e.target.checked)} />
              <span className="text-sm font-semibold text-yellow-800">
                ⭐ Inclure adhésion membre {new Date().getFullYear()} — CHF {cotisation_montant.toFixed(2)}
              </span>
            </label>
            <p className="text-xs text-yellow-600 mt-1 ml-6">
              Le client a choisi de payer son adhésion lors de cette réservation.
            </p>
          </div>
        )}

        <div className="border-t pt-3 space-y-2">
          {inclure_cotisation && cotisation_montant && (
            <div className="flex justify-between text-sm text-gray-500">
              <span>Réservation</span>
              <span>{montantBase} CHF</span>
            </div>
          )}
          {inclure_cotisation && cotisation_montant && (
            <div className="flex justify-between text-sm text-yellow-700 font-semibold">
              <span>⭐ Adhésion membre</span>
              <span>+ {cotisation_montant.toFixed(2)} CHF</span>
            </div>
          )}
          <div className="flex justify-between items-center">
            <div>
              <p className="text-gray-500 text-sm">Montant total</p>
              <p className="text-3xl font-bold text-blue-600">{montantTotal} CHF</p>
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
    </div>
  );
}