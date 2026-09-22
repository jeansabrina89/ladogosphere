/**
 * Les choix d'un article sur mesure, sous son nom : « Largeur : 16 mm ·
 * Couleur : bleu marine ». Les libellés viennent de libellesConfiguration —
 * ce composant ne fait que les poser. Rien à montrer : rien n'est rendu, et
 * une ligne d'article standard reste telle qu'elle était.
 */
export default function OptionsChoisies({
  options,
  couleur = "#5B6478",
  taille = 14,
}: {
  options?: string[] | null;
  couleur?: string;
  taille?: number;
}) {
  if (!options || options.length === 0) return null;
  return (
    <span
      data-options-choisies=""
      style={{ display: "block", color: couleur, fontSize: taille, lineHeight: 1.4, overflowWrap: "anywhere" }}
    >
      {options.join(" · ")}
    </span>
  );
}
