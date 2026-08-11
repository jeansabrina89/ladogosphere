/**
 * Porte d'accès « réserver une pension » + décision de bundling de l'adhésion.
 *
 * Règles :
 * - Une journée d'essai est toujours réservable (aucun bundling).
 * - Admin : aucun blocage essai/adhésion, jamais de bundling automatique.
 * - Client, pension : bloqué si aucune journée d'essai terminée.
 * - Client, pension, essai terminé : autorisé ; si ni membre à jour ni exempté,
 *   la réservation EMBARQUE l'adhésion (bundling).
 *
 * L'idempotence du bundling est garantie en amont par « membre à jour »
 * (= cotisation de l'année en 'payee' OU 'en_attente') : une fois l'adhésion
 * créée en_attente, estMembreAJour devient vrai → plus de re-bundling.
 */
export type RaisonPension = "ok" | "essai_non_termine" | "adhesion_a_regler";

export type ResultatPension = {
  autorise: boolean;
  bundlerAdhesion: boolean;
  raison: RaisonPension;
};

export const MESSAGE_ESSAI_REQUIS =
  "Vous devez d'abord effectuer votre journée d'essai avant de réserver une pension.";

export const MESSAGE_ADHESION_A_REGLER =
  "Votre demande d'adhésion est en attente de paiement. Réglez-la pour pouvoir réserver une pension.";

export function peutReserverPension({
  estMembreAJour,
  estExempte,
  essaiTermine,
  typeReservation,
  estAdmin,
  adhesionEnAttenteARegler = false,
}: {
  estMembreAJour: boolean;
  estExempte: boolean;
  essaiTermine: boolean;
  typeReservation: string;
  estAdmin: boolean;
  /** Une demande d'adhésion 'en_attente' non réglée (virement/cash) existe. */
  adhesionEnAttenteARegler?: boolean;
}): ResultatPension {
  // L'essai lui-même : toujours réservable, sans bundling.
  if (typeReservation === "essai") {
    return { autorise: true, bundlerAdhesion: false, raison: "ok" };
  }
  // Admin : aucun blocage, jamais de bundling automatique.
  if (estAdmin) {
    return { autorise: true, bundlerAdhesion: false, raison: "ok" };
  }
  // Client, pension : la journée d'essai doit être terminée.
  if (!essaiTermine) {
    return { autorise: false, bundlerAdhesion: false, raison: "essai_non_termine" };
  }
  // Membre à jour ou exempté : autorisé sans bundling.
  if (estMembreAJour || estExempte) {
    return { autorise: true, bundlerAdhesion: false, raison: "ok" };
  }
  // Adhésion déjà DEMANDÉE mais non réglée (virement/cash) : bloqué → à régler.
  // (On ne bundle pas une 2e adhésion ; le client doit encaisser la sienne.)
  if (adhesionEnAttenteARegler) {
    return { autorise: false, bundlerAdhesion: false, raison: "adhesion_a_regler" };
  }
  // Essai terminé, aucune adhésion : autorisé + l'adhésion est embarquée.
  return { autorise: true, bundlerAdhesion: true, raison: "ok" };
}
