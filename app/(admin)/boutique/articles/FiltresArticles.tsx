"use client";

import { useState, type CSSProperties } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CATEGORIES_ARTICLE } from "@/src/lib/boutiqueLogique";

/**
 * Filtres du catalogue : catégorie, fournisseur, sous le seuil, actif, et une
 * recherche qui prend aussi bien un nom qu'une référence ou un code-barres —
 * la douchette se comporte comme un clavier, elle tape dans ce champ.
 */

const sLigne: CSSProperties = {
  display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 12,
};
const sChamp: CSSProperties = {
  fontSize: 16, padding: "10px 12px", borderRadius: 12,
  border: "1px solid rgba(27,43,94,.15)", color: "#1B2B5E", background: "#fff",
  minHeight: 44, fontFamily: "inherit",
};
const sBouton: CSSProperties = {
  ...sChamp, background: "#2E8B7E", color: "#fff", borderColor: "#2E8B7E",
  fontWeight: 700, cursor: "pointer", padding: "10px 18px",
};
const sBascule = (actif: boolean): CSSProperties => ({
  ...sChamp,
  cursor: "pointer",
  fontWeight: 600,
  background: actif ? "#F4EAC9" : "#fff",
  borderColor: actif ? "#C9A84C" : "rgba(27,43,94,.15)",
  color: actif ? "#6E5410" : "#1B2B5E",
});

export default function FiltresArticles({
  fournisseurs,
}: {
  fournisseurs: { id: string; nom: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [q, setQ] = useState(params.get("q") ?? "");
  const [categorie, setCategorie] = useState(params.get("categorie") ?? "");
  const [fournisseur, setFournisseur] = useState(params.get("fournisseur") ?? "");
  const [seuil, setSeuil] = useState(params.get("seuil") === "1");
  const [inactifs, setInactifs] = useState(params.get("inactifs") === "1");

  function appliquer(sur?: { seuil?: boolean; inactifs?: boolean }) {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (categorie) p.set("categorie", categorie);
    if (fournisseur) p.set("fournisseur", fournisseur);
    if (sur?.seuil ?? seuil) p.set("seuil", "1");
    if (sur?.inactifs ?? inactifs) p.set("inactifs", "1");
    const qs = p.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={sLigne}>
        <select
          value={categorie}
          onChange={(e) => setCategorie(e.target.value)}
          style={sChamp}
          aria-label="Catégorie"
        >
          <option value="">Toutes les catégories</option>
          {CATEGORIES_ARTICLE.map((c) => (
            <option key={c.valeur} value={c.valeur}>{c.libelle}</option>
          ))}
        </select>

        <select
          value={fournisseur}
          onChange={(e) => setFournisseur(e.target.value)}
          style={sChamp}
          aria-label="Fournisseur"
        >
          <option value="">Tous les fournisseurs</option>
          {fournisseurs.map((f) => (
            <option key={f.id} value={f.id}>{f.nom}</option>
          ))}
        </select>

        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") appliquer(); }}
          placeholder="Nom, référence ou code-barres…"
          style={{ ...sChamp, minWidth: 200, flex: "1 1 220px" }}
          aria-label="Recherche"
        />
      </div>

      <div style={sLigne}>
        <button
          type="button"
          style={sBascule(seuil)}
          onClick={() => { setSeuil(!seuil); appliquer({ seuil: !seuil }); }}
        >
          ⚠️ Sous le seuil
        </button>
        <button
          type="button"
          style={sBascule(inactifs)}
          onClick={() => { setInactifs(!inactifs); appliquer({ inactifs: !inactifs }); }}
        >
          Voir les articles retirés
        </button>
        <button type="button" onClick={() => appliquer()} style={sBouton}>Filtrer</button>
        <button
          type="button"
          style={{ ...sChamp, cursor: "pointer" }}
          onClick={() => {
            setQ(""); setCategorie(""); setFournisseur(""); setSeuil(false); setInactifs(false);
            router.push(pathname);
          }}
        >
          Tout
        </button>
      </div>
    </div>
  );
}
