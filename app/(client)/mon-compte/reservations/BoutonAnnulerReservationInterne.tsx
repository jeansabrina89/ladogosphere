"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { annulerMaReservationInterne } from "./actions";

/**
 * Annulation d'une réservation du personnel, jusqu'à la veille.
 * Il n'y a aucun frais : le box et le check-in sont simplement libérés.
 */
export default function BoutonAnnulerReservationInterne({
  reservation_id,
  numero,
}: {
  reservation_id: string;
  numero: number | null;
}) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const annuler = async () => {
    if (!window.confirm(`Annuler la réservation N°${numero ?? ""} ?`)) return;
    setLoading(true);
    const res = await annulerMaReservationInterne(reservation_id);
    if (res.error) {
      alert(res.error);
      setLoading(false);
      return;
    }
    router.refresh();
    setLoading(false);
  };

  return (
    <button
      onClick={annuler}
      disabled={loading}
      style={{
        backgroundColor: "#EDE8DF", color: "#1B2B5E", border: "none",
        padding: "8px 14px", borderRadius: 10, fontWeight: 600, fontSize: 13,
        cursor: loading ? "default" : "pointer", opacity: loading ? 0.6 : 1,
      }}
    >
      {loading ? "…" : "✖ Annuler"}
    </button>
  );
}
