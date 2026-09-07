/**
 * État renvoyé par une Server Action de formulaire.
 *
 * En production, Next masque le message d'une exception de Server Action :
 * lever une erreur, c'est afficher une page générique. Les actions renvoient
 * donc leur refus, et le formulaire l'affiche (modèle du check-out).
 *
 * `valeurs` porte ce qui avait été saisi : après un refus, rien n'est perdu.
 */
export type EtatFormulaire = {
  erreur?: string | null;
  /** Nom du champ fautif, quand il est identifiable. */
  champ?: string | null;
  /** Saisie renvoyée telle quelle, pour repeupler le formulaire. */
  valeurs?: Record<string, string> | null;
};

export const ETAT_FORMULAIRE_VIDE: EtatFormulaire = { erreur: null };

/**
 * Copie des champs texte d'un FormData. Les fichiers sont ignorés : ils ne se
 * repeuplent pas, le navigateur ne l'autorise pas.
 *
 * Une case à cocher absente n'apparaît pas dans FormData ; à la relecture,
 * `valeurs[nom] === "on"` suffit donc à savoir si elle était cochée.
 */
export function valeursFormulaire(formData: FormData): Record<string, string> {
  const valeurs: Record<string, string> = {};
  for (const [cle, valeur] of formData.entries()) {
    if (typeof valeur === "string") valeurs[cle] = valeur;
  }
  return valeurs;
}

/** Valeur à réafficher : la saisie refusée si elle existe, sinon l'existant. */
export function valeurChamp(
  valeurs: Record<string, string> | null | undefined,
  nom: string,
  defaut: string | number | null | undefined = ""
): string {
  const saisie = valeurs?.[nom];
  if (saisie !== undefined) return saisie;
  return defaut === null || defaut === undefined ? "" : String(defaut);
}

/** Case à cocher : la saisie refusée prime, y compris quand elle vaut « décochée ». */
export function caseCochee(
  valeurs: Record<string, string> | null | undefined,
  nom: string,
  defaut: boolean
): boolean {
  if (!valeurs) return defaut;
  return valeurs[nom] === "on";
}
