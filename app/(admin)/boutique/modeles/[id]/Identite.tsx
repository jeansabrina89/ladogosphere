"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { enregistrerModele } from "../actions";

const MARINE = "#1B2B5E";
const SOUS = "#5B6478";
const VERT = "#1F6E5B";
const BORDURE = "1px solid rgba(27,43,94,0.14)";

const champ: React.CSSProperties = {
  width: "100%", padding: "12px 14px", borderRadius: 12,
  border: BORDURE, fontSize: 16, color: MARINE, backgroundColor: "#FFFFFF",
  fontFamily: "inherit", boxSizing: "border-box",
};

const etiquette: React.CSSProperties = {
  display: "block", fontSize: 14, fontWeight: 600, color: MARINE, marginBottom: 6,
};

const bouton: React.CSSProperties = {
  minHeight: 44, padding: "10px 14px", borderRadius: 12, border: BORDURE,
  backgroundColor: "#FFFFFF", color: MARINE, fontSize: 15, fontWeight: 600,
  fontFamily: "inherit", cursor: "pointer",
};

/** Le nom et l'explication du modèle, modifiables sur place. */
export default function Identite({
  modele,
}: {
  modele: { id: string; nom: string; description: string | null };
}) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [nom, setNom] = useState(modele.nom);
  const [description, setDescription] = useState(modele.description ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  if (!ouvert) {
    return (
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        {modele.description && (
          <p style={{ color: SOUS, fontSize: 15, margin: 0, flex: "1 1 220px", whiteSpace: "pre-line" }}>
            {modele.description}
          </p>
        )}
        <button type="button" style={bouton} onClick={() => setOuvert(true)}>
          ✏️ Renommer
        </button>
        {message && (
          <span role="status" style={{ color: VERT, fontSize: 14, fontWeight: 600 }}>{message}</span>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {erreur && (
        <p role="alert" style={{ color: "#A8453A", fontSize: 15, margin: 0, fontWeight: 600 }}>{erreur}</p>
      )}
      <div>
        <label htmlFor="nom-modele" style={etiquette}>Nom du modèle</label>
        <input id="nom-modele" type="text" value={nom} onChange={(e) => setNom(e.target.value)} style={champ} />
      </div>
      <div>
        <label htmlFor="desc-modele" style={etiquette}>À quoi il sert (facultatif)</label>
        <input id="desc-modele" type="text" value={description}
          onChange={(e) => setDescription(e.target.value)} style={champ} />
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          style={{ ...bouton, backgroundColor: VERT, borderColor: VERT, color: "#FFFFFF" }}
          disabled={enCours}
          onClick={async () => {
            setEnCours(true);
            const res = await enregistrerModele({ id: modele.id, nom, description });
            setEnCours(false);
            setErreur(res.error ?? null);
            if (!res.error) {
              setMessage(res.message ?? null);
              setOuvert(false);
              router.refresh();
            }
          }}
        >
          {enCours ? "…" : "💾 Enregistrer"}
        </button>
        <button type="button" style={bouton} onClick={() => setOuvert(false)}>Annuler</button>
      </div>
    </div>
  );
}
