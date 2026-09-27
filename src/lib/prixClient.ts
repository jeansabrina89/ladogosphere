/**
 * Comment un montant s'écrit POUR UNE CLIENTE — et il y a deux réponses.
 *
 * ── LA FRONTIÈRE, EN UNE PHRASE ───────────────────────────────────────────
 *
 * Un montant de SÉJOUR, de TARIF ou de BOUTIQUE s'écrit à la suisse :
 * « 35.– », « 1'250.50 ». Un montant calculé à partir des FACTURES ou des
 * AVOIRS — un payé, un reste à payer, un solde d'avoir — garde les deux
 * décimales et son « CHF » : « 226.50 CHF ».
 *
 * Ce n'est pas une question de goût. Une cliente compare un reste à payer au
 * bulletin de versement qu'elle a sous les yeux, et un solde d'avoir à la pièce
 * qui l'a créé. Deux écritures du même montant à cet instant-là font hésiter, et
 * une hésitation devant un virement coûte un appel ou un virement de travers.
 * Un prix de catalogue, lui, ne se compare à rien.
 *
 * ── POURQUOI CE MODULE EXISTE ─────────────────────────────────────────────
 *
 * `formatPrixClient` a vécu dans `venteEnLigneLogique` le temps de deux lots.
 * Elle sert désormais la boutique, l'espace client de la pension et les
 * e-mails : neuf écrans de PENSION importaient une fonction rangée dans la
 * « logique de vente en ligne », et personne cherchant le format d'un prix ne
 * serait allé l'y chercher. Le déplacement n'a rien changé à son comportement.
 *
 * Il n'y a AUCUN réexport depuis `venteEnLigneLogique` : un seul chemin
 * d'import, sinon les deux coexistent et le module quitté ne se vide jamais.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Un montant à la suisse, pour les écrans de VITRINE et de SÉJOUR.
 *
 *   35      → « 35.– »        (le tiret demi-cadratin, U+2013)
 *   12.50   → « 12.50 »       (avec centimes, toujours deux décimales)
 *   1250    → « 1'250.– »     (l'apostrophe des milliers)
 *   −9.50   → « −9.50 »       (le signe moins, U+2212, pas le trait d'union)
 *
 * PAS DE « CHF ». La page entière est en francs ; le répéter à chaque ligne
 * ajoute du bruit sans lever aucune ambiguïté. Une seule mention « Prix TTC »
 * sous le total du panier suffit à dire ce qu'on lit.
 *
 * LES PIÈCES COMPTABLES N'Y TOUCHENT PAS, et c'est délibéré : une facture, un
 * avoir, un ticket, le journal comptable et la caisse gardent leurs deux
 * décimales. « 35.– » est une écriture de vitrine ; une pièce comptable
 * s'écrit « 35.00 », parce qu'elle se relit, s'additionne et se contrôle.
 *
 * L'ARRONDI D'ABORD. `0.1 + 0.2` vaut 0.30000000000000004 en flottant : sans
 * `r2`, le test « est-ce un entier ? » tomberait juste par chance et la
 * troncature du nombre entier se ferait sur une valeur fausse. On arrondit
 * donc au centime AVANT de décider de la forme.
 */
export function formatPrixClient(montant: number): string {
  const n = r2(Number(montant) || 0);
  // `Math.abs` avant tout : le signe est écrit à part, sinon « -0.00 »
  // apparaîtrait pour un montant nul venu d'une soustraction.
  const absolu = Math.abs(n);
  const signe = n < 0 ? "−" : "";
  // Les milliers, groupés par l'apostrophe suisse. La coupure se pose devant
  // chaque groupe de trois chiffres qui n'est pas en début de nombre.
  const entier = String(Math.trunc(absolu)).replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  if (Number.isInteger(absolu)) return `${signe}${entier}.–`;
  const centimes = absolu.toFixed(2).split(".")[1];
  return `${signe}${entier}.${centimes}`;
}

/**
 * Un montant de PIÈCE, pour ce qui se compare à une facture ou à un avoir.
 *
 *   226.50  → « 226.50 CHF »
 *   200     → « 200.00 CHF »   (jamais « 200.– » : c'est le cas qui distingue
 *                               les deux formats à coup sûr)
 *   −12.05  → « -12.05 CHF »
 *
 * C'est l'écriture de `app/(client)/mon-compte/factures`, reprise à l'identique
 * plutôt que réinventée : `toFixed(2)` suivi de « CHF ». Le `Number(n) || 0`
 * accepte les chaînes que Postgres renvoie pour un `numeric`, et retombe sur
 * zéro pour une valeur illisible — comme la page des factures le fait déjà.
 *
 * PAS DE SÉPARATEUR DE MILLIERS, et c'est voulu : la page des factures n'en
 * met pas, et cette fonction doit rendre exactement ce qu'elle rend. Un test
 * compare les deux caractère par caractère.
 */
export function formatPrixFacture(montant: number | string | null | undefined): string {
  return `${(Number(montant) || 0).toFixed(2)} CHF`;
}
