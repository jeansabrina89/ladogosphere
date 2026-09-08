import Link from "next/link";

/**
 * Le filtre « Personnel », revenu à sa place.
 *
 * Il occupait une entrée de la barre latérale : ce n'était pas un écran, c'est
 * un FILTRE de celui-ci. Il vit donc ici, avec les autres filtres, et il porte
 * son compteur — ce qui reste à voir se lit sans ouvrir quoi que ce soit.
 *
 * Un clic pour l'activer, un clic pour revenir à tout : jamais plus.
 */
export default function FiltrePersonnel({
  actif,
  aVoir,
}: {
  actif: boolean;
  /** Réservations du personnel encore jamais regardées. */
  aVoir: number;
}) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
      <Link
        href={actif ? "/reservations" : "/reservations?personnel=1"}
        aria-pressed={actif}
        style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          minHeight: 44, padding: "0 16px", borderRadius: 999,
          fontSize: 15, fontWeight: actif ? 700 : 600, textDecoration: "none",
          backgroundColor: actif ? "#F4EAC9" : "#FFFFFF",
          border: `1px solid ${actif ? "#C9A84C" : "rgba(27,43,94,0.15)"}`,
          color: actif ? "#6E5410" : "#1B2B5E",
        }}
      >
        ⭐ {actif ? "Personnel — tout afficher" : "Personnel"}
        {aVoir > 0 && (
          <span
            style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              minWidth: 22, height: 22, padding: "0 7px", borderRadius: 999,
              backgroundColor: "#E8847A", color: "#FFFFFF", fontSize: 12, fontWeight: 700, lineHeight: 1,
            }}
          >
            {aVoir}
          </span>
        )}
      </Link>
    </div>
  );
}
