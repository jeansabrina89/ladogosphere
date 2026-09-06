/**
 * Journée d'essai — statut par CHIEN.
 *
 * `chiens.statut_essai` est la source de vérité :
 *  - non_programme   : aucune journée d'essai prévue ;
 *  - programme       : une journée d'essai est réservée (validée par la pension) ;
 *  - seconde_journee : l'essai a eu lieu, une seconde journée est nécessaire ;
 *  - valide          : le chien est accepté à la pension ;
 *  - refuse          : le chien n'est pas accepté.
 *
 * Les colonnes historiques `journee_essai_effectuee` / `journee_essai_invalide`
 * restent alimentées, mais par un trigger SQL à partir de `statut_essai` :
 * elles ne doivent plus être écrites ni interrogées par le code applicatif.
 */

export const STATUTS_ESSAI = [
  "non_programme",
  "programme",
  "seconde_journee",
  "valide",
  "refuse",
] as const;

export type StatutEssai = (typeof STATUTS_ESSAI)[number];

/** Résultats saisissables au départ d'une journée d'essai. */
export const RESULTATS_ESSAI = ["valide", "seconde_journee", "refuse"] as const;
export type ResultatEssai = (typeof RESULTATS_ESSAI)[number];

export const LIBELLES_RESULTAT: Record<ResultatEssai, string> = {
  valide: "Validé",
  seconde_journee: "Seconde journée à prévoir",
  refuse: "Refusé",
};

export const TELEPHONE_PENSION = "079 453 03 05";

export function estResultatEssai(v: unknown): v is ResultatEssai {
  return typeof v === "string" && (RESULTATS_ESSAI as readonly string[]).includes(v);
}

export function estStatutEssai(v: unknown): v is StatutEssai {
  return typeof v === "string" && (STATUTS_ESSAI as readonly string[]).includes(v);
}

/** Statut d'un chien, avec repli sûr sur `non_programme`. */
export function statutEssaiDe(chien: { statut_essai?: string | null } | null | undefined): StatutEssai {
  return estStatutEssai(chien?.statut_essai) ? chien!.statut_essai as StatutEssai : "non_programme";
}

export type DecisionReservation = {
  autorise: boolean;
  /** Raison du refus, sans le nom du chien (null si autorisé). */
  raison: string | null;
};

/**
 * Règle métier pure : ce chien peut-il faire l'objet d'une réservation de ce type ?
 *
 * - journée / séjour : uniquement un chien `valide` ;
 * - journée d'essai  : uniquement `non_programme` ou `seconde_journee`
 *   (un essai déjà réservé ou déjà validé ne se réinscrit pas ; un refus est définitif).
 */
export function chienReservablePour(
  statut: StatutEssai,
  type_reservation: string
): DecisionReservation {
  if (statut === "refuse") {
    return { autorise: false, raison: "non_accepte" };
  }

  if (type_reservation === "essai") {
    if (statut === "non_programme" || statut === "seconde_journee") {
      return { autorise: true, raison: null };
    }
    if (statut === "programme") return { autorise: false, raison: "essai_deja_reserve" };
    return { autorise: false, raison: "essai_deja_valide" };
  }

  // Journée, séjour, et tout autre type de prestation.
  if (statut === "valide") return { autorise: true, raison: null };
  if (statut === "seconde_journee") return { autorise: false, raison: "seconde_journee_requise" };
  if (statut === "programme") return { autorise: false, raison: "essai_en_cours" };
  return { autorise: false, raison: "essai_requis" };
}

/** Message affiché au client, nommant le chien concerné. */
export function messageRefusChien(nom: string, raison: string | null): string {
  switch (raison) {
    case "non_accepte":
      return `Nous ne pouvons pas accueillir ${nom}. Appelez-nous au ${TELEPHONE_PENSION} pour en parler.`;
    case "seconde_journee_requise":
      return `${nom} doit d'abord faire sa seconde journée d'essai.`;
    case "essai_en_cours":
      return `La journée d'essai de ${nom} est déjà réservée : attendons son résultat.`;
    case "essai_requis":
      return `${nom} doit d'abord faire sa journée d'essai.`;
    case "essai_deja_reserve":
      return `Une journée d'essai est déjà réservée pour ${nom}.`;
    case "essai_deja_valide":
      return `${nom} a déjà validé sa journée d'essai.`;
    default:
      return `${nom} ne peut pas être ajouté à cette réservation.`;
  }
}

/** Vérifie une sélection entière ; renvoie le premier refus rencontré. */
export function verifierSelectionChiens(
  chiens: { nom: string; statut_essai?: string | null }[],
  type_reservation: string
): { ok: true } | { ok: false; message: string } {
  for (const chien of chiens) {
    const d = chienReservablePour(statutEssaiDe(chien), type_reservation);
    if (!d.autorise) {
      return { ok: false, message: messageRefusChien(chien.nom, d.raison) };
    }
  }
  return { ok: true };
}

/**
 * Colonnes historiques dérivées du statut — miroir exact du trigger SQL
 * `chiens_synchroniser_flags_essai`. Sert de documentation et de test.
 */
export function flagsHistoriques(statut: StatutEssai): {
  journee_essai_effectuee: boolean;
  journee_essai_invalide: boolean;
} {
  return {
    journee_essai_effectuee: statut === "valide" || statut === "refuse" || statut === "seconde_journee",
    journee_essai_invalide: statut === "refuse",
  };
}

/** Reprise des données existantes : anciens booléens → statut. */
export function statutDepuisFlags(
  journee_essai_effectuee: boolean | null | undefined,
  journee_essai_invalide: boolean | null | undefined
): StatutEssai {
  if (journee_essai_effectuee && journee_essai_invalide) return "refuse";
  if (journee_essai_effectuee) return "valide";
  return "non_programme";
}

/** Libellé d'état affiché au client sur la fiche du chien. */
export type EtatClientChien = {
  texte: string;
  ton: "neutre" | "attention" | "succes" | "refus";
  /** Le client peut-il lancer une réservation pour ce chien ? */
  reservable: boolean;
};

export function etatClientChien(
  statut: StatutEssai,
  nom: string,
  dateEssaiPrevue?: string | null
): EtatClientChien {
  switch (statut) {
    case "valide":
      return { texte: "Validé", ton: "succes", reservable: true };
    case "refuse":
      return {
        texte: `Nous ne pouvons pas accueillir ${nom}. Appelez-nous au ${TELEPHONE_PENSION} pour en parler.`,
        ton: "refus",
        reservable: false,
      };
    case "seconde_journee":
      return { texte: "Seconde journée d'essai à prévoir", ton: "attention", reservable: true };
    case "programme":
      return {
        texte: dateEssaiPrevue
          ? `Journée d'essai le ${formatJourMois(dateEssaiPrevue)}`
          : "Journée d'essai réservée",
        ton: "neutre",
        reservable: false,
      };
    default:
      return { texte: "Journée d'essai à réserver", ton: "attention", reservable: true };
  }
}

/** "2026-09-07" → "07.09" */
export function formatJourMois(dateISO: string): string {
  const [, mois, jour] = dateISO.slice(0, 10).split("-");
  return jour && mois ? `${jour}.${mois}` : dateISO;
}
