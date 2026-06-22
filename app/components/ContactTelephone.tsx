"use client";

import { useState } from "react";
import type { CSSProperties } from "react";

function digits(raw: string) {
  return raw.replace(/[^\d+]/g, "");
}
function pourWhatsapp(raw: string) {
  let d = digits(raw).replace(/^\+/, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0")) d = "41" + d.slice(1);
  return d;
}

export default function ContactTelephone({ numero, style }: { numero?: string | null; style?: CSSProperties }) {
  const [ouvert, setOuvert] = useState(false);

  if (!numero) return <span style={style}>—</span>;

  const tel = digits(numero);
  const wa = pourWhatsapp(numero);

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
        {numero}
      </button>
      {ouvert && (
        <>
          <div onClick={() => setOuvert(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
          <span
            style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, zIndex: 50, display: "block",
              background: "#fff", border: "1px solid rgba(27,43,94,0.12)", borderRadius: 12,
              boxShadow: "0 6px 20px rgba(27,43,94,0.18)", overflow: "hidden", minWidth: 200 }}
          >
            <a href={`tel:${tel}`} onClick={() => setOuvert(false)} style={item}>📞 Appeler</a>
            <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" onClick={() => setOuvert(false)} style={{ ...item, borderTop: "1px solid rgba(27,43,94,0.08)" }}>💬 WhatsApp</a>
            <a href={`sms:${tel}`} onClick={() => setOuvert(false)} style={{ ...item, borderTop: "1px solid rgba(27,43,94,0.08)" }}>✉️ SMS</a>
          </span>
        </>
      )}
    </span>
  );
}
