"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatDateFR } from "@/src/lib/dates";
import { formatBoxLabel } from "@/src/lib/boxes";
import BoutonPaiementRapide from "./BoutonPaiementRapide";
import { montantDuReservation } from "@/src/lib/montants";

const STATUT: Record<string, { label: string; bg: string; color: string }> = {
  validee:    { label: "✅ Validée",    bg: "#DEF1EC", color: "#1F6E5B" },
  en_attente: { label: "⏳ En attente",  bg: "#FBF3DC", color: "#8A6D1F" },
  annulee:    { label: "❌ Annulée",     bg: "#FBE7E4", color: "#B5564C" },
  refusee:    { label: "❌ Refusée",     bg: "#FBE7E4", color: "#B5564C" },
  terminee:   { label: "🏁 Terminée",    bg: "#ECECEC", color: "#6B7280" },
};

const PAIEMENT: Record<string, { label: string; bg: string; color: string }> = {
  paye:    { label: "💰 Payé",    bg: "#DEF1EC", color: "#1F6E5B" },
  partiel: { label: "💰 Partiel", bg: "#FBF3DC", color: "#8A6D1F" },
  impaye:  { label: "💰 Impayé",  bg: "#FBE7E4", color: "#B5564C" },
};

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
        <div className="mb-4 px-4 py-3 rounded-xl font-semibold text-sm"
          style={{ background: "#DEF1EC", border: "1px solid #BFE3D9", color: "#1F6E5B" }}>
          ✅ {succes}
        </div>
      )}

      <div className="grid gap-4">
        {reservations.length === 0 && (
          <p style={{ color: "rgba(27,43,94,.5)" }}>Aucune réservation trouvée.</p>
        )}
        {reservations.map((res: any) => {
          const chiens = (res.reservation_chiens ?? [])
            .map((rc: any) => rc.chiens)
            .filter(Boolean);
          const facturable = estFacturable(res);
          const cochee = selectedIds.has(res.id);
          const reste = calculerReste(res);
          const sBadge = STATUT[res.statut] ?? { label: res.statut, bg: "#ECECEC", color: "#6B7280" };
          const pBadge = PAIEMENT[res.statut_paiement] ?? PAIEMENT.impaye;

          return (
            <div
              key={res.id}
              className={`bg-white rounded-2xl p-6 shadow-sm transition-shadow ${cochee ? "ring-2 ring-[#2E8B7E]" : ""}`}
              style={{ border: "1px solid rgba(27,43,94,.06)" }}
            >
              <div className="flex items-start gap-3">
                {/* Case à cocher */}
                <div className="flex-shrink-0 pt-1.5">
                  {facturable ? (
                    <input
                      type="checkbox"
                      checked={cochee}
                      onChange={() => toggleId(res.id)}
                      className="w-5 h-5 cursor-pointer"
                      style={{ accentColor: "#2E8B7E" }}
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
                        <span className="ml-2 text-sm font-semibold" style={{ color: "#C9A84C" }}>⭐ Membre</span>
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
                  <p className="text-sm mt-1" style={{ color: "rgba(27,43,94,.55)" }}>
                    🐶 {chiens.map((c: any) => c.nom).join(", ") || "—"}
                  </p>
                  <p className="text-sm" style={{ color: "rgba(27,43,94,.55)" }}>
                    🏠 {formatBoxLabel(res.boxes)} · {libelleType(res.type_reservation)}
                  </p>
                  <p className="text-sm" style={{ color: "rgba(27,43,94,.55)" }}>
                    📅 {formatDateFR(res.date_debut)} → {formatDateFR(res.date_fin)}
                  </p>
                </Link>

                {/* Badges + montant + action paiement rapide */}
                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                  <span className="px-3 py-1 rounded-full text-xs font-semibold"
                    style={{ background: sBadge.bg, color: sBadge.color }}>
                    {sBadge.label}
                  </span>
                  <span className="px-3 py-1 rounded-full text-xs font-semibold"
                    style={{ background: pBadge.bg, color: pBadge.color }}>
                    {pBadge.label}
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
                ⚠️ Sélectionne les réservations d&apos;un seul client
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
              style={{ backgroundColor: "#2E8B7E" }}
            >
              {loading ? "Création..." : "🧾 Créer une facture groupée"}
            </button>
          </div>
        </div>
      )}

      {selectedIds.size > 0 && <div className="h-24" />}
    </>
  );
}
