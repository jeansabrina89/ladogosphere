import type { AuteurAffiche } from "@/src/lib/auteur";

/**
 * L'auteur d'un geste, tel qu'il s'écrit dans une ligne d'historique :
 * « SJ » avec le nom complet au survol, « automatique » ou « client ».
 *
 * Réservé aux écrans du personnel. L'espace client ne l'importe jamais.
 */
export default function AuteurGeste({ auteur }: { auteur: AuteurAffiche }) {
  if (auteur.genre !== "personnel") {
    return <span style={{ fontStyle: "italic" }}>{auteur.texte}</span>;
  }
  return (
    <abbr title={auteur.titre ?? undefined} style={{ textDecoration: "none", fontWeight: 600, cursor: "help" }}>
      {auteur.texte}
    </abbr>
  );
}
