"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { basculerOffreReservation } from "./actions";

export default function BoutonOffrir({
  id,
  offerte,
  montant_paye,
}: {
  id: string;
  offerte: boolean;
  montant_paye: number;
}) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function action() {
    if (!offerte) {
      const msg =
        montant_paye > 0
          ? "Offrir cette réservation ? Le total passera à 0 CHF et le montant déjà payé sera crédité en avoir au client."
          : "Offrir cette réservation ? Le total passera à 0 CHF.";
      if (!confirm(msg)) return;
    } else {
      if (!confirm("Annuler l'offre et rétablir le tarif normal ?")) return;
    }
    setLoading(true);
    const res = await basculerOffreReservation(id, !offerte);
    setLoading(false);
    if (res?.error) {
      alert(res.error);
      return;
    }
    router.refresh();
  }

  return (
    <button
      onClick={action}
      disabled={loading}
      className="px-4 py-2 rounded-xl font-semibold text-white"
      style={{ backgroundColor: offerte ? "#9A8F7E" : "#E8847A" }}
    >
      {loading ? "..." : offerte ? "↩️ Annuler l'offre" : "🎁 Offrir"}
    </button>
  );
}
