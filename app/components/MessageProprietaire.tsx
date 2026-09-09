import {
  TITRE_MESSAGE_PROPRIETAIRE,
  messageProprietaire,
} from "@/src/lib/messageProprietaire";

/**
 * Le message du propriétaire, tel qu'il l'a écrit.
 *
 * Un seul composant pour les trois écrans où il doit se voir — fiche de
 * réservation, chiens du jour, check-in. Un encadré écrit trois fois finirait
 * par ne plus dire la même chose à trois endroits.
 *
 * Aucun encadré quand il n'y a pas de message : le composant rend `null`, et
 * la page n'a rien à tester de son côté.
 *
 * LECTURE SEULE. C'est une information du client, pas une note de service :
 * l'équipe qui veut ajouter quelque chose écrit dans le commentaire interne de
 * la réservation, qui existe déjà.
 */
export default function MessageProprietaire({
  commentaire,
  taille = "normale",
}: {
  commentaire: string | null | undefined;
  /** « petite » pour une ligne de liste, sinon la fiche. */
  taille?: "normale" | "petite";
}) {
  const message = messageProprietaire(commentaire);
  if (message === null) return null;

  const petite = taille === "petite";

  return (
    <div
      style={{
        backgroundColor: "#EDF1F8",
        border: "1px solid #C3CEE4",
        borderRadius: petite ? 12 : 14,
        padding: petite ? "8px 10px" : "12px 14px",
        marginTop: petite ? 6 : 0,
        marginBottom: petite ? 0 : 24,
      }}
    >
      <p
        style={{
          margin: 0,
          color: "#1B2B5E",
          fontSize: petite ? 12 : 14,
          fontWeight: 700,
          opacity: 0.75,
        }}
      >
        💬 {TITRE_MESSAGE_PROPRIETAIRE}
      </p>
      {/* Texte libre : aligné à gauche, sauts de ligne conservés, et il reste
          du texte — React l'échappe, rien n'est interprété comme du HTML. */}
      <p
        style={{
          margin: petite ? "3px 0 0" : "5px 0 0",
          color: "#1B2B5E",
          fontSize: petite ? 13 : 15,
          lineHeight: 1.6,
          textAlign: "left",
          whiteSpace: "pre-line",
          overflowWrap: "anywhere",
        }}
      >
        {message}
      </p>
    </div>
  );
}
