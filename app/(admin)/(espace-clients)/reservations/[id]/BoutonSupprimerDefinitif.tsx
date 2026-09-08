"use client";

import { useState } from "react";
import { supprimerReservationDefinitivement } from "./actions";

export default function BoutonSupprimerDefinitif({ id }: { id: string }) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (!confirm(
      "Supprimer DÉFINITIVEMENT cette réservation ?\n\n" +
      "Cette action est IRRÉVERSIBLE : la réservation et toutes les données liées " +
      "(chiens associés, occupation de box, check-in/check-out) seront supprimées sans possibilité de retour en arrière."
    )) {
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.set("id", id);
    const res = await supprimerReservationDefinitivement(formData);
    if (res?.error) {
      alert(res.error);
      setLoading(false);
    }
  };

  return (
    <button type="button" onClick={handleClick} disabled={loading}
      className="bg-red-700 text-white px-4 py-2 rounded-xl hover:bg-red-800 disabled:opacity-50">
      {loading ? "Suppression..." : "🗑️ Supprimer définitivement"}
    </button>
  );
}
