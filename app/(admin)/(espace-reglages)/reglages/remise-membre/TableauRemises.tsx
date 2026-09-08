"use client";

import { useState } from "react";
import { enregistrerPourcentage } from "./actions";
import { libelleCategorieArticle } from "@/src/lib/boutiqueLogique";
import {
  categorieExclue,
  type LigneRemiseCategorie,
} from "@/src/lib/remiseMembreLogique";

/**
 * Le tableau des catégories : un pourcentage par ligne, enregistré ligne par
 * ligne. Pas de « tout enregistrer » — on change une catégorie à la fois, et on
 * lit tout de suite ce que ça a fait.
 */

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.55)";
const VERT = "#1F6E5B";
const GRENAT = "#8A1F1F";
const BORDURE = "1px solid rgba(27,43,94,0.12)";

export default function TableauRemises({ lignes }: { lignes: LigneRemiseCategorie[] }) {
  const [valeurs, setValeurs] = useState<Record<string, string>>(
    Object.fromEntries(lignes.map((l) => [l.categorie, String(l.pourcentage).replace(".", ",")]))
  );
  const [enCours, setEnCours] = useState<string | null>(null);
  const [avis, setAvis] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  async function enregistrer(categorie: string) {
    setEnCours(categorie);
    const fd = new FormData();
    fd.set("categorie", categorie);
    fd.set("pourcentage", valeurs[categorie] ?? "");
    const res = await enregistrerPourcentage(fd);
    setEnCours(null);
    setErreur(res.error ?? null);
    setAvis(res.message ?? null);
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {erreur && (
        <p role="alert" style={{ color: GRENAT, fontSize: 15, fontWeight: 600, margin: 0 }}>{erreur}</p>
      )}
      {avis && (
        <p role="status" style={{ color: VERT, fontSize: 15, fontWeight: 600, margin: 0 }}>{avis}</p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full" style={{ minWidth: 560, fontSize: 15 }}>
          <thead>
            <tr style={{ color: SOUS, textAlign: "left" }}>
              <th className="py-2 font-medium">Catégorie</th>
              <th className="py-2 font-medium text-right">Articles</th>
              <th className="py-2 font-medium text-right">Remise membre</th>
              <th className="py-2 font-medium">&nbsp;</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => {
              const exclue = categorieExclue(l);
              return (
                <tr key={l.categorie} style={{ borderTop: BORDURE }}>
                  <td className="py-2" style={{ color: MARINE, fontWeight: 600 }}>
                    {libelleCategorieArticle(l.categorie)}
                    {exclue && (
                      <span style={{
                        display: "inline-block", marginLeft: 8, padding: "1px 8px", borderRadius: 999,
                        fontSize: 11.5, fontWeight: 700, color: "#6E5410", backgroundColor: "#F4EAC9",
                      }}>
                        exclue
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-right" style={{ color: SOUS, whiteSpace: "nowrap" }}>
                    {l.nbArticles}
                  </td>
                  <td className="py-2 text-right">
                    <label htmlFor={`pct-${l.categorie}`} className="sr-only">
                      Remise membre — {libelleCategorieArticle(l.categorie)}
                    </label>
                    <input
                      id={`pct-${l.categorie}`}
                      type="text"
                      inputMode="decimal"
                      value={valeurs[l.categorie] ?? ""}
                      onChange={(e) =>
                        setValeurs((v) => ({ ...v, [l.categorie]: e.target.value }))
                      }
                      style={{
                        width: 88, minHeight: 44, padding: "8px 10px", textAlign: "right",
                        border: BORDURE, borderRadius: 12, fontSize: 16, color: MARINE,
                        backgroundColor: "#FFFFFF", fontFamily: "inherit",
                      }}
                    />
                    <span style={{ color: SOUS, marginLeft: 6 }}>%</span>
                  </td>
                  <td className="py-2">
                    <button
                      type="button"
                      disabled={enCours === l.categorie}
                      onClick={() => enregistrer(l.categorie)}
                      style={{
                        minHeight: 44, padding: "0 14px", borderRadius: 12, border: "none",
                        backgroundColor: "#2E8B7E", color: "#FFFFFF", fontSize: 15, fontWeight: 700,
                        fontFamily: "inherit", cursor: enCours === l.categorie ? "wait" : "pointer",
                        opacity: enCours === l.categorie ? 0.6 : 1,
                      }}
                    >
                      {enCours === l.categorie ? "…" : "Enregistrer"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p style={{ color: SOUS, fontSize: 13, margin: 0 }}>
        Mettez <strong>0</strong> pour exclure une catégorie : aucune mention de
        remise ne paraîtra plus sur ses articles.
      </p>
    </div>
  );
}
