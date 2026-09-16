/**
 * Réglages → E-mails : trois onglets, dans cet ordre. L'onglet actif vit dans
 * l'adresse (?onglet=test) pour qu'un lien direct ouvre le bon.
 *
 * Module pur.
 */
export const ONGLETS_EMAILS = [
  { valeur: "modeles", libelle: "Modèles" },
  { valeur: "message", libelle: "Message aux membres" },
  { valeur: "test", libelle: "Envoi de test" },
] as const;

export type OngletEmails = (typeof ONGLETS_EMAILS)[number]["valeur"];

/** L'onglet demandé par l'adresse ; « Modèles » par défaut, ou si la valeur est inconnue. */
export function ongletEmails(brut: string | string[] | null | undefined): OngletEmails {
  const v = Array.isArray(brut) ? brut[0] : brut;
  return ONGLETS_EMAILS.some((o) => o.valeur === v) ? (v as OngletEmails) : "modeles";
}

/** L'adresse d'un onglet : sans paramètre pour l'onglet par défaut. */
export function requeteOnglet(onglet: OngletEmails): string {
  return onglet === "modeles" ? "" : `?onglet=${onglet}`;
}
