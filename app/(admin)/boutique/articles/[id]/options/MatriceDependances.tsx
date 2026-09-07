"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { basculerDependance, basculerLot, definirParentGroupe } from "./actions";
import { urlPhotoArticle } from "@/src/lib/boutiqueLogique";
import { valeursActives, type Dependance, type OptionGroupe } from "@/src/lib/personnalisationLogique";

/**
 * Matrice des dépendances : les valeurs du groupe en lignes, celles du groupe
 * dont il dépend en colonnes.
 *
 * C'est la seule forme utilisable pour vingt coloris et trois largeurs — case
 * à case serait insupportable. D'où « tout » par ligne et par colonne.
 *
 * Une ligne entièrement décochée ne veut pas dire « jamais disponible » mais
 * « sans condition » : c'est la règle du modèle, et la ligne le dit en toutes
 * lettres pour qu'on ne s'y trompe pas.
 */

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.55)";
const BORDURE = "1px solid rgba(27,43,94,0.14)";
const VERT = "#2E8B7E";
const CIBLE = 44;

const bouton: React.CSSProperties = {
  minHeight: 34, padding: "0 10px", borderRadius: 10, border: BORDURE,
  backgroundColor: "#FFFFFF", color: MARINE, fontSize: 13, fontWeight: 600,
  fontFamily: "inherit", cursor: "pointer", whiteSpace: "nowrap",
};

export default function MatriceDependances({
  articleId,
  groupe,
  groupes,
  dependances,
  onRetour,
}: {
  articleId: string;
  groupe: OptionGroupe;
  groupes: OptionGroupe[];
  dependances: Dependance[];
  onRetour: (res: { error?: string; message?: string }) => boolean;
}) {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);

  // Un groupe ne dépend que d'une question posée AVANT lui.
  const parentsPossibles = [...groupes]
    .filter((g) => g.ordre < groupe.ordre && g.type !== "texte")
    .sort((a, b) => a.ordre - b.ordre);

  const parent = groupes.find((g) => g.id === groupe.depend_de_groupe_id) ?? null;

  const lignes = valeursActives(groupe);
  const colonnes = parent ? valeursActives(parent) : [];

  const coche = new Set(dependances.map((d) => `${d.valeur_id}|${d.valeur_requise_id}`));
  const estCoche = (v: string, r: string) => coche.has(`${v}|${r}`);
  const sansCondition = (v: string) => !dependances.some((d) => d.valeur_id === v);

  async function agir(action: Promise<{ error?: string; message?: string }>) {
    setEnCours(true);
    const res = await action;
    setEnCours(false);
    if (onRetour(res)) router.refresh();
  }

  return (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: BORDURE }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <label htmlFor={`parent-${groupe.id}`} style={{ fontSize: 14, fontWeight: 600, color: MARINE }}>
          Dépend du groupe
        </label>
        <select
          id={`parent-${groupe.id}`}
          value={groupe.depend_de_groupe_id ?? ""}
          disabled={enCours || parentsPossibles.length === 0}
          onChange={(e) => agir(definirParentGroupe(articleId, groupe.id, e.target.value || null))}
          style={{
            minHeight: CIBLE, padding: "8px 12px", borderRadius: 12, border: BORDURE,
            fontSize: 15, color: MARINE, backgroundColor: "#FFFFFF", fontFamily: "inherit",
          }}
        >
          <option value="">— Aucun, toujours disponible —</option>
          {parentsPossibles.map((g) => (
            <option key={g.id} value={g.id}>{g.nom}</option>
          ))}
        </select>
      </div>

      {parentsPossibles.length === 0 && (
        <p style={{ color: SOUS, fontSize: 13, margin: "6px 0 0" }}>
          Aucun groupe ne le précède : montez-en un au-dessus pour pouvoir en dépendre.
        </p>
      )}

      {parent && lignes.length > 0 && colonnes.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <p style={{ color: SOUS, fontSize: 13, margin: "0 0 8px" }}>
            Cochez, pour chaque {groupe.nom.toLowerCase()}, les {parent.nom.toLowerCase()} où
            elle existe. Une ligne sans aucune case cochée reste disponible partout.
          </p>

          {/* Beaucoup de colonnes : le tableau défile dans son conteneur. */}
          <div className="overflow-x-auto">
            <table style={{ borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr>
                  <th style={{ ...cellule, textAlign: "left", minWidth: 180 }}>
                    <span style={{ color: SOUS, fontWeight: 500 }}>
                      {groupe.nom} ↓ / {parent.nom} →
                    </span>
                  </th>
                  {colonnes.map((c) => (
                    <th key={c.id} style={{ ...cellule, minWidth: 96 }}>
                      <span style={{ display: "block", color: MARINE, fontWeight: 700 }}>
                        {c.libelle}
                      </span>
                      <span style={{ display: "flex", gap: 4, justifyContent: "center", marginTop: 4 }}>
                        <button type="button" disabled={enCours} style={bouton}
                          onClick={() => agir(basculerLot({
                            article_id: articleId,
                            valeurs: lignes.map((l) => l.id),
                            requises: [c.id],
                            coche: true,
                          }))}>tout</button>
                        <button type="button" disabled={enCours} style={bouton}
                          onClick={() => agir(basculerLot({
                            article_id: articleId,
                            valeurs: lignes.map((l) => l.id),
                            requises: [c.id],
                            coche: false,
                          }))}>rien</button>
                      </span>
                    </th>
                  ))}
                  <th style={{ ...cellule, minWidth: 110 }}>
                    <span style={{ color: SOUS, fontWeight: 500 }}>Toute la ligne</span>
                  </th>
                </tr>
              </thead>

              <tbody>
                {lignes.map((l) => {
                  const libre = sansCondition(l.id);
                  return (
                    <tr key={l.id} style={{ backgroundColor: libre ? "#FBF9F5" : "#FFFFFF" }}>
                      <th style={{ ...cellule, textAlign: "left" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <Pastille valeur={l} />
                          <span style={{ minWidth: 0 }}>
                            <span style={{ display: "block", color: MARINE, fontWeight: 600 }}>
                              {l.libelle}
                            </span>
                            {libre && (
                              <span style={{ display: "block", color: SOUS, fontSize: 12 }}>
                                sans condition
                              </span>
                            )}
                          </span>
                        </span>
                      </th>

                      {colonnes.map((c) => (
                        <td key={c.id} style={{ ...cellule, textAlign: "center" }}>
                          <input
                            type="checkbox"
                            checked={estCoche(l.id, c.id)}
                            disabled={enCours}
                            aria-label={`${l.libelle} en ${c.libelle}`}
                            onChange={(e) =>
                              agir(basculerDependance(articleId, l.id, c.id, e.target.checked))
                            }
                            style={{ width: 22, height: 22, cursor: "pointer", accentColor: VERT }}
                          />
                        </td>
                      ))}

                      <td style={{ ...cellule, textAlign: "center" }}>
                        <span style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                          <button type="button" disabled={enCours} style={bouton}
                            onClick={() => agir(basculerLot({
                              article_id: articleId,
                              valeurs: [l.id],
                              requises: colonnes.map((c) => c.id),
                              coche: true,
                            }))}>tout</button>
                          <button type="button" disabled={enCours} style={bouton}
                            onClick={() => agir(basculerLot({
                              article_id: articleId,
                              valeurs: [l.id],
                              requises: colonnes.map((c) => c.id),
                              coche: false,
                            }))}>rien</button>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {parent && (lignes.length === 0 || colonnes.length === 0) && (
        <p style={{ color: SOUS, fontSize: 13, margin: "8px 0 0" }}>
          Il faut des options des deux côtés pour dresser la matrice.
        </p>
      )}
    </div>
  );
}

const cellule: React.CSSProperties = {
  border: BORDURE,
  padding: "8px 10px",
  verticalAlign: "middle",
};

function Pastille({ valeur }: { valeur: { libelle: string; image_path: string | null; code_couleur: string | null } }) {
  const url = urlPhotoArticle(valeur.image_path);
  const style: React.CSSProperties = {
    width: 24, height: 24, flexShrink: 0, borderRadius: 6,
    border: "1px solid rgba(27,43,94,0.2)", objectFit: "cover",
  };
  if (url) {
    // Vignette du bucket public de la boutique.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" width={24} height={24} style={style} />;
  }
  return (
    <span aria-hidden="true" style={{
      ...style, display: "inline-block",
      backgroundColor: valeur.code_couleur ?? "#EDE8DF",
    }} />
  );
}
