"use client";

import Link from "next/link";
import BadgeMembre from "@/app/components/BadgeMembre";
import { formatDateFR } from "@/src/lib/dates";
import { formatBoxLabel } from "@/src/lib/boxes";
import { montantDuReservation } from "@/src/lib/montants";
import Carte from "@/app/components/ui/Carte";
import BadgeStatut from "@/app/components/ui/BadgeStatut";
import EtatVide from "@/app/components/ui/EtatVide";
import Encaisser from "@/app/(admin)/(espace-comptabilite)/factures/Encaisser";

// Liste des réservations. La sélection multiple pour « facture groupée » a
// disparu : la facture se monte désormais depuis l'assistant
// /factures/nouvelle, qui sait reprendre plusieurs réservations impayées.

type Chien = { id: string; nom: string };
type Reservation = {
  id: string;
  numero?: number | null;
  statut: string;
  statut_paiement?: string | null;
  type_reservation: string;
  date_debut: string;
  date_fin: string;
  montant_final?: number | string | null;
  montant_calcule?: number | string | null;
  ajustement_manuel?: number | string | null;
  montant_paye?: number | string | null;
  clients?: { prenom?: string; nom?: string; membre?: boolean; aJour?: boolean } | null;
  boxes?: { numero?: number | null; nom?: string | null } | null;
  reservation_chiens?: { chiens: Chien | null }[] | null;
};

const muted = { fontSize: 14, color: "rgba(27,43,94,0.6)", margin: 0 };

function resteDu(res: Reservation): number {
  return Math.max(0, montantDuReservation(res) - Number(res.montant_paye ?? 0));
}

function libelleType(t: string): string {
  if (t === "journee") return "Journée";
  if (t === "sejour") return "Séjour";
  if (t === "essai") return "Journée d'essai";
  return t;
}

export default function ListeReservations({
  reservations,
  permEncaissements,
}: {
  reservations: Reservation[];
  permEncaissements: boolean;
}) {
  if (reservations.length === 0) {
    return (
      <Carte>
        <EtatVide icone="📅" titre="Aucune réservation" message="Aucune réservation ne correspond à ce filtre." />
      </Carte>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {reservations.map((res) => {
        const chiens = (res.reservation_chiens ?? []).map((rc) => rc.chiens).filter(Boolean) as Chien[];
        const reste = resteDu(res);

        return (
          <Carte key={res.id}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
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
                <p style={muted}>🐶 {chiens.map((c) => c.nom).join(", ") || "—"}</p>
                <p style={muted}>🏠 {formatBoxLabel(res.boxes)} · {libelleType(res.type_reservation)}</p>
                <p style={muted}>📅 {formatDateFR(res.date_debut)} → {formatDateFR(res.date_fin)}</p>
              </Link>

              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flexShrink: 0 }}>
                <BadgeStatut statut={res.statut} />
                <BadgeStatut statut={res.statut_paiement || "impaye"} />
                {reste > 0 && (
                  <p style={{ fontWeight: 700, fontSize: 14, color: "#1B2B5E", margin: 0 }}>
                    {res.statut_paiement === "partiel" ? "Reste " : ""}{reste.toFixed(2)} CHF
                  </p>
                )}
                {permEncaissements && reste > 0 && res.statut !== "annulee" && (
                  <Encaisser
                    reservationId={res.id}
                    resteDu={reste}
                    libellePiece={`Réservation #${res.numero ?? ""}`.trim()}
                    variante="compact"
                  />
                )}
              </div>
            </div>
          </Carte>
        );
      })}
    </div>
  );
}
