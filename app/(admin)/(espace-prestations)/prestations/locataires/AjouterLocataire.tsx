"use client";

import { useState } from "react";
import Link from "next/link";
import { chercherClientsPourLocation } from "../actions";
import type { SorteBox } from "@/src/lib/boxPriveLogique";

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.55)";
const BORDURE = "1px solid rgba(27,43,94,0.14)";
const CIBLE = 52;

type Trouve = { id: string; nom: string; email: string | null; locataire: boolean; box: string | null };

/**
 * « + Client box privé » ou « + Box refacturé » : on cherche le client — comme à
 * la caisse, un champ en haut et de grandes lignes touchables — et on ouvre sa
 * fiche. La case, c'est Sabrina qui la coche, là-bas.
 *
 * ── DEUX BOUTONS, DEUX FORMULAIRES (APP 61) ───────────────────────────────
 *
 * La SORTE voyage dans l'adresse (`?sorte=refacture`) jusqu'à la fiche, qui
 * montre ou cache le champ loyer. Un client box privé ne doit pas voir ce
 * champ : Sabrina ne lui refacture rien, et un champ qu'on ne devrait pas
 * remplir finit par l'être.
 */
export default function AjouterLocataire({ sorte = "prive" }: { sorte?: SorteBox }) {
  const [ouvert, setOuvert] = useState(false);
  const [recherche, setRecherche] = useState("");
  const [resultats, setResultats] = useState<Trouve[]>([]);

  const refacture = sorte === "refacture";
  const libelle = refacture ? "+ Box refacturé" : "+ Client box privé";
  const question = refacture
    ? "Quel client a son loyer de box refacturé ?"
    : "Quel client loue un box au chenil ?";
  const lien = (id: string) =>
    refacture ? `/prestations/locataires/${id}?sorte=refacture` : `/prestations/locataires/${id}`;

  async function chercher(q: string) {
    setRecherche(q);
    if (q.trim().length < 2) return setResultats([]);
    setResultats(await chercherClientsPourLocation(q));
  }

  if (!ouvert) {
    return (
      <button type="button" onClick={() => setOuvert(true)} style={{
        minHeight: 44, padding: "0 16px", borderRadius: 12, border: "none",
        background: refacture ? "#1F6E5B" : "#4AAEA0",
        color: "#FFF", fontWeight: 700, fontSize: 14, cursor: "pointer",
      }}>
        {libelle}
      </button>
    );
  }

  return (
    <div style={{
      background: "#FFF", border: BORDURE, borderRadius: 16, padding: 14, marginBottom: 16, minWidth: 0,
    }}>
      <label htmlFor={`recherche-${sorte}`} style={{ display: "block", fontSize: 13, fontWeight: 600, color: MARINE, marginBottom: 6 }}>
        {question}
      </label>
      <input
        id={`recherche-${sorte}`}
        type="search"
        autoFocus
        value={recherche}
        onChange={(e) => chercher(e.target.value)}
        placeholder="Nom, prénom ou e-mail…"
        style={{
          width: "100%", minHeight: CIBLE, padding: "12px 14px", border: BORDURE, borderRadius: 14,
          fontSize: 16, color: MARINE, backgroundColor: "#FFFFFF", fontFamily: "inherit", boxSizing: "border-box",
        }}
      />
      {recherche.trim().length >= 2 && resultats.length === 0 && (
        <p style={{ color: SOUS, fontSize: 14, margin: "10px 0 0" }}>Aucun client actif ne correspond.</p>
      )}
      <ul style={{ listStyle: "none", margin: "10px 0 0", padding: 0, display: "grid", gap: 8 }}>
        {resultats.map((c) => (
          <li key={c.id}>
            <Link href={lien(c.id)} style={{
              display: "flex", alignItems: "center", gap: 10, minHeight: CIBLE, padding: "8px 12px",
              border: BORDURE, borderRadius: 14, textDecoration: "none", color: MARINE, minWidth: 0,
            }}>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontWeight: 700, overflowWrap: "anywhere" }}>{c.nom}</span>
                {c.email && <span style={{ display: "block", fontSize: 12, color: SOUS, overflowWrap: "anywhere" }}>{c.email}</span>}
              </span>
              {c.locataire && (
                <span style={{
                  marginLeft: "auto", fontSize: 12, fontWeight: 600, padding: "2px 8px", borderRadius: 999,
                  background: "#E4E7F0", color: MARINE, whiteSpace: "nowrap",
                }}>
                  déjà ouvert · Box {c.box ?? "—"}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => { setOuvert(false); setRecherche(""); setResultats([]); }} style={{
        marginTop: 10, minHeight: 40, padding: "0 14px", borderRadius: 12, border: BORDURE,
        background: "#FFF", color: SOUS, fontSize: 14, cursor: "pointer",
      }}>
        Fermer
      </button>
    </div>
  );
}
