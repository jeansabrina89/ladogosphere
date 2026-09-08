"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { estActif, type Ecran } from "@/src/lib/espaces";

/**
 * Barre secondaire d'un espace — le modèle posé par la boutique en APP 13,
 * devenu commun aux huit espaces.
 *
 * Une seule ligne, qui DÉFILE horizontalement plutôt que de s'empiler : à
 * 375 px, sept entrées empilées repousseraient le contenu hors de l'écran.
 * Les entrées sont dans l'ordre d'usage réel, pas dans l'ordre alphabétique.
 *
 * Elle ne reçoit que des écrans déjà filtrés par les permissions (voir
 * `espacesVisibles`) : rien n'y est grisé, rien n'y est caché en CSS. Et si
 * cette personne n'a droit à aucun écran de l'espace, la barre n'existe pas —
 * un liseré blanc vide serait pire que rien.
 */

const MARINE = "#1B2B5E";
const VERT = "#1F6E5B";

export default function NavEspace({
  nom,
  entrees,
}: {
  /** Le nom de l'espace, pour l'étiquette d'accessibilité. */
  nom: string;
  entrees: Ecran[];
}) {
  const chemin = usePathname();
  // Une barre d'une seule entrée n'est pas une navigation, c'est une étiquette :
  // la barre latérale dit déjà où l'on est. On ne l'affiche pas.
  if (entrees.length <= 1) return null;

  return (
    <nav
      aria-label={`Espace ${nom}`}
      style={{
        position: "sticky", top: 0, zIndex: 30,
        backgroundColor: "#FFFFFF",
        borderBottom: "1px solid rgba(27,43,94,0.12)",
      }}
    >
      <div
        style={{
          display: "flex", gap: 6, alignItems: "center",
          padding: "8px 12px",
          overflowX: "auto",
          // La barre défile ; elle ne se replie jamais sur deux lignes.
          flexWrap: "nowrap",
          scrollbarWidth: "thin",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {entrees.map((e) => {
          const ici = estActif(chemin, e.href, e.exact);
          return (
            <Link
              key={e.href}
              href={e.href}
              aria-current={ici ? "page" : undefined}
              style={{
                flex: "0 0 auto",
                display: "inline-flex", alignItems: "center",
                minHeight: 44, padding: "0 14px", borderRadius: 999,
                fontSize: 15, fontWeight: ici ? 700 : 500,
                whiteSpace: "nowrap", textDecoration: "none",
                backgroundColor: ici ? "#DBEFEA" : "transparent",
                color: ici ? VERT : MARINE,
                border: ici ? "1px solid #B9DDD1" : "1px solid transparent",
              }}
            >
              {e.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
