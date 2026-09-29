import { ajouterJoursISO } from "@/src/lib/cotisationPeriode";

/**
 * La date d'ouverture de la pension — une seule source, un seul réglage.
 *
 * ── LA DÉCISION ───────────────────────────────────────────────────────────
 *
 * La Dogosphère ouvre le lundi 1er mars 2027 (décision de Sabrina,
 * 29.09.2026 ; c'était le 15 octobre 2026). Les clients peuvent réserver dès
 * maintenant, mais aucune date avant l'ouverture. La boutique en ligne ouvre
 * le même jour.
 *
 * ── POURQUOI UN RÉGLAGE, ET PAS UNE CONSTANTE ─────────────────────────────
 *
 * La date a déjà changé une fois. Écrite en dur, elle se serait retrouvée dans
 * un bandeau, un refus serveur, un avertissement et un panier — quatre
 * endroits à retrouver le jour du report suivant, et l'un des quatre serait
 * resté en arrière sans que rien ne le signale. Elle vit donc dans
 * `parametres`, sous la clé `date_ouverture`, et TOUTES les phrases se
 * fabriquent à partir d'elle.
 *
 * ── LE RÉGLAGE VIDE NE RESTREINT RIEN ─────────────────────────────────────
 *
 * Vide, absent ou illisible : aucune restriction, c'est-à-dire exactement le
 * comportement d'avant ce lot. C'est délibéré et c'est le sens du champ : une
 * fois la pension ouverte, on efface la date et tout redevient normal, sans
 * qu'il faille toucher au code. Un réglage qu'on ne peut pas retirer
 * deviendrait une panne le jour où il est de trop.
 */

/** La clé du réglage dans `parametres`. */
export const CLE_DATE_OUVERTURE = "date_ouverture";

/**
 * La date d'ouverture telle qu'on peut s'en servir, ou "" si elle ne dit rien.
 *
 * Tout ce qui n'est pas une date ISO complète rend "" — donc aucune
 * restriction. Un réglage abîmé ne doit pas fermer la maison : il doit être
 * sans effet, ce qui se remarque tout de suite et ne bloque personne.
 */
export function dateOuvertureUtilisable(valeur: string | null | undefined): string {
  const t = String(valeur ?? "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return "";
  const d = new Date(t + "T12:00:00Z");
  if (Number.isNaN(d.getTime())) return "";
  // Une date impossible (« 2027-02-31 ») se replie sur un autre jour : on la
  // refuse plutôt que d'annoncer une ouverture qui n'existe pas.
  return d.toISOString().slice(0, 10) === t ? t : "";
}

/** La saisie est-elle acceptable pour le réglage ? Le vide l'est : il l'efface. */
export function dateOuvertureValide(valeur: string | null | undefined): boolean {
  const t = String(valeur ?? "").trim();
  return t === "" || dateOuvertureUtilisable(t) !== "";
}

/**
 * Le premier jour qu'un client peut choisir : demain, ou l'ouverture si elle
 * est plus tard.
 *
 * `max` et non « l'ouverture » : une fois le 1er mars passé, la règle ordinaire
 * reprend la main toute seule, sans qu'on ait à retirer le réglage.
 */
export function premiereDateReservable(
  aujourdhuiISO: string,
  dateOuvertureISO: string | null | undefined,
): string {
  const demain = ajouterJoursISO(aujourdhuiISO, 1);
  const ouverture = dateOuvertureUtilisable(dateOuvertureISO);
  if (ouverture === "") return demain;
  return ouverture > demain ? ouverture : demain;
}

/** La date tombe-t-elle avant l'ouverture ? Sans réglage : jamais. */
export function dateAvantOuverture(
  dateISO: string | null | undefined,
  dateOuvertureISO: string | null | undefined,
): boolean {
  const ouverture = dateOuvertureUtilisable(dateOuvertureISO);
  if (ouverture === "") return false;
  const d = String(dateISO ?? "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  return d < ouverture;
}

/**
 * La boutique en ligne est-elle ouverte ?
 *
 * Le JOUR de l'ouverture, elle l'est : `aujourdhui >= ouverture`. Une boutique
 * qui n'ouvrirait que le lendemain de sa date d'ouverture ferait mentir toutes
 * les phrases affichées la veille.
 */
export function boutiqueOuverte(
  aujourdhuiISO: string,
  dateOuvertureISO: string | null | undefined,
): boolean {
  const ouverture = dateOuvertureUtilisable(dateOuvertureISO);
  if (ouverture === "") return true;
  return String(aujourdhuiISO ?? "").slice(0, 10) >= ouverture;
}

// ── Les dates écrites en toutes lettres ───────────────────────────────────

const MOIS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];
const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

/**
 * « 1er mars 2027 », « 15 octobre 2026 ».
 *
 * Écrit à la main plutôt qu'avec `toLocaleDateString("fr-CH")` : celui-ci rend
 * « 1 mars », et le premier du mois s'écrit « 1er ». C'est la seule
 * irrégularité du français en la matière, et elle tombe précisément sur la
 * date décidée.
 */
export function dateOuvertureCourte(dateOuvertureISO: string | null | undefined): string {
  const iso = dateOuvertureUtilisable(dateOuvertureISO);
  if (iso === "") return "";
  const [annee, mois, jour] = iso.split("-").map(Number);
  return `${jour === 1 ? "1er" : jour} ${MOIS[mois - 1]} ${annee}`;
}

/** « lundi 1er mars 2027 » — la même, précédée de son jour de semaine. */
export function dateOuvertureLongue(dateOuvertureISO: string | null | undefined): string {
  const iso = dateOuvertureUtilisable(dateOuvertureISO);
  if (iso === "") return "";
  const jourSemaine = JOURS[new Date(iso + "T12:00:00Z").getUTCDay()];
  return `${jourSemaine} ${dateOuvertureCourte(iso)}`;
}

// ── Les phrases, toutes tirées du réglage ─────────────────────────────────

/**
 * Le bandeau en tête du tunnel de réservation, ou `null` s'il n'a pas lieu
 * d'être — réglage vide, ou ouverture déjà passée.
 */
export function bandeauReservation(
  aujourdhuiISO: string,
  dateOuvertureISO: string | null | undefined,
): string | null {
  if (boutiqueOuverte(aujourdhuiISO, dateOuvertureISO)) return null;
  return `La Dogosphère ouvre le ${dateOuvertureLongue(dateOuvertureISO)}.`
    + " Vous pouvez déjà réserver à partir de cette date.";
}

/** Le refus serveur d'une réservation client posée avant l'ouverture. */
export function refusDateAvantOuverture(dateOuvertureISO: string | null | undefined): string {
  return `Nous ouvrons le ${dateOuvertureCourte(dateOuvertureISO)} :`
    + " choisissez une date à partir de ce jour.";
}

/**
 * L'avertissement du formulaire du personnel. Il n'interdit rien : l'équipe
 * doit pouvoir saisir un cas particulier. Il dit seulement ce qu'on est en
 * train de faire, ce que l'écran ne montrait pas.
 */
export function avertissementPersonnel(dateOuvertureISO: string | null | undefined): string {
  return `Attention : cette date est avant l'ouverture (${dateOuvertureCourte(dateOuvertureISO)}).`;
}

/** Le bandeau du panier, ou `null` si la boutique est ouverte. */
export function bandeauBoutique(
  aujourdhuiISO: string,
  dateOuvertureISO: string | null | undefined,
): string | null {
  if (boutiqueOuverte(aujourdhuiISO, dateOuvertureISO)) return null;
  return `La boutique en ligne ouvre le ${dateOuvertureLongue(dateOuvertureISO)}.`;
}
