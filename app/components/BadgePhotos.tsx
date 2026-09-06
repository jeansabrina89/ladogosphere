import { badgePhotos } from "@/src/lib/accordPhotos";
import { formatDateFR } from "@/src/lib/dates";

/**
 * Accord photos du client, pour les vues personnel.
 * `taille="petite"` pour les listes (chiens, chiens du jour), sinon fiche.
 */
export default function BadgePhotos({
  photos_ok,
  modifie_le,
  taille = "normale",
}: {
  photos_ok: boolean | null | undefined;
  modifie_le?: string | null;
  taille?: "normale" | "petite";
}) {
  const b = badgePhotos(photos_ok);
  const petite = taille === "petite";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        backgroundColor: b.bg,
        color: b.color,
        borderRadius: 999,
        padding: petite ? "1px 8px" : "2px 10px",
        fontSize: petite ? 11 : 13,
        fontWeight: 600,
        lineHeight: petite ? "16px" : "20px",
        whiteSpace: "nowrap",
      }}
    >
      📸 {b.label}
      {!petite && modifie_le && (
        <span style={{ fontWeight: 400, opacity: 0.75 }}>· {formatDateFR(modifie_le)}</span>
      )}
    </span>
  );
}
