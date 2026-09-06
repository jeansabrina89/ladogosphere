/**
 * Cohabitation du chien en box, déclarée par le propriétaire.
 *
 * Trois modes, et un seul à la fois :
 *  - "partage" : le chien peut partager son box avec d'autres chiens ;
 *  - "famille" : seulement avec les autres chiens du même foyer
 *                (entente `famille_uniquement`) ;
 *  - "seul"    : box pour lui seul (`chiens.doit_etre_isole`).
 *
 * La décision de la PENSION prime : quand `cohabitation_source = 'pension'`
 * (ou qu'une restriction existait avant que le client puisse en poser une),
 * le choix est verrouillé côté client.
 */

export const CHOIX_COHABITATION = ["partage", "famille", "seul"] as const;
export type ChoixCohabitation = (typeof CHOIX_COHABITATION)[number];

/** Libellés exacts affichés au client. */
export const LIBELLES_COHABITATION: Record<ChoixCohabitation, string> = {
  partage: "Peut partager son box avec d'autres chiens",
  famille: "Seulement avec mes autres chiens",
  seul: "Doit être seul dans son box",
};

export const MENTION_DECIDE_PAR_PENSION = "Décidé par la pension";

export function estChoixCohabitation(v: unknown): v is ChoixCohabitation {
  return typeof v === "string" && (CHOIX_COHABITATION as readonly string[]).includes(v);
}

export type ChienCohabitation = {
  id?: string;
  nom?: string | null;
  client_id?: string | null;
  categorie_poids?: string | null;
  doit_etre_isole?: boolean | null;
  hebergement_autorise?: string | null;
  cohabitation_source?: string | null;
  /** Le chien porte-t-il une entente `famille_uniquement` ? */
  famille_uniquement?: boolean | null;
};

/** Mode de cohabitation actuel du chien. */
export function choixCohabitationDe(chien: ChienCohabitation | null | undefined): ChoixCohabitation {
  if (!chien) return "partage";
  if (chien.doit_etre_isole || chien.hebergement_autorise === "privatif_obligatoire") return "seul";
  if (chien.famille_uniquement) return "famille";
  return "partage";
}

/**
 * Le choix est-il verrouillé pour le client ?
 *
 * Oui dès que la pension a tranché : `privatif_obligatoire` (que seule la
 * pension pose), ou une restriction dont la source n'est pas 'client' — une
 * restriction sans source vient forcément de la pension, le client n'ayant
 * jamais eu la main jusqu'ici.
 */
export function cohabitationVerrouillee(chien: ChienCohabitation | null | undefined): boolean {
  if (!chien) return false;
  if (chien.hebergement_autorise === "privatif_obligatoire") return true;
  if (chien.cohabitation_source === "pension") return true;
  const restreint = !!chien.doit_etre_isole || !!chien.famille_uniquement;
  return restreint && chien.cohabitation_source !== "client";
}

/**
 * Un chien « famille uniquement » réservé SANS autre chien du même foyer
 * occupe de fait le box entier : on le traite comme « seul ».
 */
export function occupeLeBoxSeul(
  chien: ChienCohabitation,
  selection: ChienCohabitation[]
): boolean {
  const choix = choixCohabitationDe(chien);
  if (choix === "seul") return true;
  if (choix !== "famille") return false;
  const compagnons = selection.filter(
    (c) => c.id !== chien.id && !!c.client_id && c.client_id === chien.client_id
  );
  return compagnons.length === 0;
}

/**
 * Un chien « seul » ne partage jamais son box : le mélanger à d'autres chiens
 * dans UNE réservation demanderait deux box et deux lignes de prix. Côté client
 * on refuse la sélection ; la pension peut toujours la composer à la main.
 */
export const MESSAGE_SELECTION_MIXTE =
  "ne peut pas partager son box. Réservez-le seul, ou appelez-nous pour organiser les deux box.";

export function selectionMixteRefusee(
  selection: ChienCohabitation[]
): { ok: true } | { ok: false; message: string } {
  if (selection.length <= 1) return { ok: true };
  const isole = selection.find((c) => choixCohabitationDe(c) === "seul");
  if (isole) {
    return { ok: false, message: `${isole.nom ?? "Ce chien"} ${MESSAGE_SELECTION_MIXTE}` };
  }
  return { ok: true };
}

/**
 * Tarif privatif ? Vrai dès qu'un chien de la sélection occupe le box entier
 * (déclaré « seul », ou « famille » réservé sans compagnon du foyer).
 *
 * Plusieurs chiens du même foyer en « famille uniquement » partagent bien un
 * box : ils paient le tarif à plusieurs chiens, pas le privatif.
 */
export function estPrivatifPourSelection(selection: ChienCohabitation[]): boolean {
  if (selection.length === 0) return false;
  return selection.some((c) => occupeLeBoxSeul(c, selection));
}

/** Chiens de la sélection qui occupent un box pour eux seuls. */
export function chiensSeulsDansLeBox(selection: ChienCohabitation[]): ChienCohabitation[] {
  return selection.filter((c) => occupeLeBoxSeul(c, selection));
}

/**
 * Avertissement affiché avant de valider l'étape « chiens ».
 * `prixFormate` est le tarif chien seul déjà mis en forme (« 70.00 CHF »).
 */
export function avertissementChienSeul(nom: string, prixFormate: string): string {
  return `${nom} occupe un box pour lui seul : vous payez les deux places, au tarif chien seul en box (${prixFormate}).`;
}

/** Tous les chiens de la sélection sont-ils de petit gabarit ? */
export function tousPetitsGabarits(categories: (string | null | undefined)[]): boolean {
  return categories.length > 0 && categories.every((c) => c === "moins_15kg");
}
