"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import BadgeMembre from "@/app/components/BadgeMembre";
import { formatDateFR } from "@/src/lib/dates";
import { formatBoxLabel } from "@/src/lib/boxes";
import BoutonPaiementRapide from "./BoutonPaiementRapide";
import { montantDuReservation } from "@/src/lib/montants";
import Carte from "@/app/components/ui/Carte";
import BadgeStatut from "@/app/components/ui/BadgeStatut";
import EtatVide from "@/app/components/ui/EtatVide";

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

  const muted: React.CSSProperties = { color: "rgba(27,43,94,0.6)", fontSize: 14, margin: 0 };

  if (reservations.length === 0) {
    return (
      <Carte>
        <EtatVide icone="📅" titre="Aucune réservation trouvée" message="Ajuste les filtres ou crée une nouvelle réservation." />
      </Carte>
    );
  }

  return (
    <>
      {succes && (
        <div style={{ marginBottom: 16, padding: "12px 16px", borderRadius: 14, background: "#DBEFEA", border: "1px solid #BFE3D9", color: "#1F6E5B", fontWeight: 600, fontSize: 14 }}>
          ✅ {succes}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {reservations.map((res: any) => {
          const chiens = (res.reservation_chiens ?? []).map((rc: any) => rc.chiens).filter(Boolean);
          const facturable = estFacturable(res);
          const cochee = selectedIds.has(res.id);
          const reste = calculerReste(res);

          return (
            <Carte key={res.id} className={cochee ? "ring-2 ring-[#2E8B7E]" : ""}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <div style={{ flexShrink: 0, paddingTop: 4 }}>
                  {facturable ? (
                    <input
                      type="checkbox"
                      checked={cochee}
                      onChange={() => toggleId(res.id)}
                      style={{ width: 20, height: 20, cursor: "pointer", accentColor: "#2E8B7E" }}
                      title="Sélectionner pour facturer"
                    />
                  ) : (
                    <div style={{ width: 20, height: 20 }} />
                  )}
                </div>

                <Link href={`/reservations/${res.id}`} style={{ flex: 1, minWidth: 0, textDecoration: "none" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                    <p style={{ fontSize: 18, fontWeight: 700, color: "#1B2B5E", margin: 0 }}>
                      {res.clients?.prenom} {res.clients?.nom}
                      {res.clients?.membre && (
                        <span style={{ marginLeft: 8 }}>
                          <BadgeMembre membre={!!res.clients?.membre} aJour={!!res.clients?.aJour} />
                        </span>
                      )}
                    </p>
                    {res.numero && (
                      <span style={{ fontSize: 12, fontWeight: 600, padding: "2px 8px", borderRadius: 999, backgroundColor: "#F5F0E8", color: "#1B2B5E" }}>
                        #{res.numero}
                      </span>
                    )}
                  </div>
                  <p style={muted}>🐶 {chiens.map((c: any) => c.nom).join(", ") || "—"}</p>
                  <p style={muted}>🏠 {formatBoxLabel(res.boxes)} · {libelleType(res.type_reservation)}</p>
                  <p style={muted}>📅 {formatDateFR(res.date_debut)} → {formatDateFR(res.date_fin)}</p>
                </Link>

                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flexShrink: 0 }}>
                  <BadgeStatut statut={res.statut} />
                  <BadgeStatut statut={res.statut_paiement || "impaye"} />
                  {res.statut_paiement === "partiel" && res.montant_final != null && (
                    <p style={{ fontWeight: 700, fontSize: 14, color: "#1B2B5E", margin: 0 }}>
                      Reste {reste.toFixed(2)} CHF
                    </p>
                  )}
                  {res.statut_paiement === "impaye" && (
                    <p style={{ fontWeight: 700, fontSize: 14, color: "#1B2B5E", margin: 0 }}>
                      {montantDuReservation(res).toFixed(2)} CHF
                    </p>
                  )}
                  {permEncaissements && res.statut_paiement !== "paye" && res.statut !== "annulee" && (
                    <BoutonPaiementRapide
                      reservation_id={res.id}
                      montant_final={res.montant_final}
                      statut_paiement={res.statut_paiement}
                    />
                  )}
                </div>
              </div>
            </Carte>
          );
        })}
      </div>

      {selectedIds.size > 0 && (
        <div
          className="fixed bottom-0 left-0 right-0 z-50 border-t shadow-2xl px-6 py-4 flex items-center justify-between gap-4 flex-wrap"
          style={{ backgroundColor: "#1B2B5E", color: "white" }}
        >
          <div>
            <p className="font-bold text-lg">
              {selectedIds.size} réservation{selectedIds.size > 1 ? "s" : ""} sélectionnée{selectedIds.size > 1 ? "s" : ""}
            </p>
            <p className="text-sm opacity-80">Total : CHF {totalSelectionne.toFixed(2)}</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {!memeClient && (
              <p className="text-sm text-yellow-300 font-semibold">⚠️ Sélectionne les réservations d&apos;un seul client</p>
            )}
            {erreur && (
              <p className="text-sm font-semibold" style={{ color: "#FCA5A5" }}>❌ {erreur}</p>
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
