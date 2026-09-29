/**
 * La version texte d'un e-mail, tirée de son HTML.
 *
 * ── POURQUOI ELLE EXISTE ──────────────────────────────────────────────────
 *
 * Resend ne la fabrique pas. Vérifié dans le SDK installé (resend 6.12.4) :
 * `parseEmailToApiOptions` transmet `text: email.text` tel quel, et le type
 * `CreateEmailOptions` demande AU MOINS UN de `html`, `text`, `react` — pas
 * les trois. Un e-mail envoyé avec le seul `html` part donc sans partie texte.
 *
 * Ce qui manque alors n'est pas cosmétique : un message sans partie texte est
 * lu comme un signe de courrier indésirable par la plupart des filtres, et il
 * s'affiche vide dans les clients qui refusent le HTML. On le découvre le jour
 * où une cliente dit n'avoir rien reçu — et rien, côté application, ne l'aura
 * signalé.
 *
 * ── MODULE PUR, SANS DÉPENDANCE ───────────────────────────────────────────
 *
 * Aucune bibliothèque : le HTML à convertir est le nôtre, produit par
 * `emailTemplate`, pas du HTML arbitraire venu du dehors. Un analyseur complet
 * serait une dépendance de plus à tenir à jour pour un besoin que six
 * remplacements couvrent.
 *
 * L'ORDRE des étapes est la seule chose délicate, et il est délibéré :
 *
 *  1. `<style>` et `<head>` partent AVEC leur contenu — sinon les règles CSS
 *     se retrouveraient dans le texte du message ;
 *  2. les liens deviennent « libellé (url) » TANT QUE les balises existent
 *     encore, puisque c'est l'attribut `href` qui porte l'adresse ;
 *  3. les fins de bloc deviennent des retours à la ligne ;
 *  4. les balises restantes tombent ;
 *  5. les entités se décodent EN DERNIER. Décoder avant l'étape 4 ferait
 *     d'un « &lt;p&gt; » écrit dans le texte une vraie balise, qu'on
 *     supprimerait : le message perdrait un morceau sans rien dire.
 *     `&amp;` se décode après les autres, faute de quoi « &amp;nbsp; » —
 *     une esperluette suivie du mot — deviendrait une espace.
 */

/** Les entités que nos e-mails emploient. `&amp;` en dernier, voir plus haut. */
const ENTITES: [RegExp, string][] = [
  [/&nbsp;/g, " "],
  [/&quot;/g, '"'],
  [/&#39;/g, "'"],
  [/&apos;/g, "'"],
  [/&lt;/g, "<"],
  [/&gt;/g, ">"],
  [/&amp;/g, "&"],
];

export function texteDepuisHtml(html: string): string {
  let t = String(html ?? "");

  // 1. Ce qui n'est pas du message.
  t = t.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
  t = t.replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, "");
  t = t.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  t = t.replace(/<!--[\s\S]*?-->/g, "");

  // 2. Les liens, tant que l'attribut `href` est encore là.
  t = t.replace(
    /<a\b[^>]*href\s*=\s*"([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
    (_tout, url: string, libelle: string) => {
      const texte = libelle.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      const adresse = String(url).trim();
      if (adresse === "") return texte;

      /**
       * Un libellé qui DIT DÉJÀ l'adresse ne se répète pas. Le pied de page en
       * donne deux exemples, et tous deux commencent par un émoji :
       * « ✉️ ladogosphere@gmail.com » vers `mailto:ladogosphere@gmail.com`, et
       * « 🌐 ladogosphere.ch » vers `https://ladogosphere.ch`. Comparer les
       * chaînes telles quelles ne voyait pas la répétition, et le texte
       * affichait deux fois la même chose entre parenthèses.
       *
       * On compare donc le NOYAU du libellé — sans son émoji de tête — et l'on
       * garde l'adresse, qui reste cliquable là où le libellé seul ne le serait
       * pas. Un `mailto:` perd son préfixe : une adresse e-mail se reconnaît
       * sans qu'on la présente.
       */
      const noyau = texte.replace(/^[^\p{L}\p{N}]+/u, "");
      const lisible = adresse.replace(/^mailto:/i, "");
      if (texte === "" || (noyau !== "" && adresse.includes(noyau))) return lisible;
      return `${texte} (${lisible})`;
    },
  );

  // 3. Ce qui fait passer à la ligne.
  t = t.replace(/<br\s*\/?>/gi, "\n");
  t = t.replace(/<\/(p|div|tr|h[1-6]|li|table)\s*>/gi, "\n");

  // 4. Tout le reste des balises.
  t = t.replace(/<[^>]+>/g, "");

  // 5. Les entités, en dernier.
  for (const [motif, remplacement] of ENTITES) t = t.replace(motif, remplacement);

  // Mise au propre : chaque ligne débarrassée de ses espaces (l'indentation du
  // gabarit HTML n'a aucun sens en texte), et jamais deux lignes vides de suite.
  return t
    .split("\n")
    .map((ligne) => ligne.replace(/[ \t ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
