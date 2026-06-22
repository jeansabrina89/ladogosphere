"use client";

import { useState } from "react";
import type { CSSProperties } from "react";

export default function ContactEmail({ email, style }: { email?: string | null; style?: CSSProperties }) {
  const [ouvert, setOuvert] = useState(false);
  const [copie, setCopie] = useState(false);

  if (!email) return <span style={style}>—</span>;

  const copier = async () => {
    try {
      await navigator.clipboard.writeText(email);
      setCopie(true);
      setTimeout(() => setCopie(false), 1500);
    } catch {
      setCopie(false);
    }
  };

  const item: CSSProperties = {
    display: "block", width: "100%", textAlign: "left", boxSizing: "border-box",
    padding: "10px 14px", fontSize: 14, fontWeight: 600, color: "#1B2B5E",
    background: "none", border: "none", cursor: "pointer", textDecoration: "none", whiteSpace: "nowrap",
  };

  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        style={{ background: "none", border: "none", padding: 0, font: "inherit", color: "inherit", textDecoration: "underline", cursor: "pointer", ...style }}
      >
        {email}
      </button>
      {ouvert && (
        <>
          <div onClick={() => setOuvert(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
          <span
            style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, zIndex: 50, display: "block",
              background: "#fff", border: "1px solid rgba(27,43,94,0.12)", borderRadius: 12,
              boxShadow: "0 6px 20px rgba(27,43,94,0.18)", overflow: "hidden", minWidth: 200 }}
          >
            <button type="button" onClick={copier} style={item}>
              {copie ? "✅ Copié" : "📋 Copier l'adresse"}
            </button>
            <a href={`mailto:${email}`} onClick={() => setOuvert(false)} style={{ ...item, borderTop: "1px solid rgba(27,43,94,0.08)" }}>
              ✉️ Écrire un email
            </a>
          </span>
        </>
      )}
    </span>
  );
}
