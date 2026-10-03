import { cleTarif } from "@/src/lib/calculTarif";

export const JOURS_PAR_CARTE = 11;
export const JOURS_PAYES = 10;

export type TypeAbonnement = { categorie: string; label: string };

/**
 * Le prix d'une carte : le tarif du jour de sa catégorie, fois les journées
 * PAYÉES. Jamais écrit en dur — avec les tarifs 2026 : 350.–, 680.–, 700.–.
 * L'écran et la commande lisent la même fonction.
 */
export function prixCarte(tarifJournee: number | string): number {
  return Math.round(JOURS_PAYES * Number(tarifJournee) * 100) / 100;
}

/** « 10 journées payées, la 11e journée offerte ». */
export const MENTION_JOURNEE_OFFERTE =
  `${JOURS_PAYES} journées payées, la ${JOURS_PAR_CARTE}e journée offerte`;

/**
 * Les cartes EN VENTE, dans l'ordre où elles se proposent (décision de
 * Sabrina, 03.10.2026) : 10 journées payées, la 11e offerte.
 *
 * « 3 chiens ensemble » n'en fait plus partie. Ce n'est PAS la liste des cartes
 * que l'app sait nommer : une carte déjà vendue garde son libellé et se
 * consomme jusqu'au bout — voir `LIBELLES_CARTES`.
 */
export const CARTES_EN_VENTE: readonly TypeAbonnement[] = [
  { categorie: "journee_partage_1", label: "1 chien sociable" },
  { categorie: "journee_partage_2", label: "2 chiens ensemble" },
  { categorie: "journee_privatif", label: "1 chien seul" },
];

/**
 * Tout ce que l'app sait NOMMER : les cartes en vente, plus celles qui ne se
 * vendent plus mais existent encore chez des clients.
 *
 * « 1 chien seul » remplace « 1 chien box prive » (APP 72) sur les écrans et
 * sur la facture d'une NOUVELLE carte ; une facture déjà émise garde le texte
 * qu'elle porte, elle n'est jamais réécrite.
 */
export const LIBELLES_CARTES: Readonly<Record<string, string>> = {
  ...Object.fromEntries(CARTES_EN_VENTE.map((t) => [t.categorie, t.label])),
  journee_partage_3: "3 chiens ensemble",
};

export function labelAbonnement(categorie: string | null | undefined): string {
  return (categorie && LIBELLES_CARTES[categorie]) || (categorie ?? "Carte");
}

export function estEnVente(categorie: string | null | undefined): boolean {
  return CARTES_EN_VENTE.some((t) => t.categorie === categorie);
}

export type ChienSociabilite = { doit_etre_isole?: boolean | null; actif?: boolean | null };

/**
 * Les cartes qu'un client peut acheter, selon ses chiens actifs (règle de
 * Sabrina, 03.10.2026), dans l'ordre de `CARTES_EN_VENTE` :
 *
 *  - aucun chien « doit être isolé » : « 1 chien sociable » et « 1 chien
 *    seul » dès un chien (il peut vouloir le box pour lui), « 2 chiens
 *    ensemble » dès deux ;
 *  - au moins un chien « doit être isolé » : « 1 chien seul » seulement, et
 *    aussi « 2 chiens ensemble » s'il a au moins deux chiens — ses chiens
 *    peuvent partager le box en famille, au prix normal des deux chiens ;
 *  - jamais « 3 chiens ensemble ».
 *
 * La MÊME fonction décide à l'achat du client et à la confirmation de
 * l'équipe.
 */
export function cartesEligibles(chiens: ChienSociabilite[]): string[] {
  const actifs = chiens.filter((c) => c.actif !== false);
  const n = actifs.length;
  if (n === 0) return [];
  const unIsole = actifs.some((c) => c.doit_etre_isole === true);

  const permises = new Set<string>(["journee_privatif"]);
  if (n >= 2) permises.add("journee_partage_2");
  if (!unIsole) permises.add("journee_partage_1");
  return CARTES_EN_VENTE.map((t) => t.categorie).filter((c) => permises.has(c));
}

export const REFUS_TROIS_CHIENS =
  "La carte « 3 chiens ensemble » n'est plus proposée. Pour trois chiens, la journée se règle au tarif normal.";

/**
 * Pourquoi cette carte ne peut pas être vendue à ce client, ou `null`.
 *
 * Une seule phrase par cas, la même à l'achat du client et à la confirmation
 * par l'équipe : une carte qui ne se vend plus, puis une carte qui ne
 * correspond pas aux chiens.
 */
export function refusCarte(categorie: string, chiens: ChienSociabilite[]): string | null {
  if (!estEnVente(categorie)) {
    return categorie === "journee_partage_3" ? REFUS_TROIS_CHIENS : "Formule invalide.";
  }
  if (!cartesEligibles(chiens).includes(categorie)) {
    return "Cette formule ne correspond pas au profil de vos chiens.";
  }
  return null;
}

/**
 * La carte qui règle une journée de garderie : celle du TARIF réellement
 * appliqué (APP 72), calculé par la même règle que le prix (`cleTarif`, avec
 * le même nombre de chiens et le même « privatif »).
 *
 *  - box seul (privatif)        → « 1 chien seul » ;
 *  - partagé, 1 ou 2 chiens      → « 1 chien sociable » / « 2 chiens ensemble » ;
 *  - partagé, 3 chiens           → « 3 chiens ensemble » : la carte ne se vend
 *    plus, donc seule une ANCIENNE carte la règle ; sans elle, rien n'est
 *    débité et la journée se paie au tarif normal ;
 *  - partagé, plus de 3 chiens   → aucune carte (comme avant).
 *
 * L'urgence ne compte pas : une carte règle la journée elle-même, comme
 * avant ce lot.
 */
export function categorieCarteJournee(p: { nb_chiens: number; est_privatif: boolean }): string | null {
  if (p.nb_chiens < 1) return null;
  if (!p.est_privatif && p.nb_chiens > 3) return null;
  return cleTarif({
    type_reservation: "journee",
    nb_chiens: p.nb_chiens,
    est_urgence: false,
    est_privatif: p.est_privatif,
  });
}
