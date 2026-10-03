/**
 * Le rappel de la veille : qui le reçoit, et ce qu'il dit pour une journée
 * d'essai.
 *
 * Le séjour avait son rappel ; la journée d'essai, la première venue du chien,
 * n'en avait pas — c'est pourtant la seule où l'on ne connaît ni l'heure ni ce
 * qu'il faut apporter. La journée de garderie, elle, n'en reçoit toujours pas :
 * elle se réserve souvent la veille, et le rappel arriverait après coup.
 *
 * Module pur : la route lit la base, le modèle d'e-mail lit les phrases.
 */

import { HEURE_ESSAI_STANDARD, heureCourte } from "@/src/lib/journeeEssai";
import { aujourdhuiISO } from "@/src/lib/dates";
import { ajouterJoursISO } from "@/src/lib/cotisationPeriode";

/**
 * Les trois dates du cron de la veille, au jour de ZURICH (APP 71).
 *
 * Elles étaient prises en UTC (`toISOString`), ce qui tombait juste à
 * 10:00 UTC — l'heure du cron — mais seulement par chance : lancé à la main
 * entre minuit et 2 h, heure suisse, le cron aurait visé le mauvais jour.
 * C'est désormais la même paire de fonctions que le cron du matin :
 * `aujourdhuiISO` (Europe/Zurich, explicitement) puis `ajouterJoursISO`.
 */
export function datesDuRappel(maintenant: Date = new Date()): {
  aujourdhui: string;
  demain: string;
  dansQuatorzeJours: string;
} {
  const aujourdhui = aujourdhuiISO(maintenant);
  return {
    aujourdhui,
    demain: ajouterJoursISO(aujourdhui, 1),
    dansQuatorzeJours: ajouterJoursISO(aujourdhui, 14),
  };
}

/** Types de réservation qui reçoivent un rappel la veille. */
export const TYPES_RAPPEL_VEILLE = ["sejour", "essai"] as const;

export type ReservationRappel = {
  type_reservation: string | null;
  statut: string | null;
  date_debut: string | null;
};

/** Une réservation validée, séjour ou essai, qui commence demain. */
export function doitRecevoirRappelVeille(r: ReservationRappel, demain: string): boolean {
  if (r.statut !== "validee") return false;
  if (!(TYPES_RAPPEL_VEILLE as readonly string[]).includes(r.type_reservation ?? "")) return false;
  return (r.date_debut ?? "").slice(0, 10) === demain.slice(0, 10);
}

/**
 * « 10:00 » → « 10 h », « 10:30 » → « 10 h 30 ». Sans heure, celle de l'essai
 * ordinaire — que l'appelant lit dans le réglage (APP 64).
 */
export function heureLisible(
  heure: string | null | undefined,
  heureStandard: string = HEURE_ESSAI_STANDARD,
): string {
  const courte = heureCourte(heure) ?? heureStandard;
  const [h, m] = courte.split(":");
  const heures = String(Number(h));
  return m && m !== "00" ? `${heures} h ${m}` : `${heures} h`;
}

/**
 * Les deux phrases du rappel d'une journée d'essai.
 *
 * L'heure est celle de la réservation. Une journée d'essai ordinaire est à
 * 10 h ; une seconde journée forcée par l'administration peut tomber à 9 h 30,
 * 10 h 30 ou 11 h, et annoncer 10 h à ce client-là le ferait venir trop tôt ou
 * trop tard.
 */
export function phrasesRappelVeilleEssai(
  nomChien: string,
  heureArrivee: string | null | undefined,
  heureStandard: string = HEURE_ESSAI_STANDARD,
): [string, string] {
  return [
    `La journée d'essai de ${nomChien} est demain, à ${heureLisible(heureArrivee, heureStandard)}.`,
    "Merci d'apporter son carnet de vaccination et, si vous l'avez, ce qu'il mange d'habitude pour la journée.",
  ];
}
