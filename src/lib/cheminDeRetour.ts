/**
 * Le chemin où l'on renvoie quelqu'un après une confirmation — et lui seul.
 *
 * `new URL(next, origin)` IGNORE la base dès que `next` est absolu : un lien
 * portant l'adresse de la pension pouvait déposer la visiteuse sur un site
 * tiers, après l'avoir authentifiée. C'est l'hameçonnage le plus commode qui
 * soit, puisqu'il emprunte une adresse en laquelle elle a confiance.
 *
 * Et `startsWith("/")` ne suffit pas : « //evil.com » commence par une barre,
 * et le navigateur le lit comme un protocole relatif. « /\evil.com » aussi.
 *
 * La seule règle qui tienne est donc : on RÉSOUT, et on ne garde le résultat
 * que si son origine est exactement la nôtre. Ce qui sort retombe sur la page
 * d'accueil — jamais sur ce que le paramètre demandait.
 */
export function cheminDeRetourSur(
  next: string | null | undefined,
  origin: string,
  defaut = "/",
): string {
  if (!next) return defaut;

  try {
    const cible = new URL(next, origin);
    // L'origine compare le schéma, l'hôte et le port : « http » au lieu de
    // « https », un sous-domaine, un port différent, et ce n'est plus chez nous.
    if (cible.origin !== new URL(origin).origin) return defaut;
    // On rend le chemin, jamais l'URL entière : rien d'absolu ne ressort d'ici.
    return `${cible.pathname}${cible.search}${cible.hash}`;
  } catch {
    // Une adresse illisible n'est pas une destination.
    return defaut;
  }
}
