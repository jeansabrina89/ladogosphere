/**
 * APP 74 — l'option « mon chien seul dans un box », côté textes et prix.
 *
 * La RÈGLE (qui occupe un box entier) vit dans `estPrivatifReservation`
 * (src/lib/cohabitation.ts). Ici, seulement ce qu'on en dit au client et à
 * l'équipe, et les deux prix qu'on lui annonce — lus dans les tarifs, jamais
 * écrits dans le code.
 */

import { resoudrePrixUnitaire } from "@/src/lib/calculTarif";
import { formatPrixClient } from "@/src/lib/prixClient";

export const LIBELLE_CASE_BOX_SEUL = "🏠 Mon chien seul dans un box";

/** Le badge court des écrans de l'équipe (Chiens du jour, Check-in, Planning). */
export const BADGE_BOX_SEUL = "🏠 seul";

export const MENTION_CARTE_CHIEN_SEUL = "Payable avec votre carte 1 chien seul";

/**
 * Deux chiens ou plus : la case ne se propose pas, et on dit pourquoi. Ce
 * sont les règles d'aujourd'hui, inchangées par ce lot : les chiens d'un même
 * foyer partagent leur box, et un chien qui doit être seul se réserve seul.
 */
export const EXPLICATION_PLUSIEURS_CHIENS =
  "Vos chiens partagent un box, au tarif à plusieurs chiens. Pour qu'ils soient séparés, réservez-les un par un, ou écrivez-le-nous en commentaire.";

type Tarif = { categorie: string; membre: boolean; prix: string };

/** Le tarif « chien seul » : la journée et la nuit, tels qu'en base. */
export function prixBoxSeul(tarifs: Tarif[]): { journee: number; nuit: number } {
  const lire = (type_reservation: string) => resoudrePrixUnitaire({
    tarifs, type_reservation, nb_chiens: 1,
    est_membre: true, est_urgence: false, est_privatif: true,
  });
  return { journee: lire("journee"), nuit: lire("sejour") };
}

/**
 * « Votre chien ne partage pas son box. Tarif chien seul : 70.– la journée,
 * 90.– la nuit. » Sans tarif lisible, la phrase s'arrête avant les prix
 * plutôt que d'annoncer « 0.– ».
 */
export function aideBoxSeul(prix: { journee: number; nuit: number }): string {
  const base = "Votre chien ne partage pas son box.";
  if (!(prix.journee > 0) || !(prix.nuit > 0)) return base;
  return `${base} Tarif chien seul : ${formatPrixClient(prix.journee)} la journée, ${formatPrixClient(prix.nuit)} la nuit.`;
}

/** Le suffixe de la ligne de facture d'une réservation qui occupe un box entier. */
export const SUFFIXE_FACTURE_BOX_SEUL = "chien seul en box";
