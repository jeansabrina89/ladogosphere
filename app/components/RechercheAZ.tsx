"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import {
  LETTRES,
  adresseListe,
  compte,
  filtrer,
  lettresAvecFiches,
  versQuery,
  type EntreeRecherche,
  type EtatRecherche,
} from "@/src/lib/rechercheAZ";

/**
 * APP 73 — la barre de recherche et les lettres A … Z des listes Chiens et
 * Clients. Un seul composant, deux listes.
 *
 * La page serveur lit la liste UNE fois et rend chaque carte ; ce composant ne
 * fait que choisir lesquelles montrer. L'état vit dans l'adresse
 * (?lettre=M&q=max), écrit par `history.replaceState` : pas d'aller-retour
 * serveur à chaque lettre tapée, et un lien copié rouvre la même vue. Chaque
 * fiche reçoit cet état (?retour=…) pour que son « ← Retour » ramène ici.
 */

export type ElementRecherche = EntreeRecherche & {
  /** Clé de tri : nom du chien, ou « nom prénom » du client. */
  tri: string;
  carte: ReactNode;
};

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.6)";
const OR = "#C9A84C";

export default function RechercheAZ({
  base,
  elements,
  initial,
  singulier,
  pluriel,
  placeholder,
  filtre,
}: {
  /** L'adresse de la liste : « /chiens », « /clients ». */
  base: string;
  elements: ElementRecherche[];
  initial: EtatRecherche;
  singulier: string;
  pluriel: string;
  placeholder: string;
  /** Un filtre en plus, annoncé par un encadré quand il a des fiches. */
  filtre?: { cle: string; encadre: (n: number) => string; bouton: string; actif: string };
}) {
  const [etat, setEtat] = useState<EtatRecherche>(initial);

  const changer = (suite: EtatRecherche) => {
    setEtat(suite);
    try {
      window.history.replaceState(null, "", adresseListe(base, suite));
    } catch {
      // Un navigateur qui refuse : le filtre marche quand même, l'adresse ne suit pas.
    }
  };

  const tries = useMemo(
    () => [...elements].sort((a, b) => a.tri.localeCompare(b.tri, "fr", { sensitivity: "base" })),
    [elements],
  );
  const avecFiches = useMemo(() => lettresAvecFiches(elements), [elements]);
  const visibles = filtrer(tries, etat);
  const nbFiltre = filtre ? elements.filter((e) => (e.drapeaux ?? []).includes(filtre.cle)).length : 0;
  const retour = encodeURIComponent(versQuery(etat));
  const effacer = () => changer({ lettre: null, q: "", filtre: null });

  const bouton = (actif: boolean, inactif = false): React.CSSProperties => ({
    flex: "0 0 auto", minWidth: 36, minHeight: 36, padding: "0 8px", borderRadius: 10,
    border: actif ? `2px solid ${MARINE}` : "1px solid rgba(27,43,94,0.18)",
    backgroundColor: actif ? MARINE : "#FFFFFF", color: actif ? "#FFFFFF" : MARINE,
    fontSize: 14, fontWeight: 700, fontFamily: "inherit",
    cursor: inactif ? "not-allowed" : "pointer", opacity: inactif ? 0.35 : 1,
  });

  return (
    <div style={{ minWidth: 0 }}>
      {filtre && nbFiltre > 0 && (
        <div role="status" style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
          border: `1px solid ${OR}`, backgroundColor: "#FBF6E6", color: "#6E5410",
          borderRadius: 14, padding: "10px 14px", margin: "0 0 14px", fontSize: 14, fontWeight: 600,
        }}>
          <span>{filtre.encadre(nbFiltre)}</span>
          <button type="button" aria-pressed={etat.filtre === filtre.cle}
            onClick={() => changer({ ...etat, filtre: etat.filtre === filtre.cle ? null : filtre.cle })}
            style={{
              minHeight: 36, padding: "0 12px", borderRadius: 10, border: `1px solid ${OR}`,
              backgroundColor: etat.filtre === filtre.cle ? "#6E5410" : "#FFFFFF",
              color: etat.filtre === filtre.cle ? "#FFFFFF" : "#6E5410",
              fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
            }}>
            {etat.filtre === filtre.cle ? filtre.actif : filtre.bouton}
          </button>
        </div>
      )}

      <label style={{ display: "block", margin: "0 0 10px" }}>
        <span className="sr-only">Rechercher</span>
        <input
          type="search"
          value={etat.q}
          onChange={(e) => changer({ ...etat, q: e.target.value })}
          placeholder={placeholder}
          aria-label="Rechercher"
          style={{
            width: "100%", minHeight: 48, padding: "10px 14px", boxSizing: "border-box",
            border: "1px solid rgba(27,43,94,0.2)", borderRadius: 12, fontSize: 16,
            color: MARINE, backgroundColor: "#FFFFFF", fontFamily: "inherit",
          }}
        />
      </label>

      {/* Une ligne, qui défile sur téléphone : vingt-sept cibles de 36 px ne
          tiennent pas sur 360 px, et deux lignes pousseraient la liste hors de vue. */}
      <nav aria-label="Filtrer par lettre" style={{
        display: "flex", gap: 6, overflowX: "auto", flexWrap: "nowrap",
        padding: "2px 0 8px", margin: "0 0 12px", WebkitOverflowScrolling: "touch",
      }}>
        <button type="button" aria-pressed={etat.lettre === null}
          onClick={() => changer({ ...etat, lettre: null })} style={bouton(etat.lettre === null)}>
          Tous
        </button>
        {LETTRES.map((l) => {
          const inactif = !avecFiches.has(l);
          const actif = etat.lettre === l;
          return (
            <button key={l} type="button" disabled={inactif} aria-pressed={actif}
              aria-label={inactif ? `${l} — aucune fiche` : `Lettre ${l}`}
              onClick={() => changer({ ...etat, lettre: actif ? null : l })}
              style={bouton(actif, inactif)}>
              {l}
            </button>
          );
        })}
      </nav>

      <p style={{ color: SOUS, fontSize: 14, fontWeight: 600, margin: "0 0 16px" }} aria-live="polite">
        {compte(visibles.length, singulier, pluriel)}
      </p>

      {visibles.length === 0 ? (
        <div style={{
          backgroundColor: "#FFFFFF", border: "1px solid rgba(27,43,94,0.12)", borderRadius: 16,
          padding: "20px 16px", textAlign: "center", color: MARINE,
        }}>
          <p style={{ margin: "0 0 8px", fontSize: 15 }}>
            {etat.q.trim()
              ? `Aucun ${singulier} ne correspond à “${etat.q.trim()}”.`
              : `Aucun ${singulier} pour ce filtre.`}
          </p>
          <button type="button" onClick={effacer} style={{
            background: "none", border: "none", color: "#1F6E5B", fontWeight: 700,
            textDecoration: "underline", cursor: "pointer", fontSize: 15, fontFamily: "inherit",
          }}>
            {etat.q.trim() ? "Effacer la recherche" : "Effacer les filtres"}
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {visibles.map((e) => (
            <Link key={e.id} href={`${base}/${e.id}${retour ? `?retour=${retour}` : ""}`}
              style={{ textDecoration: "none" }}>
              {e.carte}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
