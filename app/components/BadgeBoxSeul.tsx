import { BADGE_BOX_SEUL } from "@/src/lib/boxSeul";

/**
 * APP 74 — la réservation a la case « chien seul dans un box » : le chien
 * occupe un box ENTIER. Vu par l'équipe là où elle place et accueille les
 * chiens (Chiens du jour, Check-in, Planning). Rien quand la case est vide.
 */
export default function BadgeBoxSeul({ box_seul }: { box_seul: boolean | null | undefined }) {
  if (box_seul !== true) return null;
  return (
    <span
      title="Chien seul dans un box : il ne partage pas son box"
      style={{
        display: "inline-flex",
        alignItems: "center",
        backgroundColor: "#DBEFEA",
        color: "#1F6E5B",
        borderRadius: 999,
        padding: "1px 8px",
        fontSize: 11,
        fontWeight: 700,
        lineHeight: "16px",
        whiteSpace: "nowrap",
      }}
    >
      {BADGE_BOX_SEUL}
    </span>
  );
}
