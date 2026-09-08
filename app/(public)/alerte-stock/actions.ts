"use server";

import { alerteParToken, annulerAlerte } from "@/src/lib/alertesStock";

/**
 * Désinscription d'UNE alerte, par jeton, sans connexion.
 *
 * Le jeton n'ouvre que cette alerte-là. Il ne touche jamais
 * `clients.emails_info_ok` : quelqu'un qui se retire d'une attente reste
 * abonné au reste, et réciproquement.
 */

export type EtatDesinscription =
  | { etat: "inconnu" }
  | { etat: "trouvee"; article: string }
  | { etat: "retiree"; article: string };

export async function lireAlerte(token?: string): Promise<EtatDesinscription> {
  const trouvee = await alerteParToken(token);
  if (!trouvee) return { etat: "inconnu" };
  return { etat: "trouvee", article: trouvee.article.nom };
}

/**
 * Le lien de l'e-mail n'agit pas de lui-même : il ouvre la page, et un second
 * clic confirme. C'est ce qui évite qu'un antivirus ou un aperçu de lien
 * désinscrive quelqu'un à son insu.
 */
export async function seRetirer(token: string): Promise<EtatDesinscription> {
  const trouvee = await alerteParToken(token);
  if (!trouvee) return { etat: "inconnu" };

  const res = await annulerAlerte({ token });
  if (res.error || !res.annulee) return { etat: "trouvee", article: trouvee.article.nom };

  return { etat: "retiree", article: trouvee.article.nom };
}
