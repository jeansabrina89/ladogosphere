"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { calculerMontant, compterSejour } from "../../../src/lib/calculTarif";
import { enregistrerMontantCalcule } from "./actions";
import { messageEcart } from "../../../src/lib/facturation";

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
  perm_reservations_modifier,
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
  perm_reservations_modifier: boolean;
}) {
  const router = useRouter();
  const [est_privatif, setEstPrivatif] = useState(!!chien_isole);
  const [inclure_cotisation, setInclureCotisation] = useState(cotisation_en_attente ?? false);
  const [sauvegarde, setSauvegarde] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ecartMsg, setEcartMsg] = useState<string | null>(null);

  const montantBase = calculerMontant({
    tarifs,
    type_reservation: reservation.type_reservation,
    nb_chiens,
    est_membre,
    est_urgence: reservation.urgence,
    est_privatif,
    date_debut: reservation.date_debut,
    date_fin: reservation.date_fin,
    heure_arrivee: reservation.heure_arrivee,
    heure_depart: reservation.heure_depart,
  });

  const detailSejour = reservation.type_reservation === "sejour"
    ? compterSejour({
        date_debut: reservation.date_debut,
        date_fin: reservation.date_fin,
        heure_arrivee: reservation.heure_arrivee,
        heure_depart: reservation.heure_depart,
      })
    : null;

  const montantCotisation = inclure_cotisation && cotisation_montant ? cotisation_montant : 0;
  const montantTotal = montantBase + montantCotisation;

  const handleSauvegarder = async () => {
    setLoading(true);
    setEcartMsg(null);

    // Sauvegarder le montant calculé automatiquement (recalcule ensuite le total dû)
    const res = await enregistrerMontantCalcule(reservation.id, montantTotal);

    if (res.error) {
      alert(res.error);
      setLoading(false);
      return;
    }

    // Si cotisation incluse, la passer en payée
    if (inclure_cotisation && cotisation_id) {
      await fetch(`/api/clients/cotisation/${cotisation_id}/payer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date_paiement: new Date().toISOString().split("T")[0] }),
      });
    }

    setSauvegarde(true);
    setEcartMsg(messageEcart(res.type_ecart, res.ecart));
    setTimeout(() => setSauvegarde(false), 3000);
    router.refresh();
    setLoading(false);
  };

  return (
    <div className="border-t pt-6 mb-6">
      <h2 className="text-2xl font-bold mb-4">💰 Facturation</h2>

      <div className="bg-slate-50 rounded-xl p-4 space-y-3">

        <div className="flex items-center gap-3">
          <input type="checkbox" id="privatif"
            checked={est_privatif}
            disabled={chien_isole || !perm_reservations_modifier}
            onChange={e => perm_reservations_modifier && setEstPrivatif(e.target.checked)} />
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
          {detailSejour && (
            <div>
              <p className="text-gray-500">Durée</p>
              <p className="font-semibold">
                {detailSejour.nb_nuits} séjour{detailSejour.nb_nuits !== 1 ? "s" : ""} (24h)
                {detailSejour.supplement_journee > 0 && " + 1 garde à la journée"}
              </p>
            </div>
          )}
        </div>

        {/* Cotisation en attente */}
        {perm_reservations_modifier && cotisation_en_attente && cotisation_montant && (
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
              <p className="text-gray-500 text-sm">Calculé automatiquement</p>
              <p className="text-3xl font-bold text-blue-600">{montantTotal} CHF</p>
            </div>
            <div className="text-right">
              {(montant_actuel != null) && (
                <p className="text-sm text-gray-400 mb-1">
                  Montant total : {(Number(montant_actuel) || montantTotal).toFixed(2)} CHF
                </p>
              )}
              {perm_reservations_modifier && (
                <button onClick={handleSauvegarder} disabled={loading}
                  className="bg-blue-600 text-white px-4 py-2 rounded-xl hover:bg-blue-700 disabled:opacity-50">
                  {sauvegarde ? "✅ Sauvegardé" : loading ? "..." : "💾 Sauvegarder"}
                </button>
              )}
            </div>
          </div>
          {ecartMsg && (
            <p className="text-sm font-semibold text-orange-600 bg-orange-50 rounded-xl px-3 py-2">
              ⚠️ {ecartMsg}
            </p>
          )}
        </div>

      </div>
    </div>
  );
}