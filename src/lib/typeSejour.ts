/**
 * Pourquoi le chien est là — et ce que cela change aux chiffres.
 *
 * Deux règles OPPOSÉES vivent ici, et c'est tout l'intérêt de les écrire au
 * même endroit :
 *
 *   · Les CHIFFRES D'ACTIVITÉ ne comptent que « pension ». Chiffre d'affaires,
 *     nuitées facturées, panier moyen, comparaison annuelle : un accueil
 *     gratuit n'est pas une vente, et le faire entrer dans une moyenne la rend
 *     fausse — vers le bas pour le panier, vers le haut pour le volume.
 *
 *   · La DISPONIBILITÉ compte TOUT. Vérification de place, suggestion de box,
 *     planning, chiens du jour, check-in, calendrier : rien n'est filtré. Une
 *     place prise est une place prise, quelle qu'en soit la raison. Un chien
 *     abandonné dort dans un vrai box ; l'oublier, c'est promettre une place
 *     qui n'existe pas.
 *
 * Le filtre d'activité est cette fonction-ci, et elle seule. Répété écran par
 * écran, il finirait par être vrai à quatre endroits sur cinq.
 *
 * Fonction pure : ni base, ni requête.
 */

export type TypeSejour = "pension" | "personnel" | "urgence" | "abandon";

export const TYPE_SEJOUR_PAR_DEFAUT: TypeSejour = "pension";

/** Comment se facture chaque type. Aucune de ces règles n'est nouvelle. */
export type ReglesFacturation = {
  /** Le montant part à zéro et y reste, sauf saisie explicite. */
  gratuitParDefaut: boolean;
  /** Le tarif appliqué quand il y en a un. */
  tarif: "normal" | "urgence" | "aucun";
  /** Sabrina peut-elle inscrire un montant à la main ? */
  montantLibre: boolean;
  /** L'adhésion est-elle exigée pour réserver ? */
  adhesionRequise: boolean;
  /** La journée d'essai est-elle proposée ? */
  essaiPropose: boolean;
};

export const TYPES_SEJOUR: {
  valeur: TypeSejour;
  libelle: string;
  aide: string;
  /** Entre-t-il dans le chiffre d'affaires et les moyennes ? */
  compteDansActivite: boolean;
  facturation: ReglesFacturation;
  /** Pastille de liste : une couleur et un mot. */
  pastille: string;
  couleur: string;
  fond: string;
}[] = [
  {
    valeur: "pension",
    libelle: "Pension",
    aide: "Un client qui paie. C'est l'activité de la maison, et le seul type qui entre dans les chiffres.",
    compteDansActivite: true,
    facturation: {
      gratuitParDefaut: false,
      tarif: "normal",
      montantLibre: true,
      adhesionRequise: true,
      essaiPropose: true,
    },
    pastille: "Pension",
    couleur: "#1B2B5E",
    fond: "#E4E7F0",
  },
  {
    valeur: "personnel",
    libelle: "Personnel",
    aide:
      "Le chien d'un membre de l'équipe. Gratuit, sans adhésion ni journée d'essai — " +
      "c'est le comportement des fiches internes, inchangé.",
    compteDansActivite: false,
    facturation: {
      gratuitParDefaut: true,
      tarif: "aucun",
      montantLibre: false,
      adhesionRequise: false,
      essaiPropose: false,
    },
    pastille: "⭐ Personnel",
    couleur: "#6E5410",
    fond: "#F4EAC9",
  },
  {
    valeur: "urgence",
    libelle: "Urgence",
    aide: "Un accueil en urgence, au tarif d'urgence réduit déjà en place.",
    compteDansActivite: false,
    facturation: {
      gratuitParDefaut: false,
      tarif: "urgence",
      montantLibre: true,
      adhesionRequise: false,
      essaiPropose: false,
    },
    pastille: "🚨 Urgence",
    couleur: "#A8453A",
    fond: "#FBE2DE",
  },
  {
    valeur: "abandon",
    libelle: "Abandon",
    aide:
      "Un chien abandonné. Gratuit par défaut, mais un refuge ou une commune peut " +
      "participer : le montant reste libre.",
    compteDansActivite: false,
    facturation: {
      gratuitParDefaut: true,
      tarif: "aucun",
      montantLibre: true,
      adhesionRequise: false,
      essaiPropose: false,
    },
    pastille: "🏠 Abandon",
    couleur: "#1F6E5B",
    fond: "#DFF0E8",
  },
];

export function typeSejour(valeur: string | null | undefined): TypeSejour {
  return TYPES_SEJOUR.some((t) => t.valeur === valeur)
    ? (valeur as TypeSejour)
    : TYPE_SEJOUR_PAR_DEFAUT;
}

export function infoTypeSejour(valeur: string | null | undefined) {
  const v = typeSejour(valeur);
  return TYPES_SEJOUR.find((t) => t.valeur === v)!;
}

export function libelleTypeSejour(valeur: string | null | undefined): string {
  return infoTypeSejour(valeur).libelle;
}

export function reglesFacturation(valeur: string | null | undefined): ReglesFacturation {
  return infoTypeSejour(valeur).facturation;
}

// ── La règle des chiffres : « pension » et rien d'autre ────────────────────

/**
 * Ce séjour entre-t-il dans les chiffres d'activité ?
 *
 * C'est LE filtre. Chiffre d'affaires, nuitées facturées, taux d'occupation
 * payant, panier moyen, comparaison annuelle : tous passent par ici.
 */
export function compteDansActivite(valeur: string | null | undefined): boolean {
  return infoTypeSejour(valeur).compteDansActivite;
}

/** Le même filtre, appliqué à une liste. */
export function filtrerActivite<T extends { type_sejour?: string | null }>(
  lignes: readonly T[]
): T[] {
  return lignes.filter((l) => compteDansActivite(l.type_sejour));
}

/** Ce qui N'entre PAS dans les chiffres — les accueils non facturés. */
export function filtrerNonFactures<T extends { type_sejour?: string | null }>(
  lignes: readonly T[]
): T[] {
  return lignes.filter((l) => !compteDansActivite(l.type_sejour));
}

// ── La règle inverse : tout occupe un box ─────────────────────────────────

/**
 * Un séjour occupe-t-il un box ? TOUJOURS, quel que soit son type.
 *
 * La fonction ne rend jamais autre chose que `true`, et c'est exprès : elle
 * existe pour qu'on la trouve en cherchant, et pour qu'un écran de
 * disponibilité qui se demanderait s'il doit filtrer tombe sur la réponse
 * écrite plutôt que sur un doute.
 */
export function occupeUnBox(valeur?: string | null): true {
  // La valeur est reçue pour que l’appel se lise, puis délibérément ignorée :
  // aucun des quatre types ne libère de place, et un type illisible non plus.
  void valeur;
  return true;
}

export const MENTION_OCCUPATION_TOUS_TYPES =
  "Tous les types de séjour occupent un box : une place prise est une place prise.";

// ── Ce qui se propose, et ce qui se refuse ────────────────────────────────

/**
 * Le type proposé à la création. Une fiche interne accueille un chien du
 * personnel — le reste est de la pension jusqu'à preuve du contraire.
 */
export function typeSejourPropose({ ficheInterne }: { ficheInterne: boolean }): TypeSejour {
  return ficheInterne ? "personnel" : "pension";
}

/** Les types qu'une personne a le droit de poser, selon ses permissions. */
export function typesSejourAutorises({
  peutTarifsUrgence,
}: {
  peutTarifsUrgence: boolean;
}): TypeSejour[] {
  return TYPES_SEJOUR.filter(
    (t) => peutTarifsUrgence || (t.valeur !== "urgence" && t.valeur !== "abandon")
  ).map((t) => t.valeur);
}

export const MESSAGE_TYPE_RESERVE =
  "Les séjours « Urgence » et « Abandon » demandent la permission des tarifs d'urgence : " +
  "ils sortent du chiffre d'affaires, on ne s'y qualifie pas soi-même.";

/**
 * Un employé ne se qualifie pas lui-même en « urgence » ou « abandon » : ce
 * sont les deux types qui SORTENT une réservation du chiffre d'affaires, et
 * décider de ne pas facturer n'est pas un geste de comptoir.
 */
export function refusTypeSejour({
  type,
  peutTarifsUrgence,
}: {
  type: string | null | undefined;
  peutTarifsUrgence: boolean;
}): string | null {
  if (!TYPES_SEJOUR.some((t) => t.valeur === type)) {
    return "Choisissez le type de séjour.";
  }
  if (!typesSejourAutorises({ peutTarifsUrgence }).includes(type as TypeSejour)) {
    return MESSAGE_TYPE_RESERVE;
  }
  return null;
}

// ── La requalification ────────────────────────────────────────────────────

export const MOTIF_REQUALIFICATION_REQUIS =
  "Indiquez pourquoi ce séjour change de type : la requalification déplace des " +
  "montants hors du chiffre d'affaires, elle doit pouvoir s'expliquer.";

/**
 * Changer le type d'un séjour déjà créé n'est pas une correction de saisie :
 * c'est une décision qui déplace des chiffres. Motif obligatoire, trace au
 * journal.
 */
export function refusRequalification({
  avant,
  apres,
  motif,
  peutTarifsUrgence,
}: {
  avant: string | null | undefined;
  apres: string | null | undefined;
  motif: string | null | undefined;
  peutTarifsUrgence: boolean;
}): string | null {
  const refus = refusTypeSejour({ type: apres, peutTarifsUrgence });
  if (refus) return refus;
  if (typeSejour(avant) === typeSejour(apres)) return null;
  if (String(motif ?? "").trim() === "") return MOTIF_REQUALIFICATION_REQUIS;
  return null;
}

export const EVENEMENT_REQUALIFICATION = "type_sejour";

// ── Les compteurs d'accueils non facturés ─────────────────────────────────

export type ComptesNonFactures = {
  personnel: number;
  urgence: number;
  abandon: number;
  total: number;
};

/**
 * Les trois compteurs du tableau de bord. Ils se lisent À CÔTÉ du chiffre
 * d'affaires, jamais dedans : c'est de la charge de travail, pas de la vente.
 */
export function comptesNonFactures<T extends { type_sejour?: string | null }>(
  lignes: readonly T[]
): ComptesNonFactures {
  const compte = { personnel: 0, urgence: 0, abandon: 0, total: 0 };
  for (const l of lignes) {
    const t = typeSejour(l.type_sejour);
    if (t === "pension") continue;
    compte[t] += 1;
    compte.total += 1;
  }
  return compte;
}

// ── Les deux taux d'occupation ────────────────────────────────────────────

export const LIBELLE_OCCUPATION_REELLE = "Occupation réelle";
export const LIBELLE_OCCUPATION_PAYANTE = "Occupation payante";

export const AIDE_OCCUPATION_REELLE =
  "Tous types de séjour confondus. C'est la charge de travail : les box réellement occupés.";
export const AIDE_OCCUPATION_PAYANTE =
  "Séjours de pension seuls. C'est l'activité : ce que la maison a vendu.";

export type DeuxTaux = {
  /** Tous types : ce qu'il a fallu tenir. */
  reelle: number;
  /** Pension seule : ce qui a été vendu. */
  payante: number;
};

/**
 * Les deux taux, ensemble et nommés.
 *
 * Un seul chiffre serait faux dans les deux sens : « 90 % » en comptant tout
 * laisse croire à une bonne saison alors qu'un tiers des box est gratuit ;
 * « 60 % » en ne comptant que la pension laisse croire qu'il reste de la place
 * et du temps, alors que la maison est pleine. Deux chiffres se comprennent.
 *
 * `capacite` est un nombre de box-jours disponibles : zéro rend zéro plutôt
 * qu'une division par zéro.
 */
export function tauxOccupation({
  boxJoursTous,
  boxJoursPension,
  capacite,
}: {
  boxJoursTous: number;
  boxJoursPension: number;
  capacite: number;
}): DeuxTaux {
  if (!(capacite > 0)) return { reelle: 0, payante: 0 };
  const pour = (n: number) => Math.round((Math.max(n, 0) / capacite) * 1000) / 10;
  return { reelle: pour(boxJoursTous), payante: pour(boxJoursPension) };
}

// ── La ventilation par type, en lecture seule ─────────────────────────────

export type LigneVentilationSejour = {
  type: TypeSejour;
  libelle: string;
  nb: number;
  nuitees: number;
  montant: number;
  compteDansActivite: boolean;
};

export type VentilationSejours = {
  /** Les quatre types, toujours, dans l'ordre — même à zéro. */
  lignes: LigneVentilationSejour[];
  totalNb: number;
  totalNuitees: number;
  totalMontant: number;
  /** Ce qui entre dans les produits : la pension seule. */
  activiteNb: number;
  activiteNuitees: number;
  activiteMontant: number;
  /** Ce qui n'y entre pas, et qu'on lit à côté. */
  nonFacturesNb: number;
  nonFacturesNuitees: number;
  nonFacturesMontant: number;
};

/**
 * Ce que l'exercice a accueilli, type par type.
 *
 * C'est une LECTURE : aucune écriture n'en découle, aucun montant n'est
 * recalculé. Un séjour gratuit ne produit toujours aucun produit — la
 * ventilation le montre, elle ne le change pas. Son intérêt est justement
 * là : voir en un tableau que les trois colonnes non facturées pèsent zéro
 * franc et beaucoup de nuitées.
 */
export function ventilerParTypeSejour(
  lignes: readonly {
    type_sejour?: string | null;
    nuitees?: number | null;
    montant?: number | null;
  }[]
): VentilationSejours {
  const par = new Map<TypeSejour, LigneVentilationSejour>(
    TYPES_SEJOUR.map((t) => [
      t.valeur,
      {
        type: t.valeur,
        libelle: t.libelle,
        nb: 0,
        nuitees: 0,
        montant: 0,
        compteDansActivite: t.compteDansActivite,
      },
    ])
  );

  for (const l of lignes) {
    const ligne = par.get(typeSejour(l.type_sejour))!;
    ligne.nb += 1;
    ligne.nuitees += Math.max(Number(l.nuitees ?? 0), 0);
    ligne.montant += Number(l.montant ?? 0);
  }

  const toutes = [...par.values()].map((l) => ({
    ...l,
    montant: Math.round(l.montant * 100) / 100,
  }));
  const somme = (
    choisies: LigneVentilationSejour[],
    champ: "nb" | "nuitees" | "montant"
  ) => Math.round(choisies.reduce((s, l) => s + l[champ], 0) * 100) / 100;
  const activite = toutes.filter((l) => l.compteDansActivite);
  const gratuites = toutes.filter((l) => !l.compteDansActivite);

  return {
    lignes: toutes,
    totalNb: somme(toutes, "nb"),
    totalNuitees: somme(toutes, "nuitees"),
    totalMontant: somme(toutes, "montant"),
    activiteNb: somme(activite, "nb"),
    activiteNuitees: somme(activite, "nuitees"),
    activiteMontant: somme(activite, "montant"),
    nonFacturesNb: somme(gratuites, "nb"),
    nonFacturesNuitees: somme(gratuites, "nuitees"),
    nonFacturesMontant: somme(gratuites, "montant"),
  };
}
