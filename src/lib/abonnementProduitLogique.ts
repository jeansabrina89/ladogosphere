/**
 * Le produit d'une carte prépayée, reconnu à mesure qu'elle se consomme.
 *
 * Une carte payée d'avance n'est PAS un produit du jour où elle est payée :
 * c'est un produit perçu d'avance, en 2031. La prestation n'est due qu'au fur
 * et à mesure des journées, et c'est à ce moment-là qu'elle devient un produit.
 *
 * Fonction pure, sans base : c'est ici que vivent les décisions, et c'est ce
 * fichier que les tests couvrent.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;

const entier = (v: unknown): number => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : 0;
};

// ── Les comptes ────────────────────────────────────────────────────────────

/** Produit perçu d'avance : la carte payée, pas encore consommée. */
export const COMPTE_ABONNEMENTS_PREPAYES = "2031";
export const COMPTE_SEJOURS = "3000";
export const COMPTE_GARDERIE = "3001";

/**
 * Le compte de produit d'une journée consommée.
 *
 * Il suit la NATURE de la prestation réglée, pas son mode de paiement : une
 * journée de garderie va en 3001 qu'elle soit payée en espèces ou avec une
 * carte. C'est la même règle que sur une facture ordinaire.
 */
export function compteProduitReservation(typeReservation: string | null | undefined): string {
  return String(typeReservation ?? "").trim() === "sejour" ? COMPTE_SEJOURS : COMPTE_GARDERIE;
}

/**
 * Le compte des jours qui expirent, quand aucune réservation ne les porte.
 *
 * Ils suivent le type que la carte COUVRE. Les cartes d'aujourd'hui ne
 * couvrent que des journées (`journee_*`) : tout va donc en garderie. Le jour
 * où une carte couvrirait plusieurs types, ce choix ne tiendrait plus — il
 * faudrait alors décider, pas deviner.
 */
export function compteProduitCategorie(categorie: string | null | undefined): string {
  const c = String(categorie ?? "").trim();
  if (c.startsWith("sejour")) return COMPTE_SEJOURS;
  return COMPTE_GARDERIE;
}

/** Vrai si la carte couvre plusieurs natures de prestation — le cas à signaler. */
export function categorieAmbigue(categorie: string | null | undefined): boolean {
  const c = String(categorie ?? "").trim();
  return c !== "" && !c.startsWith("journee") && !c.startsWith("sejour");
}

// ── Le tarif unitaire ──────────────────────────────────────────────────────

export type CarteAbonnement = {
  prix_paye: number | string;
  jours_total: number | string;
  jours_offerts: number | string;
};

/** Les journées réellement payées : le total moins celles qui sont offertes. */
export function joursPayes(carte: CarteAbonnement): number {
  return Math.max(entier(carte.jours_total) - entier(carte.jours_offerts), 0);
}

/**
 * Le tarif unitaire d'une journée de carte.
 *
 * Le prix payé se divise par les journées PAYÉES, jamais par le total : une
 * journée offerte ne porte aucun produit, et la faire entrer au dénominateur
 * diluerait la valeur de toutes les autres. Sur une carte de 11 jours dont 1
 * offert, payée 400 francs, la journée vaut 40,00 — pas 36,36.
 */
export function tarifUnitaire(carte: CarteAbonnement): number {
  const payes = joursPayes(carte);
  if (payes <= 0) return 0;
  return r2(Number(carte.prix_paye) / payes);
}

/**
 * Ce que vaut la n-ième journée consommée.
 *
 * Les journées payées viennent en premier ; les offertes ferment la marche et
 * ne valent rien. Une carte 10 + 1 transfère donc 10 × 40 = 400 en tout, puis
 * plus rien : le solde de 2031 ne peut pas devenir négatif.
 */
export function partDuJour(carte: CarteAbonnement, rang: number): number {
  const r = entier(rang);
  if (r <= 0 || r > joursPayes(carte)) return 0;
  return tarifUnitaire(carte);
}

/**
 * La valeur des journées qui restent à consommer — donc ce que 2031 doit
 * encore porter pour cette carte.
 *
 * C'est L'ASSERTION du système : à tout instant, le solde de 2031 vaut la
 * somme de ces valeurs sur toutes les cartes vivantes. Les journées offertes
 * n'y comptent pas, puisqu'elles ne valent rien.
 *
 * Le dernier centime revient à la dernière journée payée : la somme des parts
 * transférées vaut exactement le prix payé, sans reste.
 */
export function valeurRestante(carte: CarteAbonnement, joursConsommes: number): number {
  const payes = joursPayes(carte);
  const consommes = Math.min(Math.max(entier(joursConsommes), 0), payes);
  return r2(Number(carte.prix_paye) - valeurConsommee(carte, consommes));
}

/** La valeur déjà reconnue en produit après n journées consommées. */
export function valeurConsommee(carte: CarteAbonnement, joursConsommes: number): number {
  const payes = joursPayes(carte);
  const n = Math.min(Math.max(entier(joursConsommes), 0), payes);
  if (n <= 0) return 0;
  // Toutes les journées sauf la dernière prennent le tarif ; la dernière prend
  // le solde, pour que la somme retombe au centime sur le prix payé.
  if (n >= payes) return r2(Number(carte.prix_paye));
  return r2(tarifUnitaire(carte) * n);
}

/**
 * La part de la n-ième journée, arrondi compris.
 *
 * La dernière journée payée absorbe l'écart d'arrondi : sans cela, un prix qui
 * ne se divise pas rond laisserait quelques centimes coincés en 2031 pour
 * toujours.
 */
export function partExacteDuJour(carte: CarteAbonnement, rang: number): number {
  const r = entier(rang);
  if (r <= 0 || r > joursPayes(carte)) return 0;
  return r2(valeurConsommee(carte, r) - valeurConsommee(carte, r - 1));
}

// ── Les écritures ──────────────────────────────────────────────────────────

export type LigneEcriture = { compte: string; debit: number; credit: number };

/**
 * Le transfert d'une journée : la dette envers le client diminue, le produit
 * de la pension apparaît. Rien à passer pour une journée offerte.
 */
export function lignesJourConsomme(part: number, compteProduit: string): LigneEcriture[] {
  const m = r2(part);
  if (m === 0) return [];
  if (m > 0) {
    return [
      { compte: COMPTE_ABONNEMENTS_PREPAYES, debit: m, credit: 0 },
      { compte: compteProduit, debit: 0, credit: m },
    ];
  }
  // Une journée recréditée rend son produit : le transfert s'inverse.
  return [
    { compte: compteProduit, debit: -m, credit: 0 },
    { compte: COMPTE_ABONNEMENTS_PREPAYES, debit: 0, credit: -m },
  ];
}

/**
 * L'expiration : ce qui reste en 2031 devient un produit.
 *
 * Le client a payé, il n'a pas utilisé, la prestation n'est plus due. Aucun
 * remboursement automatique — s'il y en a un, il passe par un avoir décidé à
 * la main.
 */
export function lignesExpiration(valeur: number, compteProduit: string): LigneEcriture[] {
  return lignesJourConsomme(valeur, compteProduit);
}

// ── Le libellé de la ligne de facture ──────────────────────────────────────

/**
 * « Abonnement 10 jours + 1 offert » — ce que le client lit sur sa facture.
 * Le nombre de jours offerts n'apparaît que s'il y en a.
 */
export function libelleLigneAbonnement(
  carte: CarteAbonnement & { categorie?: string | null },
  libelleCategorie?: string | null
): string {
  const payes = joursPayes(carte);
  const offerts = entier(carte.jours_offerts);
  const jours = `${payes} jour${payes > 1 ? "s" : ""}`;
  const cadeau = offerts > 0 ? ` + ${offerts} offert${offerts > 1 ? "s" : ""}` : "";
  const quoi = String(libelleCategorie ?? "").trim();
  return `Abonnement ${jours}${cadeau}${quoi ? ` — ${quoi}` : ""}`;
}

// ── Le déroulé des mouvements ──────────────────────────────────────────────

export type MouvementCarte = {
  id: string;
  type: string;
  delta: number | string;
  reservation_id?: string | null;
};

export type TransfertAPasser = {
  /** Le mouvement qui déclenche ce transfert : c'est lui qui rend l'opération idempotente. */
  mouvementId: string;
  /** Positif à la consommation, négatif au recrédit. */
  part: number;
  rang: number;
  reservationId: string | null;
};

/**
 * Le déroulé des journées, mouvement par mouvement.
 *
 * On avance dans l'ordre : chaque consommation prend le rang suivant, chaque
 * recrédit rend le rang qu'il occupait. Le rang décide de la part — les
 * journées payées d'abord, les offertes ensuite — et le mouvement décide de
 * l'idempotence : une écriture existe pour lui, ou elle n'existe pas.
 */
export function transfertsDeLaCarte(
  carte: CarteAbonnement,
  mouvements: MouvementCarte[]
): TransfertAPasser[] {
  const transferts: TransfertAPasser[] = [];
  let consommes = 0;

  for (const m of mouvements) {
    if (m.type === "consommation") {
      const rang = consommes + 1;
      consommes = rang;
      transferts.push({
        mouvementId: m.id,
        part: partExacteDuJour(carte, rang),
        rang,
        reservationId: m.reservation_id ?? null,
      });
    } else if (m.type === "recredit") {
      const rang = consommes;
      if (rang > 0) consommes = rang - 1;
      transferts.push({
        mouvementId: m.id,
        part: -partExacteDuJour(carte, rang),
        rang,
        reservationId: m.reservation_id ?? null,
      });
    }
    // 'achat', 'ajustement' et 'expiration' ne transfèrent rien ici :
    // l'achat est porté par la facture, l'expiration a son écriture à elle.
  }

  return transferts;
}

/** Les journées consommées nettes, d'après les mouvements. */
export function joursConsommes(mouvements: MouvementCarte[]): number {
  let n = 0;
  for (const m of mouvements) {
    if (m.type === "consommation") n += 1;
    else if (m.type === "recredit") n = Math.max(n - 1, 0);
  }
  return n;
}
