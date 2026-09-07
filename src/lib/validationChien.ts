/**
 * Validation serveur des champs d'un chien, et traduction des refus de la base.
 *
 * Une valeur hors liste remontait jusqu'à Postgres : le client lisait
 * « new row for relation "chiens" violates check constraint
 * "chiens_sexe_check" ». Rien de tout cela ne doit atteindre un écran.
 *
 * Règles pures, sans base : elles sont partagées par les quatre formulaires
 * (client et pension, création et modification) et couvertes par des tests.
 */

export const SEXES = ["M", "F"] as const;
export const STERILISATIONS = ["oui", "non", "chimique"] as const;
export const CATEGORIES_POIDS = ["moins_15kg", "15_30kg", "30_40kg"] as const;

export type ChampsChien = {
  nom?: string | null;
  race?: string | null;
  couleur?: string | null;
  poids?: number | null;
  sexe?: string | null;
  sterilisation?: string | null;
  numero_puce?: string | null;
};

export type ExigencesChien = {
  /** La puce est obligatoire côté pension, facultative côté client. */
  puceObligatoire?: boolean;
  /** La stérilisation est demandée sur les formulaires client. */
  sterilisationObligatoire?: boolean;
};

/** Poids acceptés : au-delà, c'est une saisie erronée, pas un chien. */
export const POIDS_MIN = 0.5;
export const POIDS_MAX = 120;

/**
 * Refus de validation : le message à afficher et le nom du champ fautif, pour
 * que le formulaire puisse le marquer et y placer le focus.
 */
export type RefusChamp = { champ: string; message: string };

/**
 * Renvoie le refus à afficher, ou null si tout est bon.
 * Le message nomme le champ fautif — jamais la contrainte SQL.
 */
export function validerChampsChien(
  champs: ChampsChien,
  exigences: ExigencesChien = {}
): RefusChamp | null {
  const vide = (v?: string | null) => !v || !String(v).trim();

  if (vide(champs.nom)) return { champ: "nom", message: "Le nom du chien est obligatoire." };
  if (vide(champs.race)) return { champ: "race", message: "La race est obligatoire." };
  if (vide(champs.couleur)) return { champ: "couleur", message: "La couleur est obligatoire." };
  if (exigences.puceObligatoire && vide(champs.numero_puce)) {
    return { champ: "numero_puce", message: "Le numéro de puce est obligatoire." };
  }

  const poids = Number(champs.poids);
  if (!champs.poids || !Number.isFinite(poids) || poids <= 0) {
    return { champ: "poids", message: "Le poids est obligatoire et doit être un nombre." };
  }
  if (poids < POIDS_MIN || poids > POIDS_MAX) {
    return {
      champ: "poids",
      message: `Le poids doit être compris entre ${POIDS_MIN} et ${POIDS_MAX} kg.`,
    };
  }

  if (!SEXES.includes(String(champs.sexe ?? "").trim() as (typeof SEXES)[number])) {
    return { champ: "sexe", message: "Le sexe doit être « Mâle » ou « Femelle »." };
  }

  const sterilisation = String(champs.sterilisation ?? "").trim();
  if (exigences.sterilisationObligatoire || sterilisation) {
    if (!STERILISATIONS.includes(sterilisation as (typeof STERILISATIONS)[number])) {
      return {
        champ: "sterilisation",
        message: "La stérilisation doit être « oui », « non » ou « chimique ».",
      };
    }
  }

  return null;
}

/** Catégorie de poids dérivée, toujours dans la liste acceptée par la base. */
export function categorieDepuisPoids(poids: number): (typeof CATEGORIES_POIDS)[number] {
  if (poids < 15) return "moins_15kg";
  if (poids <= 30) return "15_30kg";
  return "30_40kg";
}

/** Traductions des refus de la base, par nom de contrainte. */
const MESSAGES_CONTRAINTE: Record<string, string> = {
  chiens_sexe_check: "Le sexe doit être « Mâle » ou « Femelle ».",
  chiens_categorie_poids_check: "La catégorie de poids n'est pas valide.",
  chiens_sterilisation_check: "La stérilisation doit être « oui », « non » ou « chimique ».",
  chiens_statut_essai_check: "Le statut de journée d'essai n'est pas valide.",
  chiens_hebergement_autorise_check: "Le mode d'hébergement n'est pas valide.",
  chiens_cohabitation_source_check: "L'origine de la décision de cohabitation n'est pas valide.",
  clients_email_key: "Un client existe déjà avec cette adresse e-mail.",
  chiens_numero_puce_key: "Un chien porte déjà ce numéro de puce.",
};

export const MESSAGE_ENREGISTREMENT_REFUSE =
  "L'enregistrement a été refusé. Vérifiez les informations saisies.";

/**
 * Message lisible pour un refus de la base. On ne renvoie JAMAIS le texte
 * Postgres : il nomme des tables et des contraintes, et n'aide personne.
 */
export function messageErreurBase(
  erreur: { message?: string; code?: string; details?: string } | null | undefined,
  defaut: string = MESSAGE_ENREGISTREMENT_REFUSE
): string {
  if (!erreur) return defaut;
  const texte = `${erreur.message ?? ""} ${erreur.details ?? ""}`;
  for (const [contrainte, message] of Object.entries(MESSAGES_CONTRAINTE)) {
    if (texte.includes(contrainte)) return message;
  }
  if (erreur.code === "23505") return "Cette valeur existe déjà.";
  return defaut;
}
