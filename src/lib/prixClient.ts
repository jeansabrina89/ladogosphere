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
 * Un montant de PIÈCE : facture, avoir, ticket, e-mail de paiement, écran qui
 * renvoie à l'une de ces trois choses.
 *
 *   226.50    → « 226.50 CHF »
 *   200       → « 200.00 CHF »   (jamais « 200.– » : c'est le cas qui distingue
 *                                 les deux formats à coup sûr)
 *   1250.50   → « 1'250.50 CHF » (l'apostrophe DROITE, U+0027)
 *   −12.05    → « -12.05 CHF »   (le TRAIT D'UNION, voir plus bas)
 *
 * LE TRAIT D'UNION N'EST PAS UN CHOIX DE GOÛT. Les PDF sont composés en
 * Helvetica avec `/WinAnsiEncoding`, et le signe moins typographique U+2212 est
 * ABSENT de WinAnsi : il ne lève aucune erreur, il ne s'imprime simplement pas
 * (voir `src/lib/texteWinAnsi.ts`). Un avoir de −12.05 se serait imprimé
 * « 12.05 CHF » sur la pièce, c'est-à-dire l'inverse de ce qu'il dit. Le trait
 * d'union, lui, existe dans WinAnsi.
 *
 * L'APOSTROPHE EST DROITE (U+0027) POUR LA MÊME RAISON : l'apostrophe courbe
 * U+2019 n'est pas dans WinAnsi non plus. Un test vérifie que la sortie de cette
 * fonction traverse `pourPdf` SANS CHANGER — c'est la garantie qu'un montant
 * s'imprime tel qu'il s'affiche.
 *
 * Le `Number(n) || 0` accepte les chaînes que Postgres renvoie pour un
 * `numeric`, et retombe sur zéro pour une valeur illisible.
 *
 * CE QUI NE PASSE PAS PAR ICI, et pour des raisons de norme, pas de style :
 *
 *   • la charge utile du bulletin QR — la norme SIX impose « 1250.50 », sans
 *     séparateur de milliers. C'est `swissqrbill` qui l'écrit, et on ne lui
 *     passe qu'un NOMBRE ;
 *   • la zone « Montant » imprimée du bulletin — la même bibliothèque, qui
 *     applique la règle des Swiss Implementation Guidelines : espace comme
 *     séparateur de milliers, « 1 250.50 » ;
 *   • les exports CSV — une apostrophe devant un nombre en fait du texte dans
 *     un tableur, et la colonne ne s'additionne plus.
 */
export function formatPrixFacture(montant: number | string | null | undefined): string {
  // ARRONDI AU CENTIME D'ABORD : sans lui, -0.001 donnerait le signe de son
  // nombre et la valeur absolue arrondie, donc « -0.00 CHF » — un montant nul
  // qui a l'air d'un avoir.
  const n = Math.round((Number(montant) || 0) * 100) / 100;
  // `Math.abs` d'abord : le signe s'écrit à part, sinon « -0.00 CHF »
  // apparaîtrait pour un zéro venu d'une soustraction.
  const [entier, centimes] = Math.abs(n).toFixed(2).split(".");
  const groupe = entier.replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  return `${n < 0 ? "-" : ""}${groupe}.${centimes} CHF`;
}
