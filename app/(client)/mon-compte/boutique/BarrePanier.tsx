"use client";

import Link from "next/link";

const MARINE = "#1B2B5E";
const VERT = "#1F6E5B";

/**
 * Le panier, atteignable depuis n'importe quelle page de la boutique.
 *
 * Collé en bas à droite, au pouce : sur un téléphone tenu d'une main, le haut
 * de l'écran ne s'atteint pas sans changer de prise.
 */
export default function BarrePanier({ nombre }: { nombre: number }) {
  if (nombre <= 0) return null;

  return (
    <Link
      href="/mon-compte/boutique/panier"
      aria-label={`Voir mon panier — ${nombre} article${nombre > 1 ? "s" : ""}`}
      style={{
        position: "fixed",
        right: 16,
        bottom: "calc(16px + env(safe-area-inset-bottom))",
        zIndex: 40,
        minHeight: 56,
        padding: "0 20px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        borderRadius: 999,
        backgroundColor: VERT,
        color: "#FFFFFF",
        fontSize: 16,
        fontWeight: 700,
        textDecoration: "none",
        boxShadow: "0 6px 20px rgba(27,43,94,0.28)",
      }}
    >
      🛒 Mon panier
      <span
        aria-hidden
        style={{
          minWidth: 28, height: 28, borderRadius: 999,
          backgroundColor: "#FFFFFF", color: MARINE,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          fontSize: 15, fontWeight: 700, padding: "0 8px",
        }}
      >
        {nombre}
      </span>
    </Link>
  );
}
