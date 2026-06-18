"use client";

import Link from "next/link";
import BoutonValiderReservation from "./BoutonValiderReservation";

export default function CarteReservationAttente({ res }: { res: any }) {
  const chiens = res.reservation_chiens?.map((rc: any) => rc.chiens?.nom).filter(Boolean) ?? [];

  return (
    <div className="rounded-2xl p-4"
      style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "1rem", alignItems: "center", border: "1px solid rgba(27,43,94,.08)" }}>
      <Link href={`/reservations/${res.id}`}>
        <p className="font-semibold" style={{ color: "#1B2B5E" }}>
          {res.clients?.prenom} {res.clients?.nom}
        </p>
        <p className="text-sm" style={{ color: "rgba(27,43,94,.55)" }}>
          🐶 {chiens.join(", ") || "—"} · {res.date_debut} → {res.date_fin}
        </p>
      </Link>
      <div className="flex items-center gap-2">
        <span className="px-3 py-1 rounded-full text-xs font-semibold"
          style={{ background: "#FBF3DC", color: "#8A6D1F" }}>
          ⏳ En attente
        </span>
        <BoutonValiderReservation id={res.id} />
      </div>
    </div>
  );
}
