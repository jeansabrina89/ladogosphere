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

import { HORAIRES_DEFAUT, bornes, heureLongue } from "@/src/lib/horaires";

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

// ---------------------------------------------------------------------------
// Une seule journée d'essai par jour
// ---------------------------------------------------------------------------

/**
 * Statuts de réservation qui « occupent » la journée d'essai du jour.
 * Une réservation annulée, refusée ou terminée ne bloque plus la date.
 */
export const STATUTS_ESSAI_OCCUPANT = ["en_attente", "validee"] as const;

export const MESSAGE_DATE_ESSAI_PRISE =
  "Cette date est déjà prise pour une journée d'essai, choisissez-en une autre.";

/**
 * Heure d'arrivée de la journée d'essai ordinaire (le tunnel client la fixe) :
 * la PREMIÈRE heure du réglage « Journée d'essai — arrivée » (APP 64). Avec le
 * réglage de départ, 10:00.
 */
export function heureEssaiStandard(
  essaiArrivee: string | null | undefined = HORAIRES_DEFAUT.essaiArrivee,
): string {
  return bornes(essaiArrivee, HORAIRES_DEFAUT.essaiArrivee)!.debut;
}

/** L'heure du réglage de départ, pour qui n'a pas le réglage sous la main. */
export const HEURE_ESSAI_STANDARD = heureEssaiStandard();

/**
 * La plage où l'administration peut FORCER une seconde journée d'essai.
 *
 * Ces deux bornes ne sont PAS un horaire d'accueil : c'est la fenêtre que
 * l'équipe se donne pour caser un deuxième essai autour du premier. Elles
 * restent écrites ici (APP 64, liste blanche du test de garde), et seule
 * l'heure EXCLUE suit le réglage.
 */
export const PLAGE_ESSAI_FORCE = { debut: "09:30", fin: "11:00" } as const;

/**
 * Créneaux ouverts à une SECONDE journée d'essai forcée par l'admin : toutes
 * les demi-heures de la plage, sauf l'heure standard — celle de l'essai
 * ordinaire, qui suit le réglage. Avec 10:00 : 09:30, 10:30, 11:00.
 */
export function creneauxEssaiForce(heureStandard: string = HEURE_ESSAI_STANDARD): string[] {
  const minutes = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
  const res: string[] = [];
  for (let m = minutes(PLAGE_ESSAI_FORCE.debut); m <= minutes(PLAGE_ESSAI_FORCE.fin); m += 30) {
    const h = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    if (h !== heureStandard) res.push(h);
  }
  return res;
}

export const CRENEAUX_ESSAI_FORCE: readonly string[] = creneauxEssaiForce();

/**
 * Les deux phrases de la fiche du personnel sur le forçage d'un second essai,
 * tirées des mêmes créneaux — elles ne peuvent donc plus dire autre chose que
 * la liste proposée. Avec 10:00 : « 9h30, 10h30 et 11h00 » et « entre 9h30 et
 * 11h00, hors 10h00 », mot pour mot comme avant APP 64.
 */
export function phrasesEssaiForce(heureStandard: string = HEURE_ESSAI_STANDARD): {
  tousPris: string;
  aide: string;
} {
  const liste = creneauxEssaiForce(heureStandard).map(heureLongue);
  const enumeration = liste.length <= 1
    ? liste.join("")
    : `${liste.slice(0, -1).join(", ")} et ${liste[liste.length - 1]}`;
  return {
    tousPris: `Plus aucun créneau disponible ce jour-là (${enumeration} sont pris).`,
    aide: `Créneaux de 30 minutes entre ${heureLongue(PLAGE_ESSAI_FORCE.debut)} et `
      + `${heureLongue(PLAGE_ESSAI_FORCE.fin)}, hors ${heureLongue(heureStandard)} et hors créneaux déjà pris.`,
  };
}

/**
 * Règle métier (pure) : la pension n'accueille qu'UNE journée d'essai par jour.
 * Plusieurs chiens du même propriétaire sur la même réservation ne comptent que
 * pour une journée — c'est bien le nombre de RÉSERVATIONS d'essai qui compte.
 */
export function dateEssaiDisponible(nbEssaisDejaPrevus: number): boolean {
  return nbEssaisDejaPrevus === 0;
}

/** Cette réservation occupe-t-elle la journée d'essai de sa date ? */
export function reservationEssaiOccupeLaDate(
  r: { type_reservation?: string | null; statut?: string | null } | null | undefined
): boolean {
  if (r?.type_reservation !== "essai") return false;
  return (STATUTS_ESSAI_OCCUPANT as readonly string[]).includes(r?.statut ?? "");
}

/** Normalise une heure ("10:00:00" → "10:00"). */
export function heureCourte(heure?: string | null): string | null {
  if (!heure) return null;
  return heure.slice(0, 5);
}

/**
 * Créneaux encore libres pour forcer une seconde journée d'essai, compte tenu
 * des heures déjà occupées par les essais du jour.
 */
export function creneauxEssaiDisponibles(
  heuresOccupees: (string | null | undefined)[],
  heureStandard: string = HEURE_ESSAI_STANDARD,
): string[] {
  const prises = new Set(heuresOccupees.map(heureCourte).filter(Boolean) as string[]);
  return creneauxEssaiForce(heureStandard).filter((c) => !prises.has(c));
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
