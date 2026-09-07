"use client";

/** Impression du récapitulatif : c'est le navigateur qui fait le PDF. */
export default function BoutonImprimer() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      style={{
        minHeight: 44, padding: "0 20px", borderRadius: 12, border: "none",
        backgroundColor: "#1B2B5E", color: "#FFFFFF", fontSize: 15, fontWeight: 600,
        fontFamily: "inherit", cursor: "pointer",
      }}
    >
      🖨️ Imprimer / PDF
    </button>
  );
}
