"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  intervallesSeuils,
  libelleIntervalle,
  taillesTriees,
  trousDeLaGrille,
  messageTrou,
  consequenceSuppression,
  refusGrille,
  type GroupeTaille,
} from "@/src/lib/taillesLogique";
import { valeursActives, type OptionGroupe, type Porteur } from "@/src/lib/personnalisationLogique";
import {
  enregistrerValeur,
  supprimerValeur,
  basculerDependance,
  definirSupplementCombinaison,
} from "./actions";

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.55)";
const VERT = "#1F6E5B";
const GRENAT = "#8A1F1F";
const OR = "#C9A84C";
const BORDURE = "1px solid rgba(27,43,94,0.14)";
const CIBLE = 44;

const champ: React.CSSProperties = {
  minHeight: CIBLE, padding: "8px 10px", borderRadius: 10, border: BORDURE,
  fontSize: 15, color: MARINE, backgroundColor: "#FFFFFF", fontFamily: "inherit",
  boxSizing: "border-box", width: "100%",
};

const bouton: React.CSSProperties = {
  minHeight: CIBLE, padding: "10px 14px", borderRadius: 12, border: BORDURE,
  backgroundColor: "#FFFFFF", color: MARINE, fontSize: 15, fontWeight: 600,
  fontFamily: "inherit", cursor: "pointer",
};

const cellule: React.CSSProperties = {
  border: BORDURE, padding: "6px 8px", verticalAlign: "middle",
};

const fr = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

/**
 * Le tableau des tailles : une ligne par taille, et tout se saisit là.
 *
 * Le nom, les bornes, le supplément de prix, ET les largeurs proposées. Le
 * lien taille → largeur est la même donnée que dans la matrice de dépendances,
 * saisie là où elle a du sens : sept tailles et sept largeurs tiennent dans
 * une grille lisible, et personne ne devrait avoir à changer d'écran pour ça.
 *
 * Le formulaire suit le MODE du groupe :
 *   • « seuils » : une seule colonne, « À partir de ». L'intervalle couvert
 *     s'affiche à droite, calculé — Sabrina saisit un seuil et voit tout de
 *     suite ce qu'il couvre. Trous et chevauchements sont impossibles.
 *   • « plages » : deux colonnes. Les chevauchements sont attendus, on ne les
 *     signale pas ; les trous, si.
 */
export default function GrilleTailles({
  porteur,
  groupe,
  largeurs,
  dependances,
  onRetour,
}: {
  porteur: Porteur;
  groupe: GroupeTaille;
  /** Le groupe de largeurs qui dépend de cette grille, s'il y en a un. */
  largeurs: OptionGroupe | null;
  dependances: { valeur_id: string; valeur_requise_id: string; supplement_prix?: number | string | null }[];
  onRetour: (res: { error?: string; message?: string }) => boolean;
}) {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);
  const [nouvelle, setNouvelle] = useState<{ libelle: string; min: string; max: string } | null>(null);

  const seuils = groupe.mode_taille !== "plages";
  const unite = String(groupe.unite ?? "cm").trim() || "cm";
  const tailles = taillesTriees(groupe);
  const intervalles = seuils ? intervallesSeuils(groupe) : [];
  const trous = trousDeLaGrille(groupe);
  const refus = refusGrille(groupe);
  const colonnes = largeurs ? valeursActives(largeurs) : [];

  const coche = new Set(dependances.map((d) => `${d.valeur_id}|${d.valeur_requise_id}`));

  async function agir(action: Promise<{ error?: string; message?: string }>) {
    setEnCours(true);
    const res = await action;
    setEnCours(false);
    if (onRetour(res)) router.refresh();
  }

  return (
    <div style={{ marginTop: 14, display: "grid", gap: 12, minWidth: 0 }}>
      <div>
        <h4 style={{ color: MARINE, fontSize: 16, fontWeight: 700, margin: "0 0 2px" }}>
          Grille des tailles — mode {seuils ? "sur mesure" : "réglable"}
        </h4>
        <p style={{ color: SOUS, fontSize: 13, margin: 0 }}>
          {seuils
            ? `Chaque taille part d'un seuil et court jusqu'au suivant. Vous saisissez « à partir de », l'intervalle couvert s'affiche à droite. Deux tailles ne peuvent pas partir du même ${unite}, et il ne peut y avoir ni trou ni chevauchement.`
            : "Chaque taille couvre une plage réglable. Les chevauchements sont normaux — un chien peut convenir à deux tailles, et c'est lui qui choisira. Seuls les trous sont des fautes."}
        </p>
      </div>

      {refus && (
        <p role="alert" style={{
          color: GRENAT, backgroundColor: "#FDECEC", border: "1px solid #F0C2C2",
          borderRadius: 10, padding: "8px 10px", fontSize: 14, fontWeight: 600, margin: 0,
        }}>
          {refus}
        </p>
      )}

      <div className="overflow-x-auto" style={{ minWidth: 0 }}>
        <table style={{ borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr>
              <th style={{ ...cellule, textAlign: "left", minWidth: 90 }}>Taille</th>
              <th style={{ ...cellule, minWidth: 96 }}>{seuils ? "À partir de" : "De"}</th>
              {!seuils && <th style={{ ...cellule, minWidth: 96 }}>À</th>}
              {seuils && (
                <th style={{ ...cellule, minWidth: 130, color: SOUS, fontWeight: 500 }}>
                  Couvre (calculé)
                </th>
              )}
              <th style={{ ...cellule, minWidth: 96 }}>Supplément</th>
              {colonnes.map((c) => (
                <th key={c.id} style={{ ...cellule, minWidth: 72, fontSize: 13 }}>{c.libelle}</th>
              ))}
              <th style={{ ...cellule, minWidth: 52 }}>&nbsp;</th>
            </tr>
          </thead>
          <tbody>
            {tailles.map((t, i) => (
              <tr key={t.id}>
                <th style={{ ...cellule, textAlign: "left", color: MARINE, fontWeight: 700 }}>
                  <ChampTexte
                    valeur={t.libelle}
                    aria-label={`Nom de la taille ${t.libelle}`}
                    onValider={(v) => agir(enregistrerValeur({
                      porteur, groupe_id: groupe.id, id: t.id, libelle: v,
                      borne_min: t.borne_min, borne_max: t.borne_max,
                      supplement_prix: t.supplement_prix,
                    }))}
                    largeur={84}
                    desactive={enCours}
                  />
                </th>
                <td style={cellule}>
                  <ChampNombre
                    valeur={t.borne_min}
                    aria-label={`${seuils ? "Seuil" : "Borne basse"} de ${t.libelle}`}
                    onValider={(v) => agir(enregistrerValeur({
                      porteur, groupe_id: groupe.id, id: t.id, libelle: t.libelle,
                      borne_min: v, borne_max: t.borne_max,
                      supplement_prix: t.supplement_prix,
                    }))}
                    desactive={enCours}
                  />
                </td>
                {!seuils && (
                  <td style={cellule}>
                    <ChampNombre
                      valeur={t.borne_max}
                      aria-label={`Borne haute de ${t.libelle}`}
                      onValider={(v) => agir(enregistrerValeur({
                        porteur, groupe_id: groupe.id, id: t.id, libelle: t.libelle,
                        borne_min: t.borne_min, borne_max: v,
                        supplement_prix: t.supplement_prix,
                      }))}
                      desactive={enCours}
                    />
                  </td>
                )}
                {seuils && (
                  <td style={{ ...cellule, color: SOUS, whiteSpace: "nowrap" }}>
                    {intervalles[i] ? libelleIntervalle(intervalles[i], unite) : "—"}
                  </td>
                )}
                <td style={cellule}>
                  <ChampNombre
                    valeur={t.supplement_prix}
                    aria-label={`Supplément de la taille ${t.libelle}`}
                    onValider={(v) => agir(enregistrerValeur({
                      porteur, groupe_id: groupe.id, id: t.id, libelle: t.libelle,
                      borne_min: t.borne_min, borne_max: t.borne_max,
                      supplement_prix: v || 0,
                    }))}
                    desactive={enCours}
                  />
                </td>

                {/* Les largeurs proposées pour cette taille : la même donnée
                    que la matrice de dépendances, saisie ici où elle se lit. */}
                {colonnes.map((c) => (
                  <td key={c.id} style={{ ...cellule, textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={coche.has(`${c.id}|${t.id}`)}
                      disabled={enCours}
                      aria-label={`${c.libelle} en taille ${t.libelle}`}
                      onChange={(e) => agir(basculerDependance(porteur, c.id, t.id, e.target.checked))}
                      style={{ width: 22, height: 22, cursor: "pointer", accentColor: VERT }}
                    />
                  </td>
                ))}

                <td style={{ ...cellule, textAlign: "center" }}>
                  <button
                    type="button"
                    style={{ ...bouton, minHeight: 36, padding: "0 8px", color: GRENAT }}
                    disabled={enCours}
                    aria-label={`Supprimer la taille ${t.libelle}`}
                    onClick={() => {
                      const suite = consequenceSuppression(groupe, t.id);
                      if (suite && !window.confirm(`${suite}\n\nContinuer ?`)) return;
                      if (!suite && !window.confirm(`Supprimer la taille « ${t.libelle} » ?`)) return;
                      void agir(supprimerValeur(porteur, t.id));
                    }}
                  >
                    🗑️
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Les trous : de vraies fautes, contrairement aux chevauchements. */}
      {trous.length > 0 && (
        <div style={{
          backgroundColor: "#FDECEC", border: "1px solid #F0C2C2", borderRadius: 10, padding: 10,
        }}>
          {trous.map((t, i) => (
            <p key={i} style={{ color: GRENAT, fontSize: 14, fontWeight: 600, margin: 0 }}>
              {messageTrou(t, unite)}
            </p>
          ))}
        </div>
      )}

      {!seuils && tailles.length > 0 && (
        <FriseDesPlages tailles={tailles} unite={unite} />
      )}

      {nouvelle ? (
        <div style={{
          border: BORDURE, borderRadius: 12, backgroundColor: "#FBF9F5", padding: 12,
          display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end",
        }}>
          <label style={{ display: "grid", gap: 4, flex: "1 1 120px", minWidth: 0 }}>
            <span style={{ fontSize: 13, color: MARINE, fontWeight: 600 }}>Nom</span>
            <input type="text" value={nouvelle.libelle} style={champ} placeholder="M"
              onChange={(e) => setNouvelle({ ...nouvelle, libelle: e.target.value })} />
          </label>
          <label style={{ display: "grid", gap: 4, flex: "0 1 120px" }}>
            <span style={{ fontSize: 13, color: MARINE, fontWeight: 600 }}>
              {seuils ? "À partir de" : "De"}
            </span>
            <input type="text" inputMode="decimal" value={nouvelle.min} style={champ} placeholder="33"
              onChange={(e) => setNouvelle({ ...nouvelle, min: e.target.value })} />
          </label>
          {!seuils && (
            <label style={{ display: "grid", gap: 4, flex: "0 1 120px" }}>
              <span style={{ fontSize: 13, color: MARINE, fontWeight: 600 }}>À</span>
              <input type="text" inputMode="decimal" value={nouvelle.max} style={champ} placeholder="41"
                onChange={(e) => setNouvelle({ ...nouvelle, max: e.target.value })} />
            </label>
          )}
          <button type="button" style={{ ...bouton, backgroundColor: VERT, borderColor: VERT, color: "#FFFFFF" }}
            disabled={enCours || !nouvelle.libelle.trim()}
            onClick={async () => {
              await agir(enregistrerValeur({
                porteur, groupe_id: groupe.id, libelle: nouvelle.libelle,
                borne_min: nouvelle.min, borne_max: seuils ? null : nouvelle.max,
              }));
              setNouvelle(null);
            }}>
            Ajouter
          </button>
          <button type="button" style={bouton} onClick={() => setNouvelle(null)}>Annuler</button>
        </div>
      ) : (
        <div>
          <button type="button" style={bouton} disabled={enCours}
            onClick={() => setNouvelle({ libelle: "", min: "", max: "" })}>
            + Ajouter une taille
          </button>
          {!largeurs && (
            <p style={{ color: SOUS, fontSize: 13, margin: "6px 0 0" }}>
              Aucun groupe ne dépend encore de cette grille. Créez la « Largeur » et faites-la
              dépendre de « {groupe.nom} » : ses colonnes apparaîtront ici.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * La frise des plages superposées.
 *
 * C'est le seul moyen de voir d'un coup d'œil si la gamme couvre tous les
 * chiens : un tableau de nombres ne montre pas un trou, un dessin si.
 */
function FriseDesPlages({ tailles, unite }: { tailles: ReturnType<typeof taillesTriees>; unite: string }) {
  const bornes = tailles.flatMap((t) => [Number(t.borne_min ?? 0), Number(t.borne_max ?? 0)])
    .filter((n) => Number.isFinite(n));
  if (bornes.length === 0) return null;

  const min = Math.min(...bornes);
  const max = Math.max(...bornes);
  const etendue = max - min || 1;
  const pourcent = (n: number) => ((n - min) / etendue) * 100;

  return (
    <div style={{ border: BORDURE, borderRadius: 12, padding: 12, backgroundColor: "#FBF9F5" }}>
      <p style={{ color: MARINE, fontSize: 14, fontWeight: 600, margin: "0 0 8px" }}>
        Ce que la gamme couvre
      </p>
      <div style={{ display: "grid", gap: 6 }}>
        {tailles.map((t) => {
          const a = Number(t.borne_min ?? 0);
          const b = Number(t.borne_max ?? 0);
          if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
          return (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{
                width: 52, flexShrink: 0, color: MARINE, fontSize: 13, fontWeight: 700,
                textAlign: "right",
              }}>
                {t.libelle}
              </span>
              <span style={{
                position: "relative", flex: 1, minWidth: 0, height: 18,
                backgroundColor: "#EDE8DF", borderRadius: 9,
              }}>
                <span style={{
                  position: "absolute", top: 0, bottom: 0,
                  left: `${pourcent(a)}%`, width: `${Math.max(pourcent(b) - pourcent(a), 1)}%`,
                  backgroundColor: OR, borderRadius: 9,
                }} />
              </span>
              <span style={{ width: 92, flexShrink: 0, color: SOUS, fontSize: 12, whiteSpace: "nowrap" }}>
                {fr(a)}–{fr(b)} {unite}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Un champ qui n'enregistre qu'une fois la saisie finie. */
function ChampNombre({
  valeur, onValider, desactive, largeur = 76, ...reste
}: {
  valeur: number | string | null | undefined;
  onValider: (v: string) => void;
  desactive?: boolean;
  largeur?: number;
} & React.AriaAttributes) {
  const texte = valeur === null || valeur === undefined ? "" : String(valeur);
  const [brut, setBrut] = useState(texte);
  const [dernier, setDernier] = useState(texte);
  if (texte !== dernier) { setDernier(texte); setBrut(texte); }

  return (
    <input
      {...reste}
      type="text"
      inputMode="decimal"
      value={brut}
      disabled={desactive}
      onChange={(e) => setBrut(e.target.value)}
      onBlur={() => { if (brut !== texte) onValider(brut); }}
      style={{ ...champ, width: largeur, textAlign: "right" }}
    />
  );
}

function ChampTexte({
  valeur, onValider, desactive, largeur = 100, ...reste
}: {
  valeur: string;
  onValider: (v: string) => void;
  desactive?: boolean;
  largeur?: number;
} & React.AriaAttributes) {
  const [brut, setBrut] = useState(valeur);
  const [dernier, setDernier] = useState(valeur);
  if (valeur !== dernier) { setDernier(valeur); setBrut(valeur); }

  return (
    <input
      {...reste}
      type="text"
      value={brut}
      disabled={desactive}
      onChange={(e) => setBrut(e.target.value)}
      onBlur={() => { if (brut.trim() && brut !== valeur) onValider(brut); }}
      style={{ ...champ, width: largeur }}
    />
  );
}

// Le supplément par combinaison reste saisi dans l'écran des dépendances, où
// il vit avec les prix des coloris. Ici, on ne coche que la disponibilité.
void definirSupplementCombinaison;
