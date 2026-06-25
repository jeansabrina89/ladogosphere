"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { reglerReservationAvecAbonnement } from "../actions";

export default function BoutonReglerAbonnement({
  reservationId,
  joursRestants,
}: {
  reservationId: string;
  joursRestants: number;
}) {
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const router = useRouter();

  async function regler() {
    setLoading(true);
    setErreur(null);
    const res = await reglerReservationAvecAbonnement(reservationId);
    setLoading(false);
    if (res?.error) {
      setErreur(res.error);
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <button
        onClick={regler}
        disabled={loading}
        style={{
          backgroundColor: "#1F6E5B",
          color: "#fff",
          border: "none",
          padding: "8px 18px",
          borderRadius: 10,
          fontWeight: 600,
          fontSize: 14,
          cursor: loading ? "not-allowed" : "pointer",
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? "…" : `Régler avec mon abonnement (${joursRestants} journée${joursRestants > 1 ? "s" : ""} restante${joursRestants > 1 ? "s" : ""})`}
      </button>
      {erreur && (
        <p style={{ color: "#A8453A", fontSize: 13, margin: "4px 0 0" }}>{erreur}</p>
      )}
    </div>
  );
}
