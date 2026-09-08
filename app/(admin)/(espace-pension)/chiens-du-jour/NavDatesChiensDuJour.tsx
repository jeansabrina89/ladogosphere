"use client";

import type { CSSProperties } from "react";
import { usePathname, useRouter } from "next/navigation";

const sBarre: CSSProperties = { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", background: "#fff", border: "1px solid rgba(27,43,94,.08)", borderRadius: 16, padding: "12px 14px", marginBottom: 24 };
const sRond: CSSProperties = { width: 40, height: 40, borderRadius: 999, border: "1px solid rgba(27,43,94,.12)", background: "#F5F0E8", color: "#1B2B5E", fontSize: 18, fontWeight: 700, cursor: "pointer", lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 };
const sLabel: CSSProperties = { flex: 1, minWidth: 160, textAlign: "center", fontFamily: "Georgia, serif", fontSize: 18, fontWeight: 700, color: "#1B2B5E", textTransform: "capitalize" };
const sAujourdhui: CSSProperties = { padding: "9px 14px", borderRadius: 999, border: "none", background: "#2E8B7E", color: "#fff", fontSize: 13.5, fontWeight: 600, cursor: "pointer" };
const sDate: CSSProperties = { padding: "8px 10px", borderRadius: 12, border: "1px solid rgba(27,43,94,.15)", color: "#1B2B5E", fontSize: 13.5, background: "#fff" };

export default function NavDatesChiensDuJour({
  date, label, aujourdhui, estAujourdhui,
}: { date: string; label: string; aujourdhui: string; estAujourdhui: boolean }) {
  const router = useRouter();
  const pathname = usePathname();

  const aller = (d: string) => router.push(`${pathname}?date=${d}`);

  const decale = (n: number) => {
    const [y, m, j] = date.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, j));
    dt.setUTCDate(dt.getUTCDate() + n);
    aller(dt.toISOString().slice(0, 10));
  };

  return (
    <div style={sBarre}>
      <button onClick={() => decale(-1)} style={sRond} aria-label="Jour précédent">←</button>
      <div style={sLabel}>{label}</div>
      <button onClick={() => decale(1)} style={sRond} aria-label="Jour suivant">→</button>
      {!estAujourdhui && (
        <button onClick={() => aller(aujourdhui)} style={sAujourdhui}>Aujourd&apos;hui</button>
      )}
      <input type="date" value={date} onChange={(e) => e.target.value && aller(e.target.value)} style={sDate} />
    </div>
  );
}
