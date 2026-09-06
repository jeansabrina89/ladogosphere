"use client";

import { useState } from "react";
import { RESULTATS_ESSAI, LIBELLES_RESULTAT, type ResultatEssai } from "@/src/lib/journeeEssai";

const STYLE_RESULTAT: Record<ResultatEssai, { fond: string; bord: string; texte: string; icone: string; aide: string }> = {
  valide: {
    fond: "#DBEFEA", bord: "#4AAEA0", texte: "#1F6E5B", icone: "✅",
    aide: "Le chien est accepté à la pension. Le client reçoit un e-mail.",
  },
  seconde_journee: {
    fond: "#F4EAC9", bord: "#C9A84C", texte: "#6E5410", icone: "🔁",
    aide: "Une seconde journée d'essai sera proposée. Le client reçoit un e-mail.",
  },
  refuse: {
    fond: "#FBE2DE", bord: "#E8847A", texte: "#A8453A", icone: "❌",
    aide: "Aucun e-mail n'est envoyé : le résultat s'explique de vive voix.",
  },
};

/**
 * Saisie du résultat d'une journée d'essai, avant d'enregistrer le départ.
 * Même boîte pour l'admin et pour l'employé — c'est la personne qui rend le
 * chien qui saisit, avec la permission perm_checkin déjà existante.
 */
export default function DialogueResultatEssai({
  nom_chien,
  loading = false,
  onAnnuler,
  onValider,
}: {
  nom_chien: string;
  loading?: boolean;
  onAnnuler: () => void;
  onValider: (resultat: ResultatEssai, note: string) => void;
}) {
  const [resultat, setResultat] = useState<ResultatEssai | null>(null);
  const [note, setNote] = useState("");

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(27,43,94,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 60 }}
      onClick={onAnnuler}
    >
      <div
        style={{ background: "#fff", borderRadius: 18, padding: 24, maxWidth: 440, width: "100%", maxHeight: "90vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <p style={{ fontFamily: "Georgia, serif", fontSize: 19, fontWeight: 700, color: "#1B2B5E", margin: "0 0 4px" }}>
          🧪 Journée d&apos;essai de {nom_chien}
        </p>
        <p style={{ fontSize: 13.5, color: "rgba(27,43,94,0.6)", margin: "0 0 18px" }}>
          Comment s&apos;est passée la journée ? Le résultat est obligatoire pour enregistrer le départ.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
          {RESULTATS_ESSAI.map((r) => {
            const s = STYLE_RESULTAT[r];
            const choisi = resultat === r;
            return (
              <button
                key={r}
                type="button"
                onClick={() => setResultat(r)}
                style={{
                  display: "flex", alignItems: "flex-start", gap: 12, width: "100%", textAlign: "left",
                  padding: "14px 16px", borderRadius: 14, cursor: "pointer",
                  backgroundColor: choisi ? s.fond : "#F5F0E8",
                  border: choisi ? `2px solid ${s.bord}` : "2px solid transparent",
                }}
              >
                <span style={{ fontSize: 22, lineHeight: 1, flexShrink: 0 }}>{s.icone}</span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontWeight: 700, fontSize: 15.5, color: choisi ? s.texte : "#1B2B5E" }}>
                    {LIBELLES_RESULTAT[r]}
                  </span>
                  <span style={{ display: "block", fontSize: 12.5, color: "rgba(27,43,94,0.55)", marginTop: 2 }}>
                    {s.aide}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <label style={{ display: "block", fontWeight: 600, fontSize: 13.5, color: "#1B2B5E", marginBottom: 6 }}>
          Note interne (facultative)
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Ex. : très à l'aise avec les petits gabarits, un peu craintif au début…"
          style={{ width: "100%", border: "1px solid rgba(27,43,94,0.2)", borderRadius: 12, padding: "10px 12px", fontSize: 14, color: "#1B2B5E", boxSizing: "border-box", fontFamily: "inherit" }}
        />
        <p style={{ fontSize: 12, color: "rgba(27,43,94,0.5)", margin: "6px 0 18px" }}>
          Cette note reste interne : elle n&apos;est jamais envoyée au client.
        </p>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            disabled={!resultat || loading}
            onClick={() => resultat && onValider(resultat, note)}
            style={{
              flex: 1, minWidth: 160, padding: "12px 18px", borderRadius: 12, border: "none",
              backgroundColor: resultat && !loading ? "#1B2B5E" : "#C7CBD8",
              color: "#fff", fontWeight: 700, fontSize: 14.5,
              cursor: resultat && !loading ? "pointer" : "not-allowed",
            }}
          >
            {loading ? "Enregistrement…" : "🚪 Enregistrer le départ"}
          </button>
          <button
            type="button"
            onClick={onAnnuler}
            disabled={loading}
            style={{ padding: "12px 18px", borderRadius: 12, border: "none", backgroundColor: "#EDE8DF", color: "#1B2B5E", fontWeight: 600, fontSize: 14.5, cursor: "pointer" }}
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}
