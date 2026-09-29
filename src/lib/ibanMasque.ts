/**
 * Un IBAN montré sans être révélé (APP 63).
 *
 * ── POURQUOI IL EST MASQUÉ ────────────────────────────────────────────────
 *
 * L'écran Tarifs affiche l'IBAN pour qu'on VÉRIFIE qu'il est bien réglé, pas
 * pour qu'on le lise. Quatre premiers caractères et deux derniers suffisent à
 * reconnaître le bon compte ; le reste n'a aucune raison de traîner sur un
 * écran ouvert au comptoir, devant qui passe.
 *
 * Il se règle à UN seul endroit — Réglages → Entreprise — et c'est là qu'on le
 * lit en clair.
 *
 * ── CE QUI EST ARRIVÉ, ET QUE CE LOT FERME ────────────────────────────────
 *
 * L'écran Tarifs portait des champs IBAN, titulaire et adresse, remplis depuis
 * d'anciens réglages de `parametres`. Chaque sauvegarde des PRIX les renvoyait
 * à `/api/entite/coordonnees`. Le 29.09.2026 à 20:45 UTC, enregistrer un tarif
 * a donc mis l'IBAN de l'entité en vigueur à null et changé sa raison sociale
 * — sans que personne ne l'ait demandé, et sans que rien ne le signale.
 */

/**
 * « CH9300762011623852957 » → « CH93 …………… 57 ».
 *
 * Les espaces de saisie sont retirés avant le compte : un IBAN écrit par
 * groupes de quatre ne doit pas révéler deux chiffres de plus qu'un autre.
 * Trop court pour être masqué utilement : on rend des points, jamais la valeur.
 */
export function ibanMasque(brut: string | null | undefined): string {
  const iban = String(brut ?? "").replace(/\s+/g, "").toUpperCase();
  if (iban === "") return "";
  if (iban.length < 8) return "…";
  return `${iban.slice(0, 4)} …………… ${iban.slice(-2)}`;
}

/** Ce que l'écran affiche quand le champ n'a jamais été rempli. */
export const NON_RENSEIGNE = "non renseigné";

/**
 * L'avertissement quand aucun IBAN n'est réglé — ni ordinaire, ni QR.
 *
 * Il ne bloque rien : une facture part quand même, simplement sans son
 * bulletin. C'est ce silence-là qu'on nomme, parce qu'une facture sans
 * bulletin se remarque chez la cliente, pas ici.
 */
export const AVERTISSEMENT_SANS_IBAN =
  "Aucun IBAN : les factures partiront sans bulletin de versement.";
