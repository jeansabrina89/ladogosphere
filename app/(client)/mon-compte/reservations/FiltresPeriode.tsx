"use client";

import type { CSSProperties } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const CATS: { val: string; label: string }[] = [
  { val: "futures", label: "📅 À venir" },
  { val: "en_cours", label: "🟢 En cours" },
  { val: "passees", label: "📁 Passées" },
  { val: "annulees", label: "❌ Annulées" },
  { val: "a_payer", label: "💰 À payer" },
];

const sFiltres: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 };
const sChipBase: CSSProperties = { fontSize: 13.5, padding: "8px 14px", borderRadius: 999, fontWeight: 600, cursor: "pointer", border: "1px solid rgba(27,43,94,.12)", background: "#fff", color: "#1B2B5E" };
const sChipActif: CSSProperties = { ...sChipBase, background: "#1B2B5E", color: "#fff", borderColor: "#1B2B5E" };
const sReset: CSSProperties = { margin: "0 0 18px", fontSize: 12.5, color: "rgba(27,43,94,.6)" };
const sResetLien: CSSProperties = { color: "#1F6E5B", fontWeight: 600, textDecoration: "none", cursor: "pointer", background: "none", border: "none", font: "inherit", padding: 0 };

export default function FiltresPeriode() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const actives = (searchParams.get("vues") || "").split(",").filter(Boolean);

  function appliquer(liste: string[]) {
    const params = new URLSearchParams(searchParams.toString());
    if (liste.length === 0) params.delete("vues");
    else params.set("vues", liste.join(","));
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function toggle(val: string) {
    const set = new Set(actives);
    if (set.has(val)) set.delete(val);
    else set.add(val);
    appliquer(Array.from(set));
  }

  return (
    <>
      <div style={sFiltres}>
        {CATS.map((c) => {
          const on = actives.includes(c.val);
          return (
            <button key={c.val} onClick={() => toggle(c.val)} style={on ? sChipActif : sChipBase}>
              {on ? "✓ " : ""}{c.label}
            </button>
          );
        })}
      </div>
      {actives.length > 0 ? (
        <p style={sReset}>
          {actives.length} filtre{actives.length > 1 ? "s" : ""} actif{actives.length > 1 ? "s" : ""} —{" "}
          <button onClick={() => appliquer([])} style={sResetLien}>tout afficher</button>
        </p>
      ) : (
        <p style={sReset}>Toutes tes réservations sont affichées.</p>
      )}
    </>
  );
}
