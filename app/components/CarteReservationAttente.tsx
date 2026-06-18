"use client";

import Link from "next/link";
import Carte from "@/app/components/ui/Carte";
import BadgeStatut from "@/app/components/ui/BadgeStatut";
import BoutonValiderReservation from "./BoutonValiderReservation";

export default function CarteReservationAttente({ res }: { res: any }) {
  const chiens = res.reservation_chiens?.map((rc: any) => rc.chiens?.nom).filter(Boolean) ?? [];

  return (
    <Carte>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <Link href={`/reservations/${res.id}`} style={{ textDecoration: "none", minWidth: 0 }}>
          <p style={{ fontWeight: 700, color: "#1B2B5E", margin: "0 0 4px" }}>
            {res.clients?.prenom} {res.clients?.nom}
          </p>
          <p style={{ color: "rgba(27,43,94,0.6)", fontSize: 14, margin: 0 }}>
            🐶 {chiens.join(", ") || "—"} · {res.date_debut} → {res.date_fin}
          </p>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <BadgeStatut statut="en_attente" />
          <BoutonValiderReservation id={res.id} />
        </div>
      </div>
    </Carte>
  );
}
