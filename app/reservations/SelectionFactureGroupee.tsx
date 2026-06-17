"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatDateFR } from "@/src/lib/dates";
import { formatBoxLabel } from "@/src/lib/boxes";
import BoutonPaiementRapide from "./BoutonPaiementRapide";
import { montantDuReservation } from "@/src/lib/montants";

function estFacturable(res: any): boolean {
  if (!["validee", "terminee"].includes(res.statut)) return false;
  if (!["impaye", "partiel"].includes(res.statut_paiement ?? "")) return false;
  return calculerReste(res) > 0;
}

function calculerReste(res: any): number {
  const total = Number(res.montant_final ?? res.montant_calcule ?? 0);
  const paye = Number(res.montant_paye ?? 0);
  return Math.max(0, total - paye);
}

function libelleType(t: string): string {
  if (t === "journee") return "Journée";
  if (t === "sejour") return "Séjour";
  if (t === "essai") return "Journée d'essai";
  return t;
}

export default function SelectionFactureGroupee({
  reservations,
  permEncaissements,
}: {
  reservations: any[];
  permEncaissements: boolean;
}) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  const toggleId = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setErreur(null);
    setSucces(null);
  };

  const selectedList = reservations.filter(r => selectedIds.has(r.id));
  const totalSelectionne = selectedList.reduce((s, r) => s + calculerReste(r), 0);

  const clientsUniques = new Set(selectedList.map(r => r.client_id));
  const memeClient = clientsUniques.size <= 1;

  const handleCreerFacture = async () => {
    setLoading(true);
    setErreur(null);
    setSucces(null);
    try {
      const res = await fetch("/api/factures/groupee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservation_ids: Array.from(selectedIds) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErreur(data.error ?? "Erreur inconnue.");
        return;
      }
      router.push(`/factures/${data.facture_id}`);
    } catch {
      setErreur("Erreur réseau.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {succes && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-green-50 border border-green-200 text-green-700 font-semibold text-sm">
          ✅ {succes}
        </div>
      )}

      <div className="grid gap-4">
        {reservations.length === 0 && (
          <p className="text-gray-400">Aucune réservation trouvée.</p>
        )}
        {reservations.map((res: any) => {
          const chiens = (res.reservation_chiens ?? [])
            .map((rc: any) => rc.chiens)
            .filter(Boolean);
          const facturable = estFacturable(res);
          const cochee = selectedIds.has(res.id);
          const reste = calculerReste(res);

          return (
            <div
              key={res.id}
              className={`bg-white rounded-xl p-6 shadow-sm transition-shadow ${
                cochee ? "ring-2 ring-blue-400" : ""
              }`}
            >
              <div className="flex items-start gap-3">
                {/* Case à cocher */}
                <div className="flex-shrink-0 pt-1.5">
                  {facturable ? (
                    <input
                      type="checkbox"
                      checked={cochee}
                      onChange={() => toggleId(res.id)}
                      className="w-5 h-5 cursor-pointer accent-blue-600"
                      title="Sélectionner pour facturer"
                    />
                  ) : (
                    <div className="w-5 h-5" />
                  )}
                </div>

                {/* Info principale — lien vers la fiche */}
                <Link href={`/reservations/${res.id}`} className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-xl font-bold" style={{ color: "#1B2B5E" }}>
                      {res.clients?.prenom} {res.clients?.nom}
                      {res.clients?.membre && (
                        <span className="ml-2 text-sm text-green-600">⭐ Membre</span>
                      )}
                    </p>
                    {res.numero && (
                      <span
                        className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: "#F5F0E8", color: "#1B2B5E" }}
                      >
                        #{res.numero}
                      </span>
                    )}
                  </div>
                  <p className="text-gray-500 text-sm mt-1">
                    🐶 {chiens.map((c: any) => c.nom).join(", ") || "—"}
                  </p>
                  <p className="text-gray-500 text-sm">
                    🏠 {formatBoxLabel(res.boxes)} · {libelleType(res.type_reservation)}
                  </p>
                  <p className="text-gray-500 text-sm">
                    📅 {formatDateFR(res.date_debut)} → {formatDateFR(res.date_fin)}
                  </p>
                </Link>

                {/* Badges + montant + action paiement rapide */}
                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      res.statut === "validee"
                        ? "bg-green-100 text-green-700"
                        : res.statut === "en_attente"
                        ? "bg-yellow-100 text-yellow-700"
                        : res.statut === "annulee"
                        ? "bg-red-100 text-red-700"
                        : res.statut === "refusee"
                        ? "bg-red-100 text-red-700"
                        : res.statut === "terminee"
                        ? "bg-gray-100 text-gray-600"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {res.statut === "validee"
                      ? "✅ Validée"
                      : res.statut === "en_attente"
                      ? "⏳ En attente"
                      : res.statut === "annulee"
                      ? "❌ Annulée"
                      : res.statut === "refusee"
                      ? "❌ Refusée"
                      : res.statut === "terminee"
                      ? "🏁 Terminée"
                      : res.statut}
                  </span>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      res.statut_paiement === "paye"
                        ? "bg-green-100 text-green-700"
                        : res.statut_paiement === "partiel"
                        ? "bg-orange-100 text-orange-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {res.statut_paiement === "paye"
                      ? "💰 Payé"
                      : res.statut_paiement === "partiel"
                      ? "💰 Partiel"
                      : "💰 Impayé"}
                  </span>
                  {res.statut_paiement === "partiel" && res.montant_final != null && (
                    <p className="font-bold text-sm" style={{ color: "#1B2B5E" }}>
                      Reste {reste.toFixed(2)} CHF
                    </p>
                  )}
                  {res.statut_paiement === "impaye" && (
                    <p className="font-bold text-sm" style={{ color: "#1B2B5E" }}>
                      {montantDuReservation(res).toFixed(2)} CHF
                    </p>
                  )}
                  {permEncaissements &&
                    res.statut_paiement !== "paye" &&
                    res.statut !== "annulee" && (
                      <BoutonPaiementRapide
                        reservation_id={res.id}
                        montant_final={res.montant_final}
                        statut_paiement={res.statut_paiement}
                      />
                    )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Barre d'action flottante */}
      {selectedIds.size > 0 && (
        <div
          className="fixed bottom-0 left-0 right-0 z-50 border-t shadow-2xl px-6 py-4 flex items-center justify-between gap-4 flex-wrap"
          style={{ backgroundColor: "#1B2B5E", color: "white" }}
        >
          <div>
            <p className="font-bold text-lg">
              {selectedIds.size} réservation{selectedIds.size > 1 ? "s" : ""} sélectionnée{selectedIds.size > 1 ? "s" : ""}
            </p>
            <p className="text-sm opacity-80">
              Total : CHF {totalSelectionne.toFixed(2)}
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {!memeClient && (
              <p className="text-sm text-yellow-300 font-semibold">
                ⚠️ Sélectionne les réservations d'un seul client
              </p>
            )}
            {erreur && (
              <p className="text-sm font-semibold" style={{ color: "#FCA5A5" }}>
                ❌ {erreur}
              </p>
            )}
            <button
              onClick={() => { setSelectedIds(new Set()); setErreur(null); }}
              className="px-4 py-2 rounded-xl text-sm font-semibold"
              style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
            >
              Annuler
            </button>
            <button
              onClick={handleCreerFacture}
              disabled={!memeClient || loading}
              className="px-5 py-2 rounded-xl text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ backgroundColor: "#4AAEA0" }}
            >
              {loading ? "Création..." : "🧾 Créer une facture groupée"}
            </button>
          </div>
        </div>
      )}

      {/* Espace pour ne pas masquer le dernier élément derrière la barre */}
      {selectedIds.size > 0 && <div className="h-24" />}
    </>
  );
}
