"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ONGLETS_PERIODE } from "@/src/lib/reservationsFiltres";

export default function FiltresReservations() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filtre = searchParams.get("filtre") || "toutes";
  const paiement = searchParams.get("paiement") || "tous";

  const setFiltre = (val: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("filtre", val);
    router.push(`/reservations?${params.toString()}`);
  };

  const setPaiement = (val: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("paiement", val);
    router.push(`/reservations?${params.toString()}`);
  };

  const filtresPaiement = [
    { val: "tous", label: "Tous" },
    { val: "impaye", label: "❌ Impayées" },
    { val: "partiel", label: "⚠️ Partielles" },
    { val: "paye", label: "✅ Payées" },
  ];

  return (
    <div className="flex flex-wrap gap-6 mb-6">
      <div>
        <p className="text-sm font-semibold mb-2" style={{ color: "#1B2B5E" }}>Période</p>
        <div className="flex gap-2 flex-wrap">
          {ONGLETS_PERIODE.map(f => (
            <button key={f.val} onClick={() => setFiltre(f.val)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium border-2 transition"
              style={{
                borderColor: filtre === f.val ? "#4AAEA0" : "#E2E8F0",
                backgroundColor: filtre === f.val ? "#4AAEA0" : "white",
                color: filtre === f.val ? "white" : "#1B2B5E",
              }}>
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-sm font-semibold mb-2" style={{ color: "#1B2B5E" }}>Paiement</p>
        <div className="flex gap-2 flex-wrap">
          {filtresPaiement.map(f => (
            <button key={f.val} onClick={() => setPaiement(f.val)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium border-2 transition"
              style={{
                borderColor: paiement === f.val ? "#1B2B5E" : "#E2E8F0",
                backgroundColor: paiement === f.val ? "#1B2B5E" : "white",
                color: paiement === f.val ? "white" : "#1B2B5E",
              }}>
              {f.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}