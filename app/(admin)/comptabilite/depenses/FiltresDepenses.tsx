"use client";

import { useState, type CSSProperties } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// Filtres de la liste des dépenses : période, fournisseur, catégorie, recherche.

const sLigne: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 12 };
const sLabel: CSSProperties = { fontSize: 13, fontWeight: 700, color: "#1B2B5E", marginRight: 4 };
const sChamp: CSSProperties = {
  fontSize: 13, padding: "9px 12px", borderRadius: 10,
  border: "1px solid rgba(27,43,94,.15)", color: "#1B2B5E", background: "#fff",
  minHeight: 40, fontFamily: "inherit",
};
const sBouton: CSSProperties = {
  ...sChamp, background: "#2E8B7E", color: "#fff", borderColor: "#2E8B7E",
  fontWeight: 700, cursor: "pointer", padding: "9px 16px",
};

export default function FiltresDepenses({
  categories,
  fournisseurs,
}: {
  categories: { compte: string; libelle: string }[];
  fournisseurs: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const [du, setDu] = useState(searchParams.get("du") ?? "");
  const [au, setAu] = useState(searchParams.get("au") ?? "");
  const [compte, setCompte] = useState(searchParams.get("compte") ?? "");
  const [fournisseur, setFournisseur] = useState(searchParams.get("fournisseur") ?? "");

  function appliquer() {
    const params = new URLSearchParams();
    for (const [cle, valeur] of [
      ["q", q], ["du", du], ["au", au], ["compte", compte], ["fournisseur", fournisseur],
    ] as const) {
      if (valeur.trim() !== "") params.set(cle, valeur.trim());
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function reinitialiser() {
    setQ(""); setDu(""); setAu(""); setCompte(""); setFournisseur("");
    router.push(pathname);
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={sLigne}>
        <span style={sLabel}>Période</span>
        <input type="date" value={du} onChange={(e) => setDu(e.target.value)} style={sChamp} aria-label="Du" />
        <span style={{ color: "rgba(27,43,94,.5)", fontSize: 13 }}>au</span>
        <input type="date" value={au} onChange={(e) => setAu(e.target.value)} style={sChamp} aria-label="Au" />
      </div>

      <div style={sLigne}>
        <select value={fournisseur} onChange={(e) => setFournisseur(e.target.value)} style={sChamp} aria-label="Fournisseur">
          <option value="">Tous les fournisseurs</option>
          {fournisseurs.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>

        <select value={compte} onChange={(e) => setCompte(e.target.value)} style={sChamp} aria-label="Catégorie">
          <option value="">Toutes les catégories</option>
          {categories.map((c) => (
            <option key={c.compte} value={c.compte}>{c.libelle} ({c.compte})</option>
          ))}
        </select>

        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") appliquer(); }}
          placeholder="Numéro, libellé, fournisseur…"
          style={{ ...sChamp, minWidth: 200, flex: "1 1 200px" }}
          aria-label="Recherche"
        />

        <button type="button" onClick={appliquer} style={sBouton}>Filtrer</button>
        <button type="button" onClick={reinitialiser} style={{ ...sChamp, cursor: "pointer" }}>Tout</button>
      </div>
    </div>
  );
}
