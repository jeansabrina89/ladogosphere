"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { enregistrerFrancoPort } from "./actions";

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.58)";
const VERT = "#1F6E5B";
const BORDURE = "1px solid rgba(27,43,94,0.14)";

/** Le champ « Livraison offerte à partir de », en francs. Vide = jamais. */
export default function FormFrancoPort({ valeurInitiale }: { valeurInitiale: string }) {
  const router = useRouter();
  const [valeur, setValeur] = useState(valeurInitiale);
  const [enCours, setEnCours] = useState(false);
  const [retour, setRetour] = useState<{ texte: string; erreur: boolean } | null>(null);

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    setEnCours(true);
    const fd = new FormData();
    fd.set("franco_port_des", valeur);
    const res = await enregistrerFrancoPort(fd);
    setEnCours(false);
    if (res.error) { setRetour({ texte: res.error, erreur: true }); return; }
    setRetour({ texte: res.message ?? "Enregistré.", erreur: false });
    router.refresh();
  }

  return (
    <form onSubmit={enregistrer} style={{ display: "grid", gap: 10 }}>
      <label htmlFor="franco_port_des" style={{ fontSize: 15, fontWeight: 600, color: MARINE }}>
        Livraison offerte à partir de
      </label>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <input
          id="franco_port_des"
          name="franco_port_des"
          type="text"
          inputMode="decimal"
          value={valeur}
          onChange={(e) => setValeur(e.target.value)}
          placeholder="Vide = jamais"
          style={{
            width: 160, minHeight: 44, padding: "10px 12px", border: BORDURE, borderRadius: 12,
            fontSize: 16, color: MARINE, fontFamily: "inherit", boxSizing: "border-box",
          }}
        />
        <span style={{ color: MARINE, fontWeight: 600 }}>CHF d&apos;articles</span>
      </div>
      <p style={{ color: SOUS, fontSize: 13.5, margin: 0 }}>
        Montant des articles après les remises, avant le port. Laissez vide pour ne jamais offrir
        la livraison. La règle ne rend pas expédiable un article qui ne l&apos;est pas.
      </p>
      {retour && (
        <p role={retour.erreur ? "alert" : "status"} style={{
          margin: 0, fontSize: 14.5, fontWeight: 600, borderRadius: 10, padding: "8px 12px",
          backgroundColor: retour.erreur ? "#FDECEC" : "#DBEFEA",
          color: retour.erreur ? "#8A1F1F" : VERT,
        }}>
          {retour.texte}
        </p>
      )}
      <div>
        <button type="submit" disabled={enCours} style={{
          minHeight: 44, padding: "0 18px", borderRadius: 12, border: "none",
          backgroundColor: VERT, color: "#FFFFFF", fontSize: 15, fontWeight: 700,
          fontFamily: "inherit", cursor: enCours ? "wait" : "pointer", opacity: enCours ? 0.6 : 1,
        }}>
          {enCours ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </form>
  );
}
