"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { marquerReservationsPersonnelVues } from "./actionsPersonnel";

/**
 * Bandeau du filtre « Personnel » : combien de réservations restent à voir,
 * et le bouton qui les marque toutes comme vues (fait disparaître le badge).
 */
export default function BandeauReservationsPersonnel({ nbAVoir }: { nbAVoir: number }) {
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState("");
  const router = useRouter();

  const marquer = async () => {
    setLoading(true);
    setErreur("");
    const res = await marquerReservationsPersonnelVues();
    if (res?.error) {
      setErreur(res.error);
      setLoading(false);
      return;
    }
    router.refresh();
    setLoading(false);
  };

  return (
    <div
      style={{
        backgroundColor: "#F4EAC9", border: "1px solid #C9A84C", borderRadius: 14,
        padding: "12px 16px", marginBottom: 16,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 12, flexWrap: "wrap",
      }}
    >
      <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#6E5410" }}>
        ⭐ Réservations du personnel — {nbAVoir > 0
          ? `${nbAVoir} à voir`
          : "toutes vues"}
      </p>
      {nbAVoir > 0 && (
        <button
          onClick={marquer}
          disabled={loading}
          style={{
            backgroundColor: "#1B2B5E", color: "#fff", border: "none",
            padding: "8px 16px", borderRadius: 10, fontWeight: 600, fontSize: 13.5,
            cursor: loading ? "default" : "pointer", opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "…" : "✓ Marquer comme vues"}
        </button>
      )}
      {erreur && <p style={{ margin: 0, fontSize: 13, color: "#A8453A" }}>{erreur}</p>}
    </div>
  );
}
