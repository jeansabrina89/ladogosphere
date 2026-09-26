"use client";

import { useState, type CSSProperties } from "react";
import {
  FILTRES_VIDES,
  nombreFiltresActifs,
  type FiltreAffiche,
  type Filtres,
} from "@/src/lib/filtresCatalogueLogique";

/**
 * Le panneau de filtres du catalogue.
 *
 * Il ne décide de rien : `filtresCatalogueLogique` dit quels filtres
 * existent, quelles valeurs ils portent et combien d'articles chacune
 * ramène. Ici, on clique.
 *
 * Sur téléphone, le panneau ne tient pas à côté de la grille : un bouton
 * « Filtrer (n) » ouvre la même liste en plein écran, avec de quoi la
 * refermer sur un résultat — « Voir les X articles » — et de quoi tout
 * effacer d'un geste. Vérifié à 375 px.
 */

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.55)";
const VERT = "#1F6E5B";
const BORDURE = "1px solid rgba(27,43,94,0.12)";
const CIBLE = 44;

const sPastille = (actif: boolean): CSSProperties => ({
  minHeight: CIBLE,
  padding: "8px 12px",
  borderRadius: 999,
  border: actif ? "1px solid #C9A84C" : BORDURE,
  background: actif ? "#F4EAC9" : "#FFFFFF",
  color: actif ? "#6E5410" : MARINE,
  fontSize: 15,
  fontWeight: actif ? 700 : 500,
  fontFamily: "inherit",
  cursor: "pointer",
  textAlign: "left",
});

const sTitre: CSSProperties = {
  margin: "0 0 8px", fontSize: 14, fontWeight: 700, color: MARINE,
};

const sBouton: CSSProperties = {
  minHeight: CIBLE, padding: "10px 18px", borderRadius: 12, border: "none",
  background: VERT, color: "#FFFFFF", fontSize: 16, fontWeight: 700,
  fontFamily: "inherit", cursor: "pointer",
};

const sBoutonPale: CSSProperties = {
  ...sBouton, background: "#FFFFFF", color: MARINE, border: BORDURE,
};

/** Une valeur cochée ou décochée, dans un filtre à choix multiple. */
function bascule(liste: string[], valeur: string): string[] {
  return liste.includes(valeur) ? liste.filter((v) => v !== valeur) : [...liste, valeur];
}

function Groupes({
  filtres,
  affiches,
  surChangement,
}: {
  filtres: Filtres;
  affiches: FiltreAffiche[];
  surChangement: (f: Filtres) => void;
}) {
  function cliquer(filtre: FiltreAffiche, valeur: string, actif: boolean) {
    const nom = filtre.nom;
    if (nom === "categorie") {
      // Un seul rayon à la fois : recliquer celui qui est choisi le quitte.
      // Les filtres propres à l'ancien rayon s'en vont avec lui, sans quoi
      // ils continueraient de restreindre en silence.
      surChangement(actif
        ? { ...filtres, categorie: null, proteines: [], couleurs: [], matieres: [],
            usages_jouet: [], tailles_article: [], sans_cereales: false, monoproteine: false }
        : { ...FILTRES_VIDES, ...filtres, categorie: valeur, proteines: [], couleurs: [],
            matieres: [], usages_jouet: [], tailles_article: [], sans_cereales: false,
            monoproteine: false });
      return;
    }
    if (typeof filtres[nom] === "boolean") {
      surChangement({ ...filtres, [nom]: !actif });
      return;
    }
    surChangement({ ...filtres, [nom]: bascule(filtres[nom] as string[], valeur) });
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {affiches.map((filtre) => (
        <fieldset key={String(filtre.nom)} style={{ border: "none", padding: 0, margin: 0 }}>
          <legend style={sTitre}>{filtre.libelle}</legend>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {filtre.valeurs.map((v) => (
              <button
                key={v.valeur}
                type="button"
                aria-pressed={v.actif}
                onClick={() => cliquer(filtre, v.valeur, v.actif)}
                style={sPastille(v.actif)}
              >
                {v.libelle}{" "}
                <span style={{ color: v.actif ? "#6E5410" : SOUS, fontWeight: 500 }}>
                  ({v.nombre})
                </span>
              </button>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}

export default function FiltresCatalogue({
  filtres,
  affiches,
  nombreResultats,
  surChangement,
}: {
  filtres: Filtres;
  affiches: FiltreAffiche[];
  /** Ce que donnent les filtres actuels : le bouton du panneau le dit. */
  nombreResultats: number;
  surChangement: (f: Filtres) => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const actifs = nombreFiltresActifs(filtres);
  const effacer = () => surChangement({ ...FILTRES_VIDES });

  const resultats = `${nombreResultats} article${nombreResultats > 1 ? "s" : ""}`;

  /* UN SEUL élément rendu : dans une grille, un fragment sèmerait ses blocs
     dans autant de cellules — les boutons à gauche, le panneau à droite, et
     les articles à la ligne suivante. Vu à 1280 px, corrigé ici.

     Et la bascule d'affichage se pose sur un conteneur SANS `display` en
     style inline : un style inline l'emporte sur `md:hidden`, qui ne
     masquait donc rien. */
  return (
    <aside>
      {/* ── Téléphone : un bouton, puis le panneau en plein écran ───────── */}
      <div className="md:hidden">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={() => setOuvert(true)} style={sBoutonPale}>
            ⚙️ Filtrer{actifs > 0 ? ` (${actifs})` : ""}
          </button>
          {actifs > 0 && (
            <button type="button" onClick={effacer} style={sBoutonPale}>
              Tout effacer
            </button>
          )}
        </div>
      </div>

      {ouvert && (
        <div className="md:hidden">
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Filtrer les articles"
          style={{
            position: "fixed", inset: 0, zIndex: 50, background: "#F5F0E8",
            display: "flex", flexDirection: "column",
          }}
        >
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            gap: 12, padding: 14, borderBottom: BORDURE, background: "#FFFFFF",
          }}>
            <strong style={{ color: MARINE, fontSize: 17 }}>Filtrer</strong>
            <button
              type="button"
              onClick={() => setOuvert(false)}
              aria-label="Fermer les filtres"
              style={{ ...sBoutonPale, padding: "8px 14px" }}
            >
              ✕
            </button>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
            <Groupes filtres={filtres} affiches={affiches} surChangement={surChangement} />
          </div>

          {/* Le pied reste visible : on ferme sur un résultat, pas à l'aveugle. */}
          <div style={{
            display: "flex", gap: 10, padding: 14, borderTop: BORDURE,
            background: "#FFFFFF", flexWrap: "wrap",
          }}>
            <button type="button" onClick={() => setOuvert(false)} style={{ ...sBouton, flex: 1 }}>
              Voir les {resultats}
            </button>
            <button type="button" onClick={effacer} style={sBoutonPale}>
              Tout effacer
            </button>
          </div>
        </div>
        </div>
      )}

      {/* ── Écran large : le panneau est simplement là ──────────────────── */}
      <div className="hidden md:block">
        <div style={{
          display: "flex", alignItems: "baseline", justifyContent: "space-between",
          gap: 12, marginBottom: 12,
        }}>
          <strong style={{ color: MARINE, fontSize: 16 }}>Filtrer</strong>
          <span style={{ color: SOUS, fontSize: 14 }}>{resultats}</span>
        </div>
        <Groupes filtres={filtres} affiches={affiches} surChangement={surChangement} />
        {actifs > 0 && (
          <button type="button" onClick={effacer} style={{ ...sBoutonPale, marginTop: 16 }}>
            Tout effacer ({actifs})
          </button>
        )}
      </div>
    </aside>
  );
}
