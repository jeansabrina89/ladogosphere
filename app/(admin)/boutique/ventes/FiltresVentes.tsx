"use client";

import { useState, type CSSProperties } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MODES_CAISSE } from "@/src/lib/caisseLogique";

/** Filtres du journal des ventes : la date et le mode, rien de plus. */

const sChamp: CSSProperties = {
  fontSize: 16, padding: "10px 12px", borderRadius: 12,
  border: "1px solid rgba(27,43,94,.15)", color: "#1B2B5E", background: "#fff",
  minHeight: 44, fontFamily: "inherit",
};
const sBouton: CSSProperties = {
  ...sChamp, background: "#2E8B7E", color: "#fff", borderColor: "#2E8B7E",
  fontWeight: 700, cursor: "pointer", padding: "10px 18px",
};

export default function FiltresVentes() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [du, setDu] = useState(params.get("du") ?? "");
  const [au, setAu] = useState(params.get("au") ?? "");
  const [mode, setMode] = useState(params.get("mode") ?? "");

  function appliquer() {
    const p = new URLSearchParams();
    if (du) p.set("du", du);
    if (au) p.set("au", au);
    if (mode) p.set("mode", mode);
    const qs = p.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 16 }}>
      <input type="date" value={du} onChange={(e) => setDu(e.target.value)} style={sChamp} aria-label="Du" />
      <span style={{ color: "rgba(27,43,94,.5)", fontSize: 14 }}>au</span>
      <input type="date" value={au} onChange={(e) => setAu(e.target.value)} style={sChamp} aria-label="Au" />

      <select value={mode} onChange={(e) => setMode(e.target.value)} style={sChamp} aria-label="Mode de règlement">
        <option value="">Tous les modes</option>
        {MODES_CAISSE.map((m) => (
          <option key={m.valeur} value={m.valeur}>{m.libelle}</option>
        ))}
      </select>

      <button type="button" onClick={appliquer} style={sBouton}>Filtrer</button>
      <button
        type="button"
        style={{ ...sChamp, cursor: "pointer" }}
        onClick={() => { setDu(""); setAu(""); setMode(""); router.push(pathname); }}
      >
        Tout
      </button>
    </div>
  );
}
