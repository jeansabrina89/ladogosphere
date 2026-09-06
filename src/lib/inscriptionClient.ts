/**
 * Logique pure de rattachement d'un compte Auth à une fiche `clients`.
 *
 * Trois cas, et trois seulement :
 * - AUCUNE fiche pour cet e-mail            → on en crée une ;
 * - une fiche LIBRE (auth_user_id null)     → on la lie au compte, en complétant
 *                                             seulement les champs encore vides ;
 * - une fiche DÉJÀ LIÉE à un autre compte   → refus (message explicite).
 *
 * Une fiche déjà liée au MÊME compte n'est pas un refus : c'est le cas normal
 * d'un renvoi de formulaire ou de la page « compléter mon profil ».
 */

export const MESSAGE_EMAIL_DEJA_UTILISE =
  "Un compte existe déjà pour cette adresse, utilisez « Mot de passe oublié ».";

export type FicheClientExistante = {
  id: string;
  auth_user_id: string | null;
  prenom: string | null;
  nom: string | null;
  telephone: string | null;
};

export type IdentiteInscription = {
  prenom: string;
  nom: string;
  telephone?: string | null;
};

export type DecisionFicheClient =
  | { action: "creer" }
  | { action: "lier"; id: string; champs: Partial<IdentiteInscription> }
  | { action: "refus"; message: string };

/** Normalise un e-mail pour la comparaison : minuscules + espaces retirés. */
export function normaliserEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

/** Une chaîne de formulaire vide (ou blanche) vaut « non renseigné ». */
function vide(v: string | null | undefined): boolean {
  return !v || v.trim() === "";
}

/**
 * Que faire d'un compte Auth fraîchement créé, au vu de la fiche `clients`
 * portant le même e-mail (ou `null` s'il n'y en a pas) ?
 *
 * `champs` ne contient QUE les colonnes à compléter : on n'écrase jamais une
 * valeur déjà saisie côté pension (une fiche créée par l'admin fait foi).
 */
export function decisionFicheClient({
  fiche,
  authUserId,
  identite,
}: {
  fiche: FicheClientExistante | null;
  authUserId: string;
  identite: IdentiteInscription;
}): DecisionFicheClient {
  if (!fiche) return { action: "creer" };

  // Fiche déjà rattachée à un AUTRE compte : on ne détourne jamais une fiche.
  if (fiche.auth_user_id && fiche.auth_user_id !== authUserId) {
    return { action: "refus", message: MESSAGE_EMAIL_DEJA_UTILISE };
  }

  const champs: Partial<IdentiteInscription> = {};
  if (vide(fiche.prenom) && !vide(identite.prenom)) champs.prenom = identite.prenom.trim();
  if (vide(fiche.nom) && !vide(identite.nom)) champs.nom = identite.nom.trim();
  if (vide(fiche.telephone) && !vide(identite.telephone)) {
    champs.telephone = (identite.telephone as string).trim();
  }

  return { action: "lier", id: fiche.id, champs };
}

/**
 * Valide les champs d'identité saisis à l'inscription.
 * Renvoie null si tout va bien, sinon le message à afficher.
 */
export function validerIdentiteInscription(identite: IdentiteInscription): string | null {
  if (vide(identite.prenom)) return "Le prénom est obligatoire.";
  if (vide(identite.nom)) return "Le nom est obligatoire.";
  return null;
}
