/**
 * Les prestations aux locataires de box : ce qui se décide sans base.
 *
 * Un locataire de box loue un box à la propriétaire. Son chien y vit. La société
 * lui vend des services autour — passages, repas, nettoyages, balades — et,
 * quand il part, la garde complète de son chien DANS SON PROPRE BOX.
 *
 * Rien de tout cela n'est une réservation. Aucun box de la pension n'est
 * occupé, aucun tarif d'hébergement ne s'applique, aucune adhésion n'est due.
 * C'est pourquoi ces règles vivent ici, et non dans celles de la pension : les
 * confondre ferait mentir tous les chiffres qui les lisent.
 *
 * Fonction pure : ni base, ni requête.
 */

// ── Qui voit ce catalogue ─────────────────────────────────────────────────

export type FicheLocataire = {
  locataire_box?: boolean | null;
  box_loue?: string | null;
  loyer_refacture?: number | string | null;
  locataire_depuis?: string | null;
  locataire_jusqu_au?: string | null;
};

/**
 * Le catalogue s'ouvre au seul drapeau `locataire_box`.
 *
 * Un client de la pension ne voit ni l'entrée de menu, ni les formules, ni les
 * prix — et surtout, rien de tout cela ne part dans le corps de sa réponse.
 * Cette fonction est la porte ; les chargeurs d'écran l'appellent AVANT de
 * lire quoi que ce soit, pas après pour cacher ce qu'ils ont déjà chargé.
 */
export function catalogueVisible(fiche: FicheLocataire | null | undefined): boolean {
  return fiche?.locataire_box === true;
}

export const MESSAGE_RESERVE_LOCATAIRES =
  "Les prestations sont réservées aux locataires de box.";

/**
 * Un locataire de box ne paie AUCUNE adhésion.
 *
 * Il n'utilise ni la journée d'essai, ni la validation du chien, ni les
 * réservations : lui facturer une adhésion serait un péage sans contrepartie.
 * Elle reste possible et volontaire s'il veut la remise boutique — il devient
 * alors aussi client de la pension, et les deux statuts cohabitent.
 */
export function adhesionExigee(fiche: FicheLocataire | null | undefined): boolean {
  return !catalogueVisible(fiche);
}

// ── Les unités du catalogue ───────────────────────────────────────────────

export type UnitePrestation =
  | "passage" | "repas" | "nettoyage" | "balade" | "journee" | "autre";

export const UNITES_PRESTATION: {
  valeur: UnitePrestation;
  libelle: string;
  aide: string;
  /** Une prise en charge de 24 h, sur une plage de dates. */
  garde: boolean;
}[] = [
  { valeur: "passage", libelle: "Passage", aide: "Une visite : sortie rapide, contrôle, eau et croquettes.", garde: false },
  { valeur: "repas", libelle: "Repas", aide: "Un repas préparé et donné.", garde: false },
  { valeur: "nettoyage", libelle: "Nettoyage", aide: "Le box nettoyé.", garde: false },
  { valeur: "balade", libelle: "Balade", aide: "Une sortie promenade, avec sa durée.", garde: false },
  {
    valeur: "journee",
    libelle: "Journée de garde",
    aide:
      "La prise en charge complète pendant l'absence du locataire. Le chien reste " +
      "dans SON box : ce n'est ni un séjour en pension, ni une simple sortie.",
    garde: true,
  },
  { valeur: "autre", libelle: "Autre", aide: "Tout le reste, décrit à la main.", garde: false },
];

export function unitePrestation(valeur: string | null | undefined): UnitePrestation {
  return UNITES_PRESTATION.some((u) => u.valeur === valeur)
    ? (valeur as UnitePrestation)
    : "autre";
}

export function infoUnite(valeur: string | null | undefined) {
  return UNITES_PRESTATION.find((u) => u.valeur === unitePrestation(valeur))!;
}

export function libelleUnite(valeur: string | null | undefined): string {
  return infoUnite(valeur).libelle;
}

/**
 * Cette prestation est-elle une garde complète ?
 *
 * C'est le SEUL cas où la pension répond d'un chien 24 h sans qu'il soit dans
 * un box de la pension. Elle se saisit sur une plage de dates et se marque
 * distinctement partout où elle s'affiche.
 */
export function estGarde(unite: string | null | undefined): boolean {
  return infoUnite(unite).garde;
}

export const MENTION_GARDE =
  "Garde complète : le chien reste dans son box, la pension en répond 24 h.";

export const MENTION_HORS_PENSION =
  "Ces chiens n'occupent aucun box de la pension et n'entrent dans aucun taux d'occupation.";

// ── Les jours de la semaine ───────────────────────────────────────────────

export const JOURS_SEMAINE = [
  "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche",
] as const;

export type JourSemaine = (typeof JOURS_SEMAINE)[number];

export function jourValide(brut: unknown): JourSemaine | null {
  const j = String(brut ?? "").trim().toLowerCase();
  return (JOURS_SEMAINE as readonly string[]).includes(j) ? (j as JourSemaine) : null;
}

/** Les jours d'une saisie, dédoublonnés et remis dans l'ordre de la semaine. */
export function joursValides(bruts: readonly unknown[] | null | undefined): JourSemaine[] {
  const vus = new Set<JourSemaine>();
  for (const b of bruts ?? []) {
    const j = jourValide(b);
    if (j) vus.add(j);
  }
  return JOURS_SEMAINE.filter((j) => vus.has(j));
}

/** Le jour de la semaine d'une date ISO, sans passer par le fuseau local. */
export function jourDe(dateISO: string): JourSemaine {
  const d = new Date(`${dateISO.slice(0, 10)}T12:00:00Z`);
  // getUTCDay : 0 = dimanche. La semaine commence le lundi.
  return JOURS_SEMAINE[(d.getUTCDay() + 6) % 7];
}

/**
 * La clé de semaine ISO d'une date : « 2026-W38 ».
 *
 * C'est elle qui indexe `jours_personnalises`. Une clé lisible dans un JSON
 * qu'on ouvrira un jour à la main vaut mieux qu'un numéro nu.
 */
export function cleSemaine(dateISO: string): string {
  const d = new Date(`${dateISO.slice(0, 10)}T12:00:00Z`);
  const jour = (d.getUTCDay() + 6) % 7;
  // Le jeudi de la semaine décide de l'année ISO.
  d.setUTCDate(d.getUTCDate() - jour + 3);
  const annee = d.getUTCFullYear();
  const premierJeudi = new Date(Date.UTC(annee, 0, 4));
  const decalage = (premierJeudi.getUTCDay() + 6) % 7;
  premierJeudi.setUTCDate(premierJeudi.getUTCDate() - decalage + 3);
  const semaine = 1 + Math.round((d.getTime() - premierJeudi.getTime()) / (7 * 86400000));
  return `${annee}-W${String(semaine).padStart(2, "0")}`;
}

/** Une date ISO décalée, sans passer par le fuseau local. */
export function decalerJour(dateISO: string, n: number): string {
  const d = new Date(`${dateISO.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Les dates d'une plage, bornes comprises. Vide si la fin précède le début. */
export function datesDe(debut: string, fin: string): string[] {
  const dates: string[] = [];
  let jour = debut.slice(0, 10);
  const dernier = fin.slice(0, 10);
  // Garde-fou : une plage absurde rend une liste vide, jamais une boucle infinie.
  for (let i = 0; jour <= dernier && i < 4000; i += 1) {
    dates.push(jour);
    jour = decalerJour(jour, 1);
  }
  return dates;
}

// ── Les trois réglages que Sabrina n'a pas encore tranchés ────────────────

export type ReglagesPrestations = {
  /** Le forfait est-il encaissé d'avance, ou à terme échu ? */
  forfaitEcheance: "avance" | "terme_echu";
  /** Les jours d'absence du locataire sont-ils déduits du forfait ? */
  absenceDeduite: boolean;
  /** Le locataire peut-il commander une prestation ponctuelle lui-même ? */
  commandeLocataire: boolean;
};

export const REGLAGES_PAR_DEFAUT: ReglagesPrestations = {
  forfaitEcheance: "terme_echu",
  absenceDeduite: false,
  commandeLocataire: true,
};

export const CLES_REGLAGES = {
  forfaitEcheance: "prestations_forfait_echeance",
  absenceDeduite: "prestations_absence_deduite",
  commandeLocataire: "prestations_commande_locataire",
} as const;

/** Les réglages lus depuis `parametres`, avec leurs valeurs par défaut. */
export function reglagesDepuisParametres(
  lignes: readonly { cle: string; valeur: string }[] | null | undefined
): ReglagesPrestations {
  const par = new Map((lignes ?? []).map((l) => [l.cle, String(l.valeur ?? "").trim()]));
  const echeance = par.get(CLES_REGLAGES.forfaitEcheance);
  return {
    forfaitEcheance: echeance === "avance" ? "avance" : "terme_echu",
    absenceDeduite: par.get(CLES_REGLAGES.absenceDeduite) === "oui",
    // Le défaut est « oui » : seul un « non » explicite ferme la commande.
    commandeLocataire: par.get(CLES_REGLAGES.commandeLocataire) !== "non",
  };
}

// ── Le statut d'une tâche ─────────────────────────────────────────────────

export type StatutTache = "a_faire" | "faite" | "annulee";

export const MOTIF_ANNULATION_REQUIS =
  "Indiquez pourquoi cette prestation n'a pas eu lieu : c'est ce motif qui la sort " +
  "de la facture, et il peut y figurer en note.";

export function refusAnnulation(motif: string | null | undefined): string | null {
  return String(motif ?? "").trim() === "" ? MOTIF_ANNULATION_REQUIS : null;
}

/** Une tâche entre-t-elle dans le décompte du mois ? */
export function tacheFacturable(t: {
  statut?: string | null;
  facturable?: boolean | null;
}): boolean {
  return t.facturable === true && t.statut === "faite";
}
