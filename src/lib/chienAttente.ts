/**
 * APP 73 — un chien « en attente de validation » : la même définition que la
 * tuile qui vivait sur l'accueil Clients (chien actif, journée d'essai
 * programmée ou seconde journée). Elle sert maintenant l'encadré et le filtre
 * en haut de /chiens.
 */
export const FILTRE_ATTENTE = "attente";

export function chienEnAttenteDeValidation(c: { actif?: boolean | null; statut_essai?: string | null }): boolean {
  return c.actif === true && (c.statut_essai === "programme" || c.statut_essai === "seconde_journee");
}
