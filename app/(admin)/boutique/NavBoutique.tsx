"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Navigation secondaire de l'espace Boutique.
 *
 * Une seule ligne, qui défile horizontalement plutôt que de s'empiler : à
 * 375 px, six entrées empilées repousseraient le contenu hors de l'écran.
 * Les entrées sont dans l'ordre d'usage réel de la journée, pas dans l'ordre
 * alphabétique — on encaisse avant de faire l'inventaire.
 */

const MARINE = "#1B2B5E";
const VERT = "#1F6E5B";

export type EntreeBoutique = {
  href: string;
  label: string;
  exact?: boolean;
  /** Le niveau qu'il faut pour y entrer. « vente » par défaut. */
  niveau?: "vente" | "gestion";
};

export const ENTREES_BOUTIQUE: EntreeBoutique[] = [
  { href: "/boutique", label: "🏠 Boutique", exact: true },
  { href: "/boutique/caisse", label: "💳 Caisse" },
  { href: "/boutique/ventes", label: "🧾 Ventes" },
  { href: "/boutique/commandes", label: "🎁 Sur mesure" },
  { href: "/boutique/commandes-en-ligne", label: "🌐 En ligne" },
  { href: "/boutique/articles", label: "🛒 Articles" },
  { href: "/boutique/modeles", label: "🧩 Modèles", niveau: "gestion" },
  { href: "/boutique/inventaire", label: "📦 Inventaire", niveau: "gestion" },
  // Un seul écran, deux chemins d'accès : la fiche fournisseur sert aussi bien
  // aux dépenses qu'à la boutique. Elle n'est ni déplacée ni dupliquée. Les
  // fournisseurs relèvent de l'achat : c'est de la gestion.
  { href: "/comptabilite/fournisseurs", label: "🏢 Fournisseurs", niveau: "gestion" },
];

/** Ce qu'une personne voit dans la barre, selon ce à quoi elle a droit. */
export function entreesVisibles(gestion: boolean): EntreeBoutique[] {
  return ENTREES_BOUTIQUE.filter((e) => gestion || e.niveau !== "gestion");
}

export default function NavBoutique({ gestion = true }: { gestion?: boolean }) {
  const chemin = usePathname();
  const entrees = entreesVisibles(gestion);

  const actif = (e: EntreeBoutique) =>
    e.exact ? chemin === e.href : chemin.startsWith(e.href);

  return (
    <nav
      aria-label="Espace Boutique"
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
          const ici = actif(e);
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
