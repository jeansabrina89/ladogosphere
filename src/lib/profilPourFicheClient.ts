/**
 * Créer une fiche client ne rétrograde jamais un membre du personnel.
 *
 * Relevé pendant APP 17 : créer une fiche depuis l'admin pour l'adresse d'un
 * compte existant posait `profiles.role = 'client'` sans regarder ce qu'il y
 * avait avant. Une employée ou l'administratrice qui recevait une fiche
 * perdait son rôle, donc l'accès à l'espace de travail, au premier
 * rafraîchissement — et rien à l'écran ne le disait.
 *
 * Le rôle ne se pose donc que sur un profil qui n'en a pas encore. Un rôle
 * `employe` ou `admin` déjà écrit ne bouge jamais, dans aucun sens : c'est le
 * profil qui fait autorité, pas la fiche. Et puisque la fiche appartient alors
 * à quelqu'un de la maison, elle naît interne, comme celle que le personnel se
 * crée depuis son espace.
 */

/** Rôles du personnel de la pension. Un tel profil n'est jamais rétrogradé. */
const ROLES_PERSONNEL = ["admin", "employe"];

export type DecisionProfilFiche = {
  /** Rôle à écrire sur le profil, ou null pour n'y pas toucher. */
  roleAPoser: "client" | null;
  /** La fiche naît-elle interne (chiens de la maison) ? */
  ficheInterne: boolean;
};

export function estPersonnel(role: string | null | undefined): boolean {
  return ROLES_PERSONNEL.includes((role ?? "").trim());
}

/**
 * Que faire du profil, et quelle sorte de fiche créer ?
 *
 * `roleExistant` est le rôle lu sur `profiles`, ou null/undefined si le compte
 * n'a pas encore de profil — ou s'il n'y a pas de compte du tout.
 */
export function decisionProfilPourFiche(
  roleExistant: string | null | undefined
): DecisionProfilFiche {
  if (estPersonnel(roleExistant)) {
    return { roleAPoser: null, ficheInterne: true };
  }
  return { roleAPoser: "client", ficheInterne: false };
}
