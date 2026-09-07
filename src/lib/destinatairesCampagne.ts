/**
 * Qui reçoit un message d'information (campagne).
 *
 * Règle pure, testée, partagée par l'aperçu et par l'envoi : les deux DOIVENT
 * compter la même chose, sans quoi l'admin verrait un nombre et un autre
 * partirait.
 *
 * Le consentement `emails_info_ok` ne concerne QUE ces messages libres. Les
 * e-mails liés à une réservation, une facture ou l'adhésion partent dans tous
 * les cas : ils ne relèvent pas de la prospection.
 */

export type CibleCampagne = "tous_clients" | "membres_actifs";

export type ClientCampagne = {
  id: string;
  email?: string | null;
  prenom?: string | null;
  nom?: string | null;
  /** null vaut actif : la colonne n'a pas toujours été renseignée. */
  actif?: boolean | null;
  /** null vaut consentant : le défaut de la colonne est `true`. */
  emails_info_ok?: boolean | null;
};

export type TriDestinataires<T> = {
  /** Ceux à qui le message part. */
  destinataires: T[];
  /** Ceux qui auraient reçu le message mais ont refusé les informations. */
  exclus: T[];
};

function estJoignable(c: ClientCampagne): boolean {
  return c.actif !== false && !!(c.email ?? "").trim();
}

function dansLaCible(c: ClientCampagne, cible: CibleCampagne, membresAJour: Set<string>): boolean {
  return cible === "membres_actifs" ? membresAJour.has(c.id) : true;
}

/**
 * Sépare les clients visés en destinataires et refus.
 * « Exclus » ne compte QUE ceux qui étaient dans la cible : un client inactif
 * ou sans adresse n'a rien refusé, il n'aurait rien reçu de toute façon.
 */
export function trierDestinataires<T extends ClientCampagne>(
  clients: T[],
  cible: CibleCampagne,
  membresAJour: Set<string> = new Set(),
): TriDestinataires<T> {
  const destinataires: T[] = [];
  const exclus: T[] = [];

  for (const c of clients) {
    if (!estJoignable(c) || !dansLaCible(c, cible, membresAJour)) continue;
    if (c.emails_info_ok === false) exclus.push(c);
    else destinataires.push(c);
  }

  return { destinataires, exclus };
}
