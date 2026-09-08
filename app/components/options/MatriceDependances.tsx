"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  basculerDependance,
  basculerLot,
  definirParentGroupe,
  definirSupplementCombinaison,
  appliquerPrixLot,
  copierDisponibilites,
} from "./actions";
import { urlPhotoArticle } from "@/src/lib/boutiqueLogique";
import {
  valeursActives,
  type Dependance,
  type OptionGroupe,
  type OptionValeur,
  type Porteur,
} from "@/src/lib/personnalisationLogique";

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
  porteur,
  groupe,
  groupes,
  herites = [],
  dependances,
  onRetour,
}: {
  porteur: Porteur;
  groupe: OptionGroupe;
  groupes: OptionGroupe[];
  /** Groupes venus des modèles attachés : posés avant, donc utilisables comme parents. */
  herites?: OptionGroupe[];
  dependances: Dependance[];
  onRetour: (res: { error?: string; message?: string }) => boolean;
}) {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);
  /** null : la matrice d'ensemble. Sinon, une colonne à régler en détail. */
  const [colonneOuverte, setColonneOuverte] = useState<string | null>(null);

  // Un groupe ne dépend que d'une question posée AVANT lui. Celles des
  // modèles attachés le sont toutes : elles passent avant les groupes propres.
  const utilisable = (g: OptionGroupe) => g.type !== "texte" && g.type !== "mesure";
  const parentsPossibles = [
    ...herites.filter(utilisable).sort((a, b) => a.ordre - b.ordre),
    ...[...groupes].filter((g) => g.ordre < groupe.ordre && utilisable(g)).sort((a, b) => a.ordre - b.ordre),
  ];

  const parent =
    groupes.find((g) => g.id === groupe.depend_de_groupe_id) ??
    herites.find((g) => g.id === groupe.depend_de_groupe_id) ??
    null;
  const parentHerite = parent !== null && !groupes.some((g) => g.id === parent.id);

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
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: BORDURE, minWidth: 0 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <label htmlFor={`parent-${groupe.id}`} style={{ fontSize: 14, fontWeight: 600, color: MARINE }}>
          Dépend du groupe
        </label>
        <select
          id={`parent-${groupe.id}`}
          value={groupe.depend_de_groupe_id ?? ""}
          disabled={enCours || parentsPossibles.length === 0}
          onChange={(e) => agir(definirParentGroupe(porteur, groupe.id, e.target.value || null))}
          style={{
            minHeight: CIBLE, padding: "8px 12px", borderRadius: 12, border: BORDURE,
            fontSize: 15, color: MARINE, backgroundColor: "#FFFFFF", fontFamily: "inherit",
          }}
        >
          <option value="">— Aucun, toujours disponible —</option>
          {parentsPossibles.map((g) => (
            <option key={g.id} value={g.id}>
              {g.nom}
              {herites.some((h) => h.id === g.id) ? " (modèle)" : ""}
            </option>
          ))}
        </select>
      </div>

      {parentsPossibles.length === 0 && (
        <p style={{ color: SOUS, fontSize: 13, margin: "6px 0 0" }}>
          Aucun groupe ne le précède : montez-en un au-dessus pour pouvoir en dépendre.
        </p>
      )}

      {parentHerite && (
        <p style={{ color: SOUS, fontSize: 13, margin: "6px 0 0" }}>
          « {parent!.nom} » vient d&apos;un modèle attaché : tant que cette dépendance
          existe, ce modèle ne peut pas être détaché.
        </p>
      )}

      {parent && lignes.length > 0 && colonnes.length > 0 && (
        <div style={{ marginTop: 12, minWidth: 0 }}>
          <p style={{ color: SOUS, fontSize: 13, margin: "0 0 8px" }}>
            Cochez, pour chaque {groupe.nom.toLowerCase()}, les {parent.nom.toLowerCase()} où
            elle existe. Une ligne sans aucune case cochée reste disponible partout.
          </p>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            <button type="button" style={{ ...bouton, minHeight: CIBLE, ...(colonneOuverte === null ? actif : {}) }}
              onClick={() => setColonneOuverte(null)}>
              ▦ Tout le tableau
            </button>
            {colonnes.map((c) => (
              <button key={c.id} type="button"
                style={{ ...bouton, minHeight: CIBLE, ...(colonneOuverte === c.id ? actif : {}) }}
                onClick={() => setColonneOuverte(c.id)}>
                {c.libelle}
              </button>
            ))}
          </div>

          {colonneOuverte && (
            <ColonneDetaillee
              porteur={porteur}
              groupe={groupe}
              parent={parent}
              colonne={colonnes.find((c) => c.id === colonneOuverte)!}
              autresColonnes={colonnes.filter((c) => c.id !== colonneOuverte)}
              lignes={lignes}
              dependances={dependances}
              enCours={enCours}
              agir={agir}
            />
          )}

          {/* Beaucoup de colonnes : le tableau défile dans son conteneur. */}
          <div className="overflow-x-auto" hidden={colonneOuverte !== null}>
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
                            porteur,
                            valeurs: lignes.map((l) => l.id),
                            requises: [c.id],
                            coche: true,
                          }))}>tout</button>
                        <button type="button" disabled={enCours} style={bouton}
                          onClick={() => agir(basculerLot({
                            porteur,
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
                              agir(basculerDependance(porteur, l.id, c.id, e.target.checked))
                            }
                            style={{ width: 22, height: 22, cursor: "pointer", accentColor: VERT }}
                          />
                        </td>
                      ))}

                      <td style={{ ...cellule, textAlign: "center" }}>
                        <span style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                          <button type="button" disabled={enCours} style={bouton}
                            onClick={() => agir(basculerLot({
                              porteur,
                              valeurs: [l.id],
                              requises: colonnes.map((c) => c.id),
                              coche: true,
                            }))}>tout</button>
                          <button type="button" disabled={enCours} style={bouton}
                            onClick={() => agir(basculerLot({
                              porteur,
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

const actif: React.CSSProperties = {
  backgroundColor: "#F1F8F6", borderColor: VERT, color: MARINE, fontWeight: 700,
};

/**
 * Une largeur, ses coloris, leurs prix.
 *
 * C'est la façon dont le travail se fait vraiment : on tient une largeur en
 * tête, et on passe ses coloris en revue. La matrice d'ensemble sert à relire,
 * cet écran-ci sert à saisir.
 */
function ColonneDetaillee({
  porteur,
  groupe,
  parent,
  colonne,
  autresColonnes,
  lignes,
  dependances,
  enCours,
  agir,
}: {
  porteur: Porteur;
  groupe: OptionGroupe;
  parent: OptionGroupe;
  colonne: OptionValeur;
  autresColonnes: OptionValeur[];
  lignes: OptionValeur[];
  dependances: Dependance[];
  enCours: boolean;
  agir: (action: Promise<{ error?: string; message?: string }>) => Promise<void>;
}) {
  const [prixLot, setPrixLot] = useState("");
  const [aCopier, setACopier] = useState("");

  const ligneDe = (valeurId: string) =>
    dependances.find((d) => d.valeur_id === valeurId && d.valeur_requise_id === colonne.id) ?? null;

  const cochees = lignes.filter((l) => ligneDe(l.id) !== null);

  return (
    <div style={{ border: BORDURE, borderRadius: 14, backgroundColor: "#FBF9F5", padding: 12, marginBottom: 12 }}>
      <h4 style={{ color: MARINE, fontSize: 16, fontWeight: 700, margin: "0 0 2px" }}>
        {parent.nom} : {colonne.libelle}
      </h4>
      <p style={{ color: SOUS, fontSize: 13, margin: "0 0 12px" }}>
        Cochez les {groupe.nom.toLowerCase()} disponibles dans cette {parent.nom.toLowerCase()},
        et donnez leur prix s&apos;il y est différent. Laissez vide pour garder le
        supplément habituel du coloris.
      </p>

      <div style={{ display: "grid", gap: 8 }}>
        {lignes.map((l) => {
          const ligne = ligneDe(l.id);
          const disponible = ligne !== null;
          return (
            <div key={l.id} style={{
              display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap",
              backgroundColor: "#FFFFFF", border: BORDURE, borderRadius: 12, padding: "8px 10px",
            }}>
              <input
                type="checkbox"
                checked={disponible}
                disabled={enCours}
                aria-label={`${l.libelle} en ${colonne.libelle}`}
                onChange={(e) => agir(basculerDependance(porteur, l.id, colonne.id, e.target.checked))}
                style={{ width: 22, height: 22, cursor: "pointer", accentColor: VERT }}
              />
              <Pastille valeur={l} />
              <span style={{ flex: "1 1 120px", minWidth: 0, color: MARINE, fontWeight: 600 }}>
                {l.libelle}
              </span>
              <ChampPrix
                cle={`${l.id}-${colonne.id}`}
                valeur={
                  ligne?.supplement_prix === null || ligne?.supplement_prix === undefined
                    ? ""
                    : String(ligne.supplement_prix)
                }
                habituel={Number(l.supplement_prix ?? 0)}
                desactive={!disponible || enCours}
                onValider={(v) => agir(definirSupplementCombinaison(porteur, l.id, colonne.id, v))}
              />
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12, alignItems: "center" }}>
        <input
          type="text"
          inputMode="decimal"
          value={prixLot}
          onChange={(e) => setPrixLot(e.target.value)}
          placeholder="Prix"
          aria-label={`Prix à appliquer dans ${colonne.libelle}`}
          style={{
            width: 100, minHeight: CIBLE, padding: "8px 10px", borderRadius: 12,
            border: BORDURE, fontSize: 15, color: MARINE, backgroundColor: "#FFFFFF",
            fontFamily: "inherit", boxSizing: "border-box",
          }}
        />
        <button type="button" style={{ ...bouton, minHeight: CIBLE }}
          disabled={enCours || cochees.length === 0}
          onClick={async () => {
            await agir(appliquerPrixLot({
              porteur,
              valeurs: cochees.map((c) => c.id),
              requise: colonne.id,
              prix: prixLot,
            }));
            setPrixLot("");
          }}>
          Appliquer à {cochees.length === 0 ? "aucune option cochée" : `${cochees.length} option${cochees.length > 1 ? "s" : ""} cochée${cochees.length > 1 ? "s" : ""}`} de cette {parent.nom.toLowerCase()}
        </button>
      </div>

      {autresColonnes.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10, alignItems: "center" }}>
          <label htmlFor={`copier-${colonne.id}`} style={{ fontSize: 13, color: SOUS }}>
            Copier les disponibilités d&apos;une autre {parent.nom.toLowerCase()}, prix compris :
          </label>
          <select
            id={`copier-${colonne.id}`}
            value={aCopier}
            onChange={(e) => setACopier(e.target.value)}
            style={{
              minHeight: CIBLE, padding: "8px 12px", borderRadius: 12, border: BORDURE,
              fontSize: 15, color: MARINE, backgroundColor: "#FFFFFF", fontFamily: "inherit",
            }}
          >
            <option value="">— Choisir —</option>
            {autresColonnes.map((c) => (
              <option key={c.id} value={c.id}>{c.libelle}</option>
            ))}
          </select>
          <button type="button" style={{ ...bouton, minHeight: CIBLE }}
            disabled={enCours || !aCopier}
            onClick={async () => {
              const source = autresColonnes.find((c) => c.id === aCopier);
              if (!source) return;
              if (!window.confirm(
                `Remplacer les disponibilités de « ${colonne.libelle} » par celles de « ${source.libelle} » ? Ce qui est coché ici et pas là-bas sera décoché.`
              )) return;
              await agir(copierDisponibilites({
                porteur,
                source: aCopier,
                cible: colonne.id,
                valeurs: lignes.map((l) => l.id),
              }));
              setACopier("");
            }}>
            Copier ici
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Le prix d'une combinaison. Il ne part qu'une fois la saisie finie — à chaque
 * frappe, ce serait un aller-retour par chiffre.
 */
function ChampPrix({
  cle,
  valeur,
  habituel,
  desactive,
  onValider,
}: {
  cle: string;
  valeur: string;
  habituel: number;
  desactive: boolean;
  onValider: (v: string) => void;
}) {
  const [brut, setBrut] = useState(valeur);
  const [dernier, setDernier] = useState(valeur);

  // La ligne a changé sous nos pieds (copie, lot) : on reprend ce qui est en base.
  if (valeur !== dernier) {
    setDernier(valeur);
    setBrut(valeur);
  }

  return (
    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <input
        id={`prix-${cle}`}
        type="text"
        inputMode="decimal"
        value={brut}
        disabled={desactive}
        placeholder={habituel > 0 ? `${habituel.toFixed(2)}` : "—"}
        aria-label="Supplément dans cette combinaison"
        onChange={(e) => setBrut(e.target.value)}
        onBlur={() => { if (brut !== valeur) onValider(brut); }}
        style={{
          width: 92, minHeight: 40, padding: "6px 10px", borderRadius: 10,
          border: BORDURE, fontSize: 15, color: MARINE,
          backgroundColor: desactive ? "#F3F1EC" : "#FFFFFF",
          fontFamily: "inherit", boxSizing: "border-box", textAlign: "right",
        }}
      />
      <span style={{ color: SOUS, fontSize: 13 }}>CHF</span>
    </span>
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
