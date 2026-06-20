"use client";

export default function BoutonImprimer() {
  return (
    <button onClick={() => window.print()}
      className="px-4 py-2 rounded-xl font-semibold text-white text-sm"
      style={{ backgroundColor: "#2E8B7E" }}>
      🖨️ Imprimer
    </button>
  );
}
