/**
 * Le message que le propriétaire laisse en réservant.
 *
 * C'est le SEUL endroit où il peut signaler quelque chose avant l'arrivée —
 * une boiterie, un traitement en cours, une peur des orages. Il doit donc se
 * voir sans clic, là où l'équipe regarde déjà : la fiche de réservation, les
 * chiens du jour, et l'écran de check-in.
 *
 * Il ne se confond pas avec le commentaire interne de la réservation
 * (`reservations.commentaire_admin`), qui est la note que l'ÉQUIPE prend. Deux
 * champs, deux auteurs, deux encadrés : côté pension, celui-ci reste en
 * lecture seule.
 *
 * Fonction pure : ni base, ni requête. C'est ici que vit la décision
 * d'afficher, et c'est ce fichier que les tests couvrent.
 */

export const TITRE_MESSAGE_PROPRIETAIRE = "Message du propriétaire";

/**
 * Le message à afficher, ou null s'il n'y a rien à montrer.
 *
 * Un champ vide, absent, ou ne contenant que des espaces et des retours à la
 * ligne ne dit RIEN : il ne mérite pas un encadré. Un cadre vide sur trois
 * écrans, c'est trois fois du bruit — et le jour où il y aura vraiment un
 * message, plus personne ne le regardera.
 *
 * Le texte est rendu tel qu'il a été écrit : les sauts de ligne et les
 * paragraphes du propriétaire sont conservés, mot pour mot. Seuls les blancs
 * DE BORDURE sont retirés — ils n'ajoutent rien et ouvriraient l'encadré sur
 * des lignes vides.
 */
export function messageProprietaire(
  commentaire: string | null | undefined
): string | null {
  const texte = String(commentaire ?? "");
  const utile = texte.trim();
  return utile === "" ? null : utile;
}

/** Y a-t-il quelque chose à montrer ? La même décision, en booléen. */
export function aUnMessageProprietaire(
  commentaire: string | null | undefined
): boolean {
  return messageProprietaire(commentaire) !== null;
}
