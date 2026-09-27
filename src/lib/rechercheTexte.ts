/**
 * Ce qu'on a le droit de mettre dans un filtre PostgREST (C-11).
 *
 * ── LE DÉFAUT QU'ON FERME ─────────────────────────────────────────────────
 *
 * Trois recherches de l'application assemblaient la saisie de l'utilisateur
 * directement dans un `.or()` :
 *
 *   .or(`prenom.ilike.%${q}%,nom.ilike.%${q}%,email.ilike.%${q}%`)
 *
 * Une VIRGULE dans `q` sépare les conditions. Taper `a,nom.eq.Dupont` ne cherche
 * plus « a » : cela ajoute une condition `nom.eq.Dupont` que personne n'a
 * demandée. Des parenthèses permettent de grouper (`and(...)`, `in.(...)`), donc
 * de construire un filtre entier.
 *
 * ── CE QUE CE N'EST PAS ───────────────────────────────────────────────────
 *
 * Ce n'est PAS une injection SQL : PostgREST transmet la valeur comme paramètre,
 * et aucun SQL ne se fabrique ici. C'est une injection de FILTRE — on choisit
 * quelles lignes remontent, pas ce que la base exécute. D'où l'impact mesuré au
 * lot 21 : « personnel seulement », les trois recherches étant derrière une
 * garde de permission, et `clients` étant de toute façon lisible par le
 * personnel.
 *
 * Cela reste à fermer : un filtre qu'on n'a pas écrit est un filtre qu'on ne
 * contrôle pas, et la garde d'aujourd'hui n'est pas celle de demain.
 *
 * ── POURQUOI UNE FONCTION PARTAGÉE, ET NON UNE FONCTION SQL ───────────────
 *
 * Le brief laissait le choix. Retenu : une fonction TypeScript partagée.
 *
 *   * le danger est dans l'ASSEMBLAGE de la chaîne de filtre, pas en base. Le
 *     neutraliser là où la chaîne se fabrique, c'est le neutraliser à sa source ;
 *   * les trois recherches font exactement la même chose — `ilike` sur prénom,
 *     nom et e-mail. Une fonction SQL paramétrée demanderait une migration, un
 *     droit d'exécution, et rendrait le même service ;
 *   * elle se teste sans base, donc à chaque exécution de la suite. Une fonction
 *     SQL ne se serait éprouvée qu'en base, c'est-à-dire rarement.
 */

/**
 * Les caractères retirés d'une saisie avant de l'assembler dans un filtre.
 *
 * ── CE QUI PART, ET POURQUOI ──────────────────────────────────────────────
 *
 *   `,`   sépare les conditions d'un `.or()` — le vecteur principal ;
 *   `(` `)` groupent (`and(...)`, `or(...)`, `in.(...)`) ;
 *   `%` `*` sont les jokers de `ilike`. Les laisser n'injecte rien, mais élargit
 *         la recherche à l'insu de qui tape : « %% » ramènerait tout le fichier
 *         clients dans une liste faite pour huit lignes ;
 *   `"`   PostgREST cite une valeur avec des guillemets doubles, ce qui change
 *         la façon dont elle est lue ;
 *   `\`   échappe dans un motif `like`, donc modifie le sens du caractère suivant.
 *
 * ── CE QUI RESTE, ET C'EST DÉLIBÉRÉ : LE POINT ────────────────────────────
 *
 * Le brief citait le point parmi les caractères à neutraliser. Il ne l'est pas,
 * pour une raison qui se vérifie : le point ne sépare que le NOM DE COLONNE de
 * l'opérateur et de la valeur — `prenom.ilike.<valeur>`. Une fois passé le second
 * point, tout appartient à la valeur jusqu'à la virgule suivante. Un point DANS
 * la valeur ne peut donc rien ouvrir.
 *
 * Et le retirer coûterait cher : personne ne pourrait plus chercher une cliente
 * par son adresse, « jean.dupont@example.ch » devenant « jean dupont@example ch ».
 * C'est justement l'une des trois colonnes que ces recherches interrogent.
 *
 * L'apostrophe reste aussi : « d'Andrès » se cherche tel qu'il s'écrit. Elle
 * n'est dangereuse qu'en SQL assemblé à la main, ce qui n'arrive pas ici.
 */
const INTERDITS = /[,()%*"\\]/g;

/**
 * Une saisie prête à entrer dans un filtre PostgREST.
 *
 * Les caractères retirés deviennent une ESPACE, et non rien : « Müller,Anna »
 * cherche alors « Müller Anna », ce qui est probablement ce qu'on voulait —
 * tandis que « MüllerAnna » ne trouverait personne. Les espaces sont ensuite
 * resserrés, et les bords coupés.
 */
export function saisieRecherchable(brut: string | null | undefined): string {
  return String(brut ?? "")
    .replace(INTERDITS, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Le filtre `.or()` d'une recherche de personne, sur trois colonnes.
 *
 * Un seul endroit le fabrique : les trois recherches de l'application
 * l'appelaient chacune de leur côté, avec trois neutralisations différentes —
 * l'une en retirait quatre caractères, les deux autres aucun. Une règle écrite
 * trois fois est une règle qui finit par différer trois fois.
 *
 * Rend `null` quand il ne reste rien de cherchable : l'appelant doit alors ne
 * PAS interroger la base. Un motif vide donnerait `%%`, donc tout le fichier.
 */
export function filtreRecherchePersonne(
  brut: string | null | undefined,
  colonnes: readonly string[] = ["prenom", "nom", "email"],
  longueurMinimale = 2,
): string | null {
  const propre = saisieRecherchable(brut);
  if (propre.length < longueurMinimale) return null;
  const motif = `%${propre}%`;
  return colonnes.map((c) => `${c}.ilike.${motif}`).join(",");
}
