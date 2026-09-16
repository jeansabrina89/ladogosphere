/**
 * Le coût d'achat d'un article : ce qu'une unité a coûté à l'entrée, et ce
 * que coûtent en moyenne les unités en stock.
 *
 * Le coût moyen est tenu EN BASE, par le trigger qui tient déjà le stock
 * (`public.cout_moyen_apres_entree`, migration 20260916190138). La formule est
 * écrite ici aussi, à l'identique, pour être testée cas par cas et pour que
 * l'écran puisse annoncer le coût moyen qui résultera d'une entrée.
 *
 * Aucune écriture comptable n'en dépend : le coût figé à la vente sert aux
 * statistiques de marge, pas au journal.
 *
 * Module pur.
 */

const r4 = (n: number) => Math.round((n + Number.EPSILON) * 10_000) / 10_000;

/**
 * Coût moyen pondéré après une entrée :
 *   (stock avant × coût moyen avant + quantité × coût unitaire) / (stock avant + quantité)
 *
 * - Une entrée sans coût, ou sans quantité, ne change rien.
 * - Un stock avant négatif compte pour zéro (des unités qu'on doit ne se valorisent pas).
 * - Un coût moyen encore inconnu, ou un stock vide, prend le coût de l'entrée.
 * - Une sortie n'appelle jamais cette fonction : elle ne change pas le coût moyen.
 */
export function coutMoyenApresEntree(
  stockAvant: number,
  coutMoyenAvant: number | null,
  quantite: number,
  coutUnitaire: number | null,
): number | null {
  if (coutUnitaire === null || !Number.isFinite(coutUnitaire) || !(quantite > 0)) return coutMoyenAvant;
  const stock = Math.max(Number(stockAvant) || 0, 0);
  if (coutMoyenAvant === null || stock === 0) return r4(coutUnitaire);
  return r4((stock * coutMoyenAvant + quantite * coutUnitaire) / (stock + quantite));
}

/**
 * Le coût unitaire à PROPOSER pour une entrée de marchandise, modifiable avant
 * validation :
 * - depuis la dépense liée, si elle ne porte qu'un article : montant HT / quantité ;
 * - sinon depuis le dernier prix d'achat connu de l'article ;
 * - sinon rien — la saisie reste libre, et une entrée sans coût est acceptée.
 */
export function coutUnitairePropose(entree: {
  /** Montant HT de la dépense liée (le montant, tant que la TVA n'est pas suivie). */
  montantDepenseHt?: number | null;
  /** Nombre d'articles distincts entrés sur cette dépense. */
  nbArticlesDepense?: number;
  quantite: number | null;
  prixAchat: number | null;
}): number | null {
  const q = Number(entree.quantite);
  const montant = entree.montantDepenseHt;
  if (montant !== null && montant !== undefined && Number.isFinite(montant) && montant > 0
      && entree.nbArticlesDepense === 1 && Number.isFinite(q) && q > 0) {
    return r4(montant / q);
  }
  const pa = entree.prixAchat;
  return pa !== null && pa !== undefined && Number.isFinite(Number(pa)) ? r4(Number(pa)) : null;
}

/** Lit un coût saisi : vide = non renseigné, négatif ou illisible = refusé. */
export function lireCoutSaisi(brut: unknown): { cout: number | null; refus?: string } {
  const texte = String(brut ?? "").replace(",", ".").replace(/[’'\s]/g, "").trim();
  if (texte === "") return { cout: null };
  const n = Number(texte);
  if (!Number.isFinite(n) || n < 0) return { cout: null, refus: "Le coût unitaire doit être un montant positif." };
  return { cout: r4(n) };
}

/** Affichage d'un coût unitaire : deux décimales, quatre si nécessaire. */
export function formatCoutUnitaire(cout: number | string | null | undefined): string {
  if (cout === null || cout === undefined || cout === "") return "coût non renseigné";
  const n = Number(cout);
  const deux = Math.round(n * 100) / 100;
  return Math.abs(deux - n) < 0.00005 ? `${deux.toFixed(2)} CHF` : `${r4(n).toFixed(4)} CHF`;
}

export type ChoixAvecFourniture = {
  composant_article_id: string | null;
  composant_quantite: number | string | null;
};

/**
 * Le coût des matières d'une pièce fabriquée sur mesure : la somme, sur ses
 * fournitures, de la quantité consommée × leur coût moyen.
 *
 * Null — « coût non renseigné » — si la pièce ne consomme aucune fourniture
 * connue, ou si l'une d'elles n'a pas de coût moyen. Jamais un coût partiel
 * présenté comme complet : une marge calculée sur la moitié des matières
 * mentirait.
 */
export function coutMatieres(
  choix: ChoixAvecFourniture[],
  coutsMoyens: Map<string, number | null>,
): number | null {
  const fournitures = choix.filter((c) => c.composant_article_id && Number(c.composant_quantite) > 0);
  if (fournitures.length === 0) return null;
  let total = 0;
  for (const f of fournitures) {
    const cout = coutsMoyens.get(f.composant_article_id!);
    if (cout === null || cout === undefined || !Number.isFinite(Number(cout))) return null;
    total += Number(f.composant_quantite) * Number(cout);
  }
  return r4(total);
}
