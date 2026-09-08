/**
 * La remise d'adhésion, catégorie par catégorie.
 *
 * Une seule règle en porte tout le poids : 0 % ou inactive, la catégorie est
 * EXCLUE — et un article exclu ne montre aucune mention de remise. Annoncer une
 * remise qui ne s'applique pas est pire que ne rien annoncer.
 *
 * Fonction pure : ni base, ni requête.
 */

export const POURCENTAGE_PAR_DEFAUT = 10;

export type LigneRemiseCategorie = {
  categorie: string;
  pourcentage: number;
  actif: boolean;
  /** Combien d'articles actifs porte cette catégorie. */
  nbArticles: number;
};

/** Le pourcentage effectif d'une catégorie. Inactive : zéro, donc exclue. */
export function pourcentageEffectif(
  ligne: { pourcentage: number | string | null | undefined; actif: boolean | null | undefined } | null | undefined
): number {
  if (!ligne || ligne.actif !== true) return 0;
  const p = Number(ligne.pourcentage);
  return Number.isFinite(p) && p > 0 ? p : 0;
}

export function categorieExclue(
  ligne: { pourcentage: number | string | null | undefined; actif: boolean | null | undefined } | null | undefined
): boolean {
  return pourcentageEffectif(ligne) === 0;
}

export function refusPourcentageRemise(brut: unknown): string | null {
  const texte = String(brut ?? "").replace(",", ".").trim();
  if (texte === "") return "Indiquez un pourcentage. Mettez 0 pour exclure la catégorie.";
  const n = Number(texte);
  if (!Number.isFinite(n)) return "Ce pourcentage n'est pas un nombre.";
  if (n < 0) return "Un pourcentage de remise ne peut pas être négatif.";
  if (n > 100) return "Un pourcentage de remise ne dépasse pas 100 %.";
  return null;
}

// ── Ce que les clients lisent aujourd'hui ─────────────────────────────────

/**
 * Les endroits où la remise membre est ANNONCÉE, hors de cet écran.
 *
 * Ils ne se modifient pas d'ici — deux d'entre eux vivent sur le site vitrine
 * et dans les conditions d'adhésion, qui sont des documents, pas des réglages.
 * On les rappelle pour que Sabrina sache exactement ce qu'il faudra corriger si
 * elle exclut une catégorie.
 */
export const TEXTES_PUBLICS_REMISE_MEMBRE: { ou: string; texte: string }[] = [
  {
    ou: "Boutique en ligne, en tête du catalogue et du panier",
    texte: "Membres : −10 % sur la boutique",
  },
  {
    ou: "Site vitrine, page Adhésion",
    texte: "10 % de remise sur toute la boutique",
  },
  {
    ou: "Conditions d'adhésion remises au client",
    texte: "L'adhésion donne droit à 10 % de remise sur les articles de la boutique.",
  },
];

/**
 * L'avertissement affiché quand des catégories sont exclues : les textes
 * ci-dessus promettent « toute la boutique », et ce n'est plus vrai.
 *
 * On ne les réécrit PAS automatiquement — un texte contractuel ne se corrige
 * pas par effet de bord — on dit lesquels ne collent plus.
 */
export function avertissementTextesASuivre(
  lignes: LigneRemiseCategorie[],
  libelleCategorie: (c: string) => string
): string | null {
  const exclues = lignes.filter(categorieExclue);
  if (exclues.length === 0) return null;

  const noms = exclues.map((l) => libelleCategorie(l.categorie)).join(", ");
  return (
    `La remise ne s'applique plus à ${exclues.length === 1 ? "la catégorie" : "ces catégories"} : ${noms}. ` +
    "Les textes ci-dessous promettent encore la boutique entière — il faudra les corriger à la main, " +
    "ici comme sur le site vitrine et dans les conditions d'adhésion. Cet écran ne les touche pas."
  );
}

/**
 * Ce qui ne bouge PAS quand on change un pourcentage. Écrit à l'écran, parce
 * que c'est la première question qu'on se pose en modifiant un prix.
 */
export const MENTION_SANS_EFFET_RETROACTIF =
  "Un changement s'applique à partir de son enregistrement. Aucune facture déjà émise ne " +
  "change, aucun panier déjà validé n'est recalculé : le prix se fige à la vente, et il y reste.";

/** Les pourcentages distincts en vigueur, pour résumer l'écran en une ligne. */
export function resumeRemises(lignes: LigneRemiseCategorie[]): string {
  const actives = lignes.filter((l) => !categorieExclue(l));
  if (actives.length === 0) return "Aucune catégorie ne donne droit à la remise membre.";

  const taux = [...new Set(actives.map((l) => pourcentageEffectif(l)))].sort((a, b) => a - b);
  const exclues = lignes.length - actives.length;
  const partie =
    taux.length === 1
      ? `${String(taux[0]).replace(".", ",")} % sur ${actives.length} catégorie${actives.length > 1 ? "s" : ""}`
      : `de ${String(taux[0]).replace(".", ",")} % à ${String(taux[taux.length - 1]).replace(".", ",")} % selon la catégorie`;

  return exclues === 0
    ? `Remise membre : ${partie}.`
    : `Remise membre : ${partie} — ${exclues} catégorie${exclues > 1 ? "s exclues" : " exclue"}.`;
}
