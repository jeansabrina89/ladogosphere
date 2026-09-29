import { formatJJMMAAAA } from "@/src/lib/cotisationPeriode";

/**
 * Les fermetures de la pension : la règle, sans la base (APP 59).
 *
 * ── LA RÈGLE (décision de Sabrina, 29.09.2026) ────────────────────────────
 *
 * Pendant une fermeture, AUCUNE arrivée et AUCUN départ. Les chiens déjà en
 * séjour restent : la pension est tenue, elle n'accueille simplement personne
 * de nouveau et ne rend personne.
 *
 * D'où la nuance qui fait tout ce module : un séjour qui ENJAMBE la fermeture
 * — arrivée avant, départ après — est parfaitement possible. Une garderie ou
 * une journée d'essai, elles, tiennent dans la journée : leur arrivée ET leur
 * départ tombent le jour fermé, donc elles sont refusées.
 *
 * Traiter la fermeture comme « ces jours-là sont interdits » aurait refusé le
 * séjour de Noël de quelqu'un parti le 20 et revenu le 30 — celui-là même que
 * la fermeture est censée permettre.
 *
 * ── CE QUE CE MODULE NE FAIT PAS ──────────────────────────────────────────
 *
 * Il ne bloque pas le personnel : l'équipe doit pouvoir saisir un cas
 * particulier, et elle est AVERTIE. Il n'annule rien non plus : une
 * réservation déjà validée qui tombe dans une nouvelle fermeture reste en
 * place, c'est un appel à passer.
 */

export type Fermeture = {
  date_debut: string;
  date_fin: string;
  motif?: string | null;
};

/** Le jour tombe-t-il dans la fermeture ? Les deux bornes sont INCLUSIVES. */
export function jourFerme(jourISO: string, f: Fermeture): boolean {
  const j = String(jourISO ?? "").slice(0, 10);
  if (j === "") return false;
  return j >= String(f.date_debut).slice(0, 10) && j <= String(f.date_fin).slice(0, 10);
}

/** Toutes les dates d'une fermeture, dépliées — pour griser un calendrier. */
export function joursDeFermeture(f: Fermeture): string[] {
  const jours: string[] = [];
  const d = new Date(String(f.date_debut).slice(0, 10) + "T12:00:00Z");
  const fin = new Date(String(f.date_fin).slice(0, 10) + "T12:00:00Z");
  while (d <= fin) {
    jours.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return jours;
}

/** Les jours fermés d'une liste de fermetures, sans doublon. */
export function joursFermes(fermetures: readonly Fermeture[]): string[] {
  const vus = new Set<string>();
  for (const f of fermetures) for (const j of joursDeFermeture(f)) vus.add(j);
  return [...vus].sort();
}

/**
 * La fermeture qui empêche cette réservation, ou `null`.
 *
 * On regarde l'ARRIVÉE et le DÉPART, jamais les jours du milieu. Pour une
 * garderie ou un essai, les deux dates sont le même jour : la règle se replie
 * d'elle-même sur « ce jour est-il fermé ? », sans qu'on ait à distinguer les
 * types de réservation.
 */
export function fermetureQuiEmpeche(
  dateDebut: string,
  dateFin: string,
  fermetures: readonly Fermeture[],
): Fermeture | null {
  const debut = String(dateDebut ?? "").slice(0, 10);
  const fin = String(dateFin ?? "").slice(0, 10) || debut;
  for (const f of fermetures) {
    if (jourFerme(debut, f) || jourFerme(fin, f)) return f;
  }
  return null;
}

/** Le refus lu par le client, mot pour mot. */
export function messageFermeture(f: Fermeture): string {
  const motif = String(f.motif ?? "").trim();
  return `La pension est fermée du ${formatJJMMAAAA(f.date_debut)}`
    + ` au ${formatJJMMAAAA(f.date_fin)}${motif === "" ? "" : ` — ${motif}`}.`
    + " Choisissez d'autres dates.";
}

/**
 * L'avertissement du personnel. Il n'interdit rien : il dit ce qu'on est en
 * train de faire, ce que l'écran ne montrait pas.
 *
 * Sans motif, la parenthèse disparaît plutôt que de rester vide : « fermée ce
 * jour-là () » se lirait comme un bogue.
 */
export function avertissementFermeturePersonnel(f: Fermeture): string {
  const motif = String(f.motif ?? "").trim();
  return `Attention : la pension est fermée ce jour-là${motif === "" ? "" : ` (${motif})`}.`;
}

/** Une fermeture est-elle à venir ? Le jour même compte comme à venir. */
export function fermetureAVenir(f: Fermeture, aujourdhuiISO: string): boolean {
  return String(f.date_fin).slice(0, 10) >= String(aujourdhuiISO).slice(0, 10);
}

/** Le refus de saisie, ou `null`. Les deux dates sont obligatoires. */
export function refusFermeture(dateDebut: string, dateFin: string): string | null {
  const ISO = /^\d{4}-\d{2}-\d{2}$/;
  const d = String(dateDebut ?? "").trim();
  const f = String(dateFin ?? "").trim();
  if (!ISO.test(d) || !ISO.test(f)) return "Indiquez les deux dates.";
  if (f < d) return "La date de fin ne peut pas précéder la date de début.";
  return null;
}

/**
 * Les réservations déjà posées qu'une nouvelle fermeture touche.
 *
 * Elles ne sont PAS annulées : on les nomme, pour que quelqu'un décroche le
 * téléphone. Une annulation automatique ferait disparaître le séjour de
 * quelqu'un qui n'a pas encore été prévenu — et personne ne saurait plus qui
 * appeler.
 */
export function reservationsAContacter<T extends { date_debut: string; date_fin: string }>(
  reservations: readonly T[],
  f: Fermeture,
): T[] {
  return reservations.filter((r) => fermetureQuiEmpeche(r.date_debut, r.date_fin, [f]) !== null);
}
