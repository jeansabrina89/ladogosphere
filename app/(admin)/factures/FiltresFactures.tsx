"use client";

import type { CSSProperties } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const VUES: { val: string; label: string }[] = [
  { val: "attente", label: "❌ En attente" },
  { val: "reglees", label: "✅ Réglées" },
  { val: "annulees", label: "🚫 Annulées" },
];

const sLigne: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 16 };
const sLabel: CSSProperties = { fontSize: 13, fontWeight: 700, color: "#1B2B5E", marginRight: 4 };
const sChipBase: CSSProperties = { fontSize: 13.5, padding: "8px 14px", borderRadius: 999, fontWeight: 600, cursor: "pointer", border: "1px solid rgba(27,43,94,.12)", background: "#fff", color: "#1B2B5E" };
const sChipActif: CSSProperties = { ...sChipBase, background: "#2E8B7E", color: "#fff", borderColor: "#2E8B7E" };

export default function FiltresFactures() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selection = new Set((searchParams.get("vues") || "").split(",").filter(Boolean));

  function toggle(val: string) {
    const next = new Set(selection);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    const params = new URLSearchParams(searchParams.toString());
    if (next.size === 0) params.delete("vues");
    else params.set("vues", [...next].join(","));
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div style={sLigne}>
      <span style={sLabel}>Afficher :</span>
      {VUES.map((v) => {
        const on = selection.has(v.val);
        return (
          <button key={v.val} onClick={() => toggle(v.val)} style={on ? sChipActif : sChipBase}>
            {v.label}
          </button>
        );
      })}
    </div>
  );
}
