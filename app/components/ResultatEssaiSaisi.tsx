import { formatHorodatage } from "@/src/lib/dates";
import type { AuteurAffiche } from "@/src/lib/auteur";
import AuteurGeste from "./AuteurGeste";

/** Le résultat, tel qu'il se lit devant « le … par … ». */
const VERBE: Record<string, string> = {
  valide: "Validé",
  refuse: "Refusé",
  seconde_journee: "Seconde journée demandée",
};

/**
 * « Validé le 14.09.2026 17:32 par SJ » : le résultat d'une journée d'essai,
 * quand il a été saisi et par qui. Rien tant qu'aucun résultat n'est saisi.
 *
 * Réservé aux écrans du personnel. L'espace client ne l'importe jamais.
 */
export default function ResultatEssaiSaisi({
  statut,
  le,
  auteur,
}: {
  statut: string | null | undefined;
  le: string | null | undefined;
  auteur: AuteurAffiche | null;
}) {
  if (!le) return null;
  return (
    <>
      {VERBE[statut ?? ""] ?? "Résultat saisi"} le {formatHorodatage(le)}
      {auteur && <>{" par "}<AuteurGeste auteur={auteur} /></>}
    </>
  );
}
