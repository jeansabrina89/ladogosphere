"use client";

import { useState } from "react";
import { trier, type Agregat, type ColonneTri } from "@/src/lib/statistiquesBoutiqueLogique";

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.55)";
const BORDURE = "1px solid rgba(27,43,94,0.12)";

const chf = (n: number | null) =>
  n === null ? "—" : n.toLocaleString("fr-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("fr-CH", { maximumFractionDigits: 1 })} %`);

const COLONNES: { cle: ColonneTri; libelle: string; droite?: boolean }[] = [
  { cle: "libelle", libelle: "Article" },
  { cle: "quantite", libelle: "Quantité", droite: true },
  { cle: "caTtc", libelle: "CA TTC", droite: true },
  { cle: "caHt", libelle: "CA HT", droite: true },
  { cle: "cout", libelle: "Coût figé", droite: true },
  { cle: "marge", libelle: "Marge CHF", droite: true },
  { cle: "margePct", libelle: "Marge %", droite: true },
];

/**
 * La table par article, triable. Les articles qui ne se vendent pas restent
 * dans la liste — c'est une information, pas un bruit.
 */
export default function TableArticles({
  articles,
  premiers,
  derniers,
  sansVente,
}: {
  articles: Agregat[];
  premiers: string[];
  derniers: string[];
  sansVente: string[];
}) {
  const [tri, setTri] = useState<{ colonne: ColonneTri; sens: "asc" | "desc" }>({ colonne: "caTtc", sens: "desc" });
  const ordonnes = trier(articles, tri.colonne, tri.sens);
  const p = new Set(premiers), d = new Set(derniers), z = new Set(sansVente);

  if (articles.length === 0) {
    return <p style={{ color: SOUS, margin: 0 }}>Aucun article sur la période.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full" style={{ minWidth: 820, fontSize: 15 }}>
        <thead>
          <tr style={{ color: SOUS, textAlign: "left" }}>
            {COLONNES.map((c) => (
              <th key={c.cle} className={`py-2 font-medium ${c.droite ? "text-right" : ""}`}
                aria-sort={tri.colonne === c.cle ? (tri.sens === "asc" ? "ascending" : "descending") : "none"}>
                <button
                  type="button"
                  onClick={() => setTri((t) => ({
                    colonne: c.cle,
                    sens: t.colonne === c.cle ? (t.sens === "asc" ? "desc" : "asc") : (c.cle === "libelle" ? "asc" : "desc"),
                  }))}
                  style={{ background: "none", border: "none", padding: 0, font: "inherit", color: "inherit", cursor: "pointer" }}
                >
                  {c.libelle}{tri.colonne === c.cle ? (tri.sens === "asc" ? " ▲" : " ▼") : ""}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ordonnes.map((a) => {
            const fond = z.has(a.cle) ? "#F4F2EE" : p.has(a.cle) ? "#EAF5F1" : d.has(a.cle) ? "#FBEDEA" : "transparent";
            return (
              <tr key={a.cle} style={{ borderTop: BORDURE, backgroundColor: fond }}>
                <td className="py-2" style={{ color: MARINE, fontWeight: 600, paddingLeft: 6 }}>
                  {a.libelle}
                  <span style={{ display: "block", fontSize: 12, color: SOUS, fontWeight: 400 }}>
                    {a.categorie}
                    {z.has(a.cle) && " · ne se vend pas"}
                    {p.has(a.cle) && " · dans les dix premiers"}
                    {d.has(a.cle) && " · dans les dix derniers"}
                  </span>
                </td>
                <td className="py-2 text-right">{a.quantite}</td>
                <td className="py-2 text-right">{chf(a.caTtc)}</td>
                <td className="py-2 text-right">{chf(a.caHt)}</td>
                <td className="py-2 text-right">{chf(a.cout)}</td>
                <td className="py-2 text-right" style={{ color: a.marge !== null && a.marge < 0 ? "#A8453A" : MARINE }}>
                  {chf(a.marge)}
                  {a.lignesSansCout > 0 && (
                    <span style={{ display: "block", fontSize: 12, color: "#A8453A" }}>
                      {a.lignesSansCout === a.lignes ? "coût non renseigné" : `${a.lignesSansCout} ligne${a.lignesSansCout > 1 ? "s" : ""} sans coût`}
                    </span>
                  )}
                </td>
                <td className="py-2 text-right" style={{ paddingRight: 6 }}>{pct(a.margePct)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
