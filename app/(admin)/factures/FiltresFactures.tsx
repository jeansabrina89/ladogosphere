"use client";

import { useState, type CSSProperties } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// Filtres de la liste des factures : statut (le même vocabulaire qu'ailleurs),
// recherche par client ou numéro, et période.

const VUES: { val: string; label: string }[] = [
  { val: "brouillon", label: "Brouillon" },
  { val: "envoyee", label: "Envoyée" },
  { val: "en_retard", label: "En retard" },
  { val: "partiellement_payee", label: "Partiellement payée" },
  { val: "payee", label: "Payée" },
  { val: "avoir", label: "Avoir" },
  { val: "annulee", label: "Annulée" },
];

const sLigne: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 12 };
const sLabel: CSSProperties = { fontSize: 13, fontWeight: 700, color: "#1B2B5E", marginRight: 4 };
const sChipBase: CSSProperties = { fontSize: 13, padding: "7px 13px", borderRadius: 999, fontWeight: 600, cursor: "pointer", border: "1px solid rgba(27,43,94,.12)", background: "#fff", color: "#1B2B5E" };
const sChipActif: CSSProperties = { ...sChipBase, background: "#2E8B7E", color: "#fff", borderColor: "#2E8B7E" };
const sChamp: CSSProperties = { fontSize: 13, padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(27,43,94,.15)", color: "#1B2B5E", background: "#fff" };

export default function FiltresFactures() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selection = new Set((searchParams.get("vues") || "").split(",").filter(Boolean));

  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const [du, setDu] = useState(searchParams.get("du") ?? "");
  const [au, setAu] = useState(searchParams.get("au") ?? "");

  function naviguer(maj: (p: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    maj(params);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function basculer(val: string) {
    const next = new Set(selection);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    naviguer((p) => {
      if (next.size === 0) p.delete("vues");
      else p.set("vues", [...next].join(","));
    });
  }

  function appliquer() {
    naviguer((p) => {
      for (const [cle, valeur] of [["q", q], ["du", du], ["au", au]] as const) {
        if (valeur.trim() === "") p.delete(cle);
        else p.set(cle, valeur.trim());
      }
    });
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={sLigne}>
        <span style={sLabel}>Statut :</span>
        {VUES.map((v) => (
          <button key={v.val} onClick={() => basculer(v.val)} style={selection.has(v.val) ? sChipActif : sChipBase}>
            {v.label}
          </button>
        ))}
      </div>
      <div style={sLigne}>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") appliquer(); }}
          placeholder="Client ou numéro…"
          style={{ ...sChamp, minWidth: 220 }}
        />
        <span style={{ ...sLabel, marginLeft: 8 }}>Du</span>
        <input type="date" value={du} onChange={(e) => setDu(e.target.value)} style={sChamp} />
        <span style={sLabel}>au</span>
        <input type="date" value={au} onChange={(e) => setAu(e.target.value)} style={sChamp} />
        <button onClick={appliquer} style={{ ...sChipActif, background: "#1B2B5E", borderColor: "#1B2B5E" }}>
          Filtrer
        </button>
      </div>
    </div>
  );
}
