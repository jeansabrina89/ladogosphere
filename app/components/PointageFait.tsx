import { formatHorodatage, instantUtc } from "@/src/lib/dates";
import type { GesteCheckin } from "@/src/lib/journalEvenements";
import AuteurGeste from "./AuteurGeste";

/**
 * « Arrivé à 08:12 · KC » : l'heure réelle d'un pointage fait, et qui l'a fait.
 * Rien tant que le pointage n'est pas fait.
 *
 * Réservé aux écrans du personnel. L'espace client ne l'importe jamais.
 */
export default function PointageFait({
  verbe,
  le,
  geste,
}: {
  verbe: string;
  le: string | null | undefined;
  geste: GesteCheckin | null | undefined;
}) {
  if (!le) return null;
  // L'heure du geste journalisé fait foi ; à défaut, la colonne (en UTC, sans fuseau).
  const heure = formatHorodatage(geste?.le ?? instantUtc(le)).slice(11);
  return (
    <span style={{ fontSize: "12px", color: "rgba(27,43,94,0.6)" }}>
      {verbe} à {heure}
      {geste && <>{" · "}<AuteurGeste auteur={geste.auteur} /></>}
    </span>
  );
}
