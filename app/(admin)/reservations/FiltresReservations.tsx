"use client";

import type { CSSProperties } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const PAIEMENTS: { val: string; label: string }[] = [
  { val: "tous", label: "Tous" },
  { val: "impaye", label: "❌ Impayées" },
  { val: "partiel", label: "⚠️ Partielles" },
  { val: "paye", label: "✅ Payées" },
];

const sLigne: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 16 };
const sLabel: CSSProperties = { fontSize: 13, fontWeight: 700, color: "#1B2B5E", marginRight: 4 };
const sChipBase: CSSProperties = { fontSize: 13.5, padding: "8px 14px", borderRadius: 999, fontWeight: 600, cursor: "pointer", border: "1px solid rgba(27,43,94,.12)", background: "#fff", color: "#1B2B5E" };
const sChipActif: CSSProperties = { ...sChipBase, background: "#2E8B7E", color: "#fff", borderColor: "#2E8B7E" };

export default function FiltresReservations() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const paiement = searchParams.get("paiement") || "tous";

  function setPaiement(val: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (val === "tous") params.delete("paiement");
    else params.set("paiement", val);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div style={sLigne}>
      <span style={sLabel}>Paiement :</span>
      {PAIEMENTS.map((p) => {
        const on = paiement === p.val;
        return (
          <button key={p.val} onClick={() => setPaiement(p.val)} style={on ? sChipActif : sChipBase}>
            {p.label}
          </button>
        );
      })}
    </div>
  );
}
