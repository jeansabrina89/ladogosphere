/**
 * Une fiche de recette ne reçoit jamais le compte d'une vraie personne.
 *
 * Le 7 septembre 2026, la recette d'APP 13 a posé le compte admin de Sabrina
 * sur une fiche de test. Pendant huit jours son espace client a montré les
 * factures et les ventes de la recette, et le chien qu'elle a saisi le
 * 15 septembre a atterri là. Personne ne pouvait s'en apercevoir : l'écran
 * affichait bien « sa » fiche.
 *
 * Trois marques désignent une fiche de recette. Elles sont volontairement
 * grossières : mieux vaut refuser une fiche légitime au nom improbable que
 * laisser repasser celle-ci.
 *
 * Ce qui est refusé, c'est le mélange : un compte RÉEL sur une fiche de
 * recette. Une recette qui apparie son propre compte de test à sa propre fiche
 * de test reste permise — l'interdire casserait la recette au lieu de la
 * protéger.
 *
 * Le même contrôle existe en base (trigger `clients_refuser_compte_reel`) :
 * la fiche fautive n'avait pas été écrite par le code de l'application mais
 * par un harnais de recette branché en service_role, que seul un garde-fou
 * SQL peut arrêter. Celui d'ici sert à donner un message clair à l'écran
 * avant d'en arriver là.
 */

export const MESSAGE_FICHE_DE_RECETTE =
  "Cette fiche est une fiche de recette : elle ne peut pas être rattachée à un compte réel.";

/** Domaines réservés aux tests, jamais routables (RFC 2606 et RFC 6761). */
const SUFFIXES_DE_TEST = [".test", ".invalid"];

/** Préfixe des fiches de recette, par convention du dépôt. */
const PREFIXE_RECETTE = "ZZ";

export type FicheCandidate = {
  email?: string | null;
  nom?: string | null;
  prenom?: string | null;
};

/** Une adresse d'un domaine réservé aux tests. */
export function estAdresseDeTest(email: string | null | undefined): boolean {
  const normalisee = (email ?? "").trim().toLowerCase();
  return SUFFIXES_DE_TEST.some((suffixe) => normalisee.endsWith(suffixe));
}

/**
 * Cette fiche porte-t-elle une marque de recette ?
 *
 * On regarde le nom ET le prénom : selon la voie de création, « ZZ » se
 * retrouve dans l'un ou dans l'autre.
 */
export function estFicheDeRecette(fiche: FicheCandidate | null | undefined): boolean {
  if (!fiche) return false;
  if (estAdresseDeTest(fiche.email)) return true;
  return [fiche.nom, fiche.prenom].some(
    (champ) => (champ ?? "").trim().toUpperCase().startsWith(PREFIXE_RECETTE)
  );
}

/**
 * Le rattachement de ce compte à cette fiche est-il refusé ? Rend le message
 * à afficher, ou null si le geste est permis.
 *
 * Détacher (`authUserId` absent) reste toujours permis : c'est le geste de
 * réparation, il ne doit jamais être bloqué par le garde-fou.
 */
export function refusRattachementFiche({
  fiche,
  authUserId,
  emailCompte,
}: {
  fiche: FicheCandidate | null | undefined;
  /** Compte Auth qu'on veut poser sur la fiche, ou null/absent pour détacher. */
  authUserId: string | null | undefined;
  /** Adresse du compte Auth visé, pour reconnaître un compte de recette. */
  emailCompte: string | null | undefined;
}): string | null {
  if (!authUserId) return null;
  if (!estFicheDeRecette(fiche)) return null;
  if (estAdresseDeTest(emailCompte)) return null; // recette sur recette : permis
  return MESSAGE_FICHE_DE_RECETTE;
}
