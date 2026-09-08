"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { brutAuServeur, ecouter, lireBrut } from "./panierNavigateur";
import { lirePanierLocal, nombreArticlesLocal } from "@/src/lib/panierLocalLogique";

const MARINE = "#1B2B5E";
const VERT = "#1F6E5B";

/**
 * Le panier, atteignable depuis n'importe quelle page de la boutique.
 *
 * Collé en bas à droite, au pouce : sur un téléphone tenu d'une main, le haut
 * de l'écran ne s'atteint pas sans changer de prise.
 *
 * Sans compte, le compteur se lit dans le navigateur — et il se met à jour
 * sans rechargement, y compris depuis un autre onglet.
 *
 * `auDessusDe` la remonte quand la page a déjà sa propre barre collée en bas —
 * le configurateur, par exemple. Sinon la pastille recouvre le bouton
 * « Ajouter au panier » sur un téléphone, et le clic part au mauvais endroit.
 */
export default function BarrePanier({
  nombre,
  local = false,
  auDessusDe = 0,
}: {
  nombre: number;
  local?: boolean;
  auDessusDe?: number;
}) {
  const brut = useSyncExternalStore(ecouter, lireBrut, brutAuServeur);
  const total = local ? nombreArticlesLocal(lirePanierLocal(brut ?? "")) : nombre;
  if (total <= 0) return null;

  return (
    <Link
      href="/catalogue/panier"
      aria-label={`Voir mon panier — ${total} article${total > 1 ? "s" : ""}`}
      style={{
        position: "fixed",
        right: 16,
        bottom: `calc(${16 + auDessusDe}px + env(safe-area-inset-bottom))`,
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
        {total}
      </span>
    </Link>
  );
}
