/**
 * Le prestataire de paiement en ligne — l'interface, et rien d'autre.
 *
 * Le paiement en ligne N'EST PAS branché. Ce fichier existe pour que le jour
 * où il le sera (Payrexx, sans doute), ce soit LE SEUL à changer : les écrans,
 * les actions et la base parlent déjà cette langue-là.
 *
 * Aucun appel réseau n'est fait ici, et il ne faut pas en ajouter tant que le
 * contrat, les clés et le webhook de retour ne sont pas décidés. Une
 * implémentation à moitié branchée encaisserait à moitié.
 *
 * Ce qu'il restera à faire, le jour venu :
 *   1. écrire une classe qui implémente PrestatairePaiement en appelant l'API
 *      du prestataire, et la renvoyer depuis `prestataire()` ;
 *   2. ajouter la route de retour (webhook) qui appelle `verifier` puis
 *      marque la commande payée — jamais l'inverse : on ne croit pas le
 *      navigateur du client sur parole ;
 *   3. rendre actif le mode « en_ligne » dans MODES_PAIEMENT_LIGNE.
 */

export type IntentionPaiement = {
  /** La référence chez le prestataire, à ranger dans commandes.paiement_reference. */
  reference: string;
  /** Où envoyer le client pour qu'il paie. */
  url: string;
};

export type EtatPaiement = "en_attente" | "paye" | "echoue" | "rembourse";

export type Resultat<T> = { ok: true; valeur: T } | { ok: false; error: string };

export interface PrestatairePaiement {
  /** Est-il branché ? Faux tant que rien n'est configuré. */
  readonly actif: boolean;
  readonly nom: string;

  /** Ouvre une intention de paiement pour un montant en CHF. */
  creerIntention(p: {
    commandeId: string;
    montant: number;
    /** Ce que le client lira sur son relevé. */
    libelle: string;
    email?: string | null;
    urlRetour: string;
  }): Promise<Resultat<IntentionPaiement>>;

  /** Relit l'état réel chez le prestataire. Seule source de vérité. */
  verifier(reference: string): Promise<Resultat<EtatPaiement>>;

  /** Rembourse tout ou partie. */
  rembourser(reference: string, montant: number): Promise<Resultat<EtatPaiement>>;
}

const INACTIF = "Le paiement en ligne n'est pas encore disponible. Choisissez « Je paie au retrait » ou « Recevoir une facture ».";

/**
 * L'implémentation factice : elle refuse tout, poliment, et n'appelle rien.
 * C'est volontaire — un faux prestataire qui « réussit » finirait par laisser
 * passer une commande non payée.
 */
export class PrestataireInactif implements PrestatairePaiement {
  readonly actif = false;
  readonly nom = "aucun";

  async creerIntention(): Promise<Resultat<IntentionPaiement>> {
    return { ok: false, error: INACTIF };
  }

  async verifier(): Promise<Resultat<EtatPaiement>> {
    return { ok: false, error: INACTIF };
  }

  async rembourser(): Promise<Resultat<EtatPaiement>> {
    return { ok: false, error: INACTIF };
  }
}

let instance: PrestatairePaiement | null = null;

/** Le prestataire du moment. Aujourd'hui : aucun. */
export function prestataire(): PrestatairePaiement {
  if (!instance) instance = new PrestataireInactif();
  return instance;
}

/** Pour les tests, et pour le jour où l'on branchera vraiment quelque chose. */
export function definirPrestataire(p: PrestatairePaiement | null): void {
  instance = p;
}

export function paiementEnLigneDisponible(): boolean {
  return prestataire().actif;
}
