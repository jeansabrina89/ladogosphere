import Link from "next/link";

/**
 * Les tuiles des tableaux de bord d'espace — le modèle posé par la boutique en
 * APP 13, devenu commun aux huit espaces.
 *
 * Un chiffre qui décide d'une action, et le chemin vers l'écran où l'on agit.
 * Une tuile qui ne mène nulle part n'en est pas une : si un chiffre n'appelle
 * aucune décision, il n'a rien à faire là.
 */

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.55)";
const BORDURE = "1px solid rgba(27,43,94,0.12)";

export function Tuile({
  href,
  titre,
  valeur,
  detail,
  couleur = MARINE,
  fond = "#FFFFFF",
  alerte = false,
}: {
  href: string;
  titre: string;
  valeur: string;
  detail?: string;
  couleur?: string;
  fond?: string;
  /** Ce chiffre demande une action maintenant : la tuile le montre. */
  alerte?: boolean;
}) {
  return (
    <Link href={href} style={{ textDecoration: "none" }}>
      <div style={{
        backgroundColor: fond,
        border: alerte ? "2px solid #C9A84C" : BORDURE,
        borderRadius: 18, padding: 20, minHeight: 118,
        display: "flex", flexDirection: "column", justifyContent: "center",
        minWidth: 0,
      }}>
        <p style={{ color: SOUS, fontSize: 13, margin: 0, overflowWrap: "anywhere" }}>{titre}</p>
        <p style={{ color: couleur, fontSize: 26, fontWeight: 700, margin: "6px 0 0", lineHeight: 1.1, overflowWrap: "anywhere" }}>
          {valeur}
        </p>
        {detail && (
          <p style={{ color: SOUS, fontSize: 13, margin: "4px 0 0", overflowWrap: "anywhere" }}>{detail}</p>
        )}
      </div>
    </Link>
  );
}

/** Emplacement d'une tuile à venir : elle dit ce qu'elle attend, et de qui. */
export function TuileAVenir({ titre, note }: { titre: string; note: string }) {
  return (
    <div style={{
      backgroundColor: "#FBF9F5", border: "1px dashed rgba(27,43,94,0.22)",
      borderRadius: 18, padding: 20, minHeight: 118,
      display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 0,
    }}>
      <p style={{ color: SOUS, fontSize: 13, margin: 0 }}>{titre}</p>
      <p style={{ color: "rgba(27,43,94,0.35)", fontSize: 26, fontWeight: 700, margin: "6px 0 0", lineHeight: 1.1 }}>
        —
      </p>
      <p style={{ color: SOUS, fontSize: 13, margin: "4px 0 0" }}>{note}</p>
    </div>
  );
}

/** Un lien vers un écran de l'espace, quand il n'y a pas de chiffre à montrer. */
export function Raccourci({ href, titre, note }: { href: string; titre: string; note: string }) {
  return (
    <Link href={href} style={{ textDecoration: "none" }}>
      <div style={{
        backgroundColor: "#FFFFFF", border: BORDURE, borderRadius: 16,
        padding: 16, minHeight: 76, minWidth: 0,
      }}>
        <p style={{ color: MARINE, fontSize: 16, fontWeight: 700, margin: 0, overflowWrap: "anywhere" }}>{titre}</p>
        <p style={{ color: SOUS, fontSize: 13, margin: "4px 0 0", overflowWrap: "anywhere" }}>{note}</p>
      </div>
    </Link>
  );
}

/** La grille des tuiles : elle se replie toute seule jusqu'à 375 px. */
export function GrilleTuiles({
  children,
  etiquette,
  min = 220,
}: {
  children: React.ReactNode;
  etiquette: string;
  min?: number;
}) {
  return (
    <section
      aria-label={etiquette}
      className="grid gap-4"
      style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, minWidth: 0 }}
    >
      {children}
    </section>
  );
}
