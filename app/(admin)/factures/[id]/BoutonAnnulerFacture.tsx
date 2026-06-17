"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { annulerFacture } from "./actions";

export default function BoutonAnnulerFacture({ facture_id }: { facture_id: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const handleAnnuler = async () => {
    if (!confirm("Annuler cette facture ?\nLes réservations liées resteront impayées et pourront être refacturées.")) return;
    setLoading(true);
    setErreur(null);
    const res = await annulerFacture(facture_id);
    if (res.error) {
      setErreur(res.error);
      setLoading(false);
      return;
    }
    router.refresh();
    setLoading(false);
  };

  return (
    <div>
      {erreur && (
        <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2 mb-2">
          ❌ {erreur}
        </p>
      )}
      <button
        onClick={handleAnnuler}
        disabled={loading}
        className="px-4 py-2 rounded-xl font-semibold text-sm disabled:opacity-50"
        style={{ backgroundColor: "#FEE2E2", color: "#DC2626" }}
      >
        {loading ? "..." : "🗑️ Annuler la facture"}
      </button>
    </div>
  );
}
