"use client";

export default function BoutonImprimer() {
  return (
    <button
      onClick={() => window.print()}
      className="px-6 py-2 rounded-xl font-semibold text-white text-sm"
      style={{ backgroundColor: "#1B2B5E" }}>
      🖨️ Imprimer / PDF
    </button>
  );
}