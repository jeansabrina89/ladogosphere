/**
 * Où retourner après s'être connecté.
 *
 * Un visiteur qui remplit son panier puis clique « Valider ma commande » doit
 * revenir à son panier, pas atterrir sur un tableau de bord où il devrait le
 * retrouver tout seul. C'est le paramètre `suite` qui porte cette mémoire.
 *
 * Une adresse DU SITE, et rien d'autre : « // » ou « http » ouvrirait la porte
 * à une redirection vers l'extérieur, juste après la saisie d'un mot de passe.
 * On ne garde que ce qui commence par une seule barre oblique.
 *
 * Fonction pure : elle prend la chaîne de recherche, elle rend un chemin.
 */
export function adresseDeRetour(recherche: string | null | undefined): string | null {
  if (!recherche) return null;

  let voulue: string | null;
  try {
    voulue = new URLSearchParams(recherche).get("suite");
  } catch {
    return null;
  }
  if (!voulue) return null;

  const propre = voulue.trim();
  if (!propre.startsWith("/")) return null;
  // « // » et « /\ » sont lus comme un autre site par les navigateurs.
  if (propre.startsWith("//") || propre.startsWith("/\\")) return null;
  return propre;
}
