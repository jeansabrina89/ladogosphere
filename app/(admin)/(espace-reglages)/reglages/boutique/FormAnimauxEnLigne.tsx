"use client";

import { useActionState } from "react";
import { enregistrerAnimauxEnLigne, type RetourAnimaux } from "./actions";
import { AIDE_ANIMAUX_EN_LIGNE } from "@/src/lib/animauxEnLigneLogique";

/**
 * « Animaux vendus en ligne » — sept cases, et ce qu'elles emportent.
 *
 * Le nombre d'articles publiés est affiché SOUS chaque case, lu dans la table
 * `articles` et non dans la vitrine : la vitrine, elle, ne montre déjà plus les
 * animaux fermés, et l'on ne saurait donc pas ce qu'on rouvre. C'est toute la
 * question que Sabrina se pose devant cet écran.
 */

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.58)";
const GRENAT = "#8A1F1F";
const VERT = "#1F6E5B";

const ETAT_VIDE: RetourAnimaux = {};

export default function FormAnimauxEnLigne({
  animaux,
  ouverts,
}: {
  /** Les sept, avec leur libellé et leur nombre d'articles publiés. */
  animaux: { valeur: string; libelle: string; nombre: number }[];
  /** Ceux cochés aujourd'hui. */
  ouverts: string[];
}) {
  const [etat, envoyer, enCours] = useActionState<RetourAnimaux, FormData>(
    async (_precedent, formData) => enregistrerAnimauxEnLigne(formData),
    ETAT_VIDE,
  );

  return (
    <form action={envoyer} style={{ display: "grid", gap: 12 }}>
      <p style={{ color: SOUS, fontSize: 14, margin: 0 }}>{AIDE_ANIMAUX_EN_LIGNE}</p>

      <div style={{
        display: "grid", gap: 8,
        gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
      }}>
        {animaux.map((a) => (
          <label
            key={a.valeur}
            style={{
              display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer",
              border: "1px solid rgba(27,43,94,0.14)", borderRadius: 12, padding: "10px 12px",
              backgroundColor: "#FFFFFF",
            }}
          >
            <input
              type="checkbox"
              name="animaux"
              value={a.valeur}
              defaultChecked={ouverts.includes(a.valeur)}
              style={{ marginTop: 3, width: 20, height: 20, flexShrink: 0, accentColor: "#4AAEA0" }}
            />
            <span>
              <span style={{ display: "block", color: MARINE, fontSize: 15, fontWeight: 600 }}>
                {a.libelle}
              </span>
              <span style={{ display: "block", color: SOUS, fontSize: 13 }}>
                {a.nombre === 0
                  ? "aucun article publié"
                  : `${a.nombre} article${a.nombre > 1 ? "s" : ""} publié${a.nombre > 1 ? "s" : ""}`}
              </span>
            </span>
          </label>
        ))}
      </div>

      <div>
        <button
          type="submit"
          disabled={enCours}
          style={{
            minHeight: 44, padding: "0 18px", borderRadius: 12, border: "none",
            backgroundColor: enCours ? "#B9CFC9" : VERT, color: "#FFFFFF",
            fontSize: 15, fontWeight: 700, fontFamily: "inherit",
            cursor: enCours ? "not-allowed" : "pointer",
          }}
        >
          {enCours ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>

      {etat.error && (
        <p role="alert" style={{ color: GRENAT, fontSize: 14, margin: 0 }}>{etat.error}</p>
      )}
      {etat.message && !etat.error && (
        <p role="status" style={{ color: VERT, fontSize: 14, margin: 0 }}>{etat.message}</p>
      )}
    </form>
  );
}
