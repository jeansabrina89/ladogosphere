/**
 * Chiens du personnel : fiches internes, réservations gratuites, box internes.
 *
 * Une fiche `clients.interne` appartient à un membre du personnel (employé ou
 * admin). Elle est rattachée au compte pro par `clients.auth_user_id`, comme
 * une fiche client ordinaire.
 */

export const MESSAGE_AUCUN_BOX = "Aucun box disponible ce jour-là.";
export const BANDEAU_PERSONNEL = "Profil du personnel : gratuit, validé automatiquement.";

/** Types de prestation ouverts à une fiche interne (jamais de journée d'essai). */
export const TYPES_RESERVATION_PERSONNEL = ["journee", "sejour"] as const;

export function typeAutorisePourPersonnel(type: string): boolean {
  return (TYPES_RESERVATION_PERSONNEL as readonly string[]).includes(type);
}

export type BoxInterne = {
  id: string;
  /** Fiche interne propriétaire ; null = box de la pension, jamais attribué. */
  proprietaire_client_id: string | null;
};

export type OrigineBox = "box_attitre" | "box_interne_absent" | "box_client";

export type DecisionBoxPersonnel =
  | { box_id: string; origine: OrigineBox; interne: boolean }
  | { box_id: null; origine: null; message: string };

/**
 * Où placer les chiens d'une fiche interne, à une date donnée.
 *
 * Dans l'ordre :
 *  1. son propre box interne (`proprietaire_client_id` = sa fiche) — toujours,
 *     et sans consommer de capacité client ;
 *  2. à défaut, le box interne d'un AUTRE membre du personnel qui ne travaille
 *     pas ce jour-là ;
 *  3. à défaut, un box client ordinaire, qui compte alors dans la capacité ;
 *  4. sinon, rien : on refuse plutôt que de surbooker.
 *
 * Le box de la pension (`proprietaire_client_id` null) n'est JAMAIS attribué
 * automatiquement : il ne sert qu'aux chiens de la maison, placés à la main.
 *
 * `boxesInternes` est supposé trié (par numéro) : le premier candidat gagne,
 * ce qui rend la décision reproductible.
 */
export function boxPourPersonnel({
  ficheClientId,
  boxesInternes,
  proprietairesPresents,
  boxClientDisponible,
}: {
  ficheClientId: string;
  /** Box internes ACTIFS et libres à la date demandée, triés par numéro. */
  boxesInternes: BoxInterne[];
  /** Fiches internes dont le titulaire TRAVAILLE ce jour-là. */
  proprietairesPresents: Set<string> | string[];
  /** Box client libre proposé par la suggestion habituelle, ou null. */
  boxClientDisponible: string | null;
}): DecisionBoxPersonnel {
  const presents = proprietairesPresents instanceof Set
    ? proprietairesPresents
    : new Set(proprietairesPresents);

  // 1. Box attitré.
  const attitre = boxesInternes.find((b) => b.proprietaire_client_id === ficheClientId);
  if (attitre) return { box_id: attitre.id, origine: "box_attitre", interne: true };

  // 2. Box interne d'un collègue absent ce jour-là.
  const libre = boxesInternes.find(
    (b) =>
      b.proprietaire_client_id !== null &&
      b.proprietaire_client_id !== ficheClientId &&
      !presents.has(b.proprietaire_client_id)
  );
  if (libre) return { box_id: libre.id, origine: "box_interne_absent", interne: true };

  // 3. Box client ordinaire.
  if (boxClientDisponible) {
    return { box_id: boxClientDisponible, origine: "box_client", interne: false };
  }

  // 4. Jamais de surbooking.
  return { box_id: null, origine: null, message: MESSAGE_AUCUN_BOX };
}

export const MESSAGE_BOX_INTERNE_REFUSE =
  "Ce box est réservé au personnel et à la pension : il ne peut pas accueillir le chien d'un client.";

/**
 * Un chien peut-il aller dans ce box ? Règle pure : seul un chien appartenant à
 * une fiche interne entre dans un box interne.
 */
export function placementBoxAutorise({
  boxInterne,
  ficheInterne,
}: {
  boxInterne: boolean;
  ficheInterne: boolean;
}): { autorise: boolean; message?: string } {
  if (boxInterne && !ficheInterne) {
    return { autorise: false, message: MESSAGE_BOX_INTERNE_REFUSE };
  }
  return { autorise: true };
}

/**
 * Ce qu'il faut poser sur une réservation d'une fiche interne :
 * validée d'office, gratuite, et sans facture ni adhésion.
 */
export type ReservationPersonnel = {
  statut: "validee";
  montant_calcule: number;
  montant_final: number;
  statut_paiement: "paye";
  montant_paye: number;
};

export function champsReservationPersonnel(): ReservationPersonnel {
  return {
    statut: "validee",
    montant_calcule: 0,
    montant_final: 0,
    statut_paiement: "paye",
    montant_paye: 0,
  };
}

/** Une fiche interne ne paie rien : ni facture, ni adhésion, ni extra. */
export function reservationPersonnelSansFacturation(interne: boolean): {
  creerFacture: boolean;
  bundlerAdhesion: boolean;
  envoyerEmail: boolean;
} {
  return interne
    ? { creerFacture: false, bundlerAdhesion: false, envoyerEmail: false }
    : { creerFacture: true, bundlerAdhesion: true, envoyerEmail: true };
}
