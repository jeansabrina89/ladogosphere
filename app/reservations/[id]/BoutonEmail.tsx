"use client";

import { useState } from "react";

export default function BoutonEmail({
  type,
  reservation_id,
  label,
  couleur,
}: {
  type: "paiement" | "satisfaction_essai";
  reservation_id: string;
  label: string;
  couleur: string;
}) {
  const [loading, setLoading] = useState(false);
  const [envoye, setEnvoye] = useState(false);

  const handleEnvoyer = async () => {
    if (!confirm(`Envoyer l'email "${label}" au client ?`)) return;
    setLoading(true);
    const res = await fetch(`/api/reservations/${reservation_id}/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type }),
    });
    if (res.ok) {
      setEnvoye(true);
    } else {
      alert("Erreur lors de l'envoi de l'email.");
    }
    setLoading(false);
  };

  return (
    <button onClick={handleEnvoyer} disabled={loading || envoye}
      className="px-4 py-2 rounded-xl font-semibold text-white text-sm disabled:opacity-50"
      style={{ backgroundColor: couleur }}>
      {envoye ? "✅ Envoyé !" : loading ? "Envoi..." : label}
    </button>
  );
}