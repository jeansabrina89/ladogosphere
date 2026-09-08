import { type Secteur, type Ventilation } from "@/src/lib/tvaLogique";

/**
 * Le décompte TVA : périodes, méthode, écriture, et le seuil des 10 %.
 *
 * Fonction pure, sans base. Aucun TAUX DE DETTE FISCALE NETTE n'est écrit ici,
 * ni ailleurs dans le code : ces taux sont attribués par l'AFC à chaque
 * entreprise, ils ne se devinent pas et ils ne s'illustrent pas. Ils arrivent
 * SAISIS, depuis `parametres_tva`. Si l'un manque, le décompte refuse de
 * calculer et dit lequel — c'est le seul comportement honnête.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;

const nb = (v: unknown): number => {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

// ── Comptes ────────────────────────────────────────────────────────────────

export const COMPTE_TVA_DUE = "2200";
export const COMPTE_IMPOT_PREALABLE = "1170";
/** Réduction de produit : la dette fiscale nette n'est pas une charge. */
export const COMPTE_DECOMPTE_TDFN = "3806";
export const COMPTE_BANQUE = "1020";

// ── Paramètres ─────────────────────────────────────────────────────────────

export type MethodeTva = "tdfn" | "effective";
/**
 * Sur quelle base la TVA est due.
 *
 * « reçues » : à l'ENCAISSEMENT — le régime usuel avec la dette fiscale
 * nette. « convenues » : dès l'émission de la facture.
 *
 * Le choix décide du moment où un abonnement payé d'avance entre dans le
 * décompte : à la facture, ou au versement.
 */
export type BaseDecompte = "convenues" | "recues";
export type Periodicite = "semestrielle" | "trimestrielle";

export type ParametresTva = {
  assujettie: boolean;
  dateAssujettissement: string | null;
  numero: string | null;
  methode: MethodeTva;
  periodicite: Periodicite;
  baseDecompte: BaseDecompte;
  /** Taux de dette fiscale nette du secteur principal, en %. SAISI, jamais deviné. */
  tauxTdfn1: number;
  libelleSecteur1: string;
  /** Second taux, seulement si l'AFC en a accordé un. */
  tauxTdfn2: number | null;
  libelleSecteur2: string | null;
};

/** Le régime quand rien n'est saisi : rien n'est assujetti, rien ne s'affiche. */
export const REGIME_VIERGE: ParametresTva = {
  assujettie: false,
  dateAssujettissement: null,
  numero: null,
  methode: "tdfn",
  periodicite: "semestrielle",
  baseDecompte: "convenues",
  tauxTdfn1: 0,
  libelleSecteur1: "",
  tauxTdfn2: null,
  libelleSecteur2: null,
};

export const METHODES: { valeur: MethodeTva; libelle: string; aide: string }[] = [
  {
    valeur: "tdfn",
    libelle: "Dette fiscale nette (TDFN)",
    aide: "Un taux forfaitaire appliqué au chiffre d'affaires TTC. Pas d'impôt préalable à récupérer, un décompte par semestre.",
  },
  {
    valeur: "effective",
    libelle: "Méthode effective",
    aide: "La TVA facturée moins l'impôt préalable sur les achats. Un décompte par trimestre.",
  },
];

/** Le principe légal, et ce que le décompte applique. */
export const BASE_DECOMPTE_PAR_DEFAUT: BaseDecompte = "convenues";

export const BASES_DECOMPTE: { valeur: BaseDecompte; libelle: string; aide: string }[] = [
  {
    valeur: "convenues",
    libelle: "Contre-prestations convenues",
    aide: "La TVA est due dès l'émission de la facture, même impayée. C'est le principe légal, et c'est ce que le décompte applique.",
  },
  {
    valeur: "recues",
    libelle: "Contre-prestations reçues",
    aide: "La TVA est due à l'encaissement — sur autorisation de l'AFC seulement.",
  },
];

/**
 * L'avertissement qui accompagne le choix des contre-prestations reçues.
 *
 * Il paraît à deux endroits : sous le réglage, et EN TÊTE DU DÉCOMPTE. Un
 * chiffre ne doit jamais pouvoir être lu comme reposant sur une base qu'il
 * n'applique pas — c'est la seule façon honnête de laisser le choix ouvert
 * sans avoir construit le mécanisme.
 */
export const AVERTISSEMENT_CONTRE_PRESTATIONS_RECUES =
  "Le décompte selon les contre-prestations reçues exige une autorisation de l'AFC. " +
  "Tant que cette option n'est pas mise en œuvre, le décompte reste calculé sur les " +
  "contre-prestations convenues.";

/** L'avertissement à afficher, ou null quand la base est celle qu'on applique. */
export function avertissementBaseDecompte(base: BaseDecompte | null | undefined): string | null {
  return base === "recues" ? AVERTISSEMENT_CONTRE_PRESTATIONS_RECUES : null;
}

export const PERIODICITES: { valeur: Periodicite; libelle: string; parAn: number }[] = [
  { valeur: "semestrielle", libelle: "Semestrielle (2 décomptes par an)", parAn: 2 },
  { valeur: "trimestrielle", libelle: "Trimestrielle (4 décomptes par an)", parAn: 4 },
];

/** « semestriel », « trimestriel » — l'adjectif, pour écrire « décompte X ». */
export function libellePeriodicite(p: Periodicite): string {
  return p === "semestrielle" ? "semestriel" : "trimestriel";
}

/**
 * La périodicité que la méthode APPELLE — semestrielle pour la dette fiscale
 * nette, trimestrielle pour la méthode effective.
 *
 * C'est une proposition, pas une contrainte : l'AFC peut en décider autrement
 * dans sa décision d'autorisation, et c'est elle qui a raison.
 */
export function periodiciteProposee(methode: MethodeTva): Periodicite {
  return methode === "tdfn" ? "semestrielle" : "trimestrielle";
}

export function periodiciteInhabituelle(p: {
  methode: MethodeTva;
  periodicite: Periodicite;
}): string | null {
  if (p.periodicite === periodiciteProposee(p.methode)) return null;
  return p.methode === "tdfn"
    ? "La dette fiscale nette se décompte d'ordinaire par semestre. Gardez la périodicité trimestrielle si votre décision de l'AFC le prévoit."
    : "La méthode effective se décompte d'ordinaire par trimestre. Gardez la périodicité semestrielle si votre décision de l'AFC le prévoit.";
}

// ── Les périodes ───────────────────────────────────────────────────────────

export type PeriodeTva = {
  /** '2026-S1', '2026-T3' — l'identifiant stable d'une période. */
  code: string;
  libelle: string;
  debut: string;
  fin: string;
};

const dernierJour = (annee: number, mois: number): string => {
  const d = new Date(Date.UTC(annee, mois, 0));
  return `${annee}-${String(mois).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
};

/** Les périodes d'une année, dans l'ordre. */
export function periodesDe(annee: number, periodicite: Periodicite): PeriodeTva[] {
  const parAn = periodicite === "semestrielle" ? 2 : 4;
  const mois = 12 / parAn;
  const lettre = periodicite === "semestrielle" ? "S" : "T";

  return Array.from({ length: parAn }, (_, i) => {
    const premier = i * mois + 1;
    const dernier = premier + mois - 1;
    return {
      code: `${annee}-${lettre}${i + 1}`,
      libelle:
        periodicite === "semestrielle"
          ? `${i + 1}ᵉʳ semestre ${annee}`.replace("1ᵉʳ", "1er").replace("2ᵉʳ", "2e")
          : `${i + 1}ᵉ trimestre ${annee}`.replace("1ᵉ", "1er"),
      debut: `${annee}-${String(premier).padStart(2, "0")}-01`,
      fin: dernierJour(annee, dernier),
    };
  });
}

/** La période qui contient une date, ou null si l'année ne correspond pas. */
export function periodeContenant(dateISO: string, periodicite: Periodicite): PeriodeTva | null {
  const annee = Number(String(dateISO).slice(0, 4));
  if (!Number.isFinite(annee)) return null;
  return periodesDe(annee, periodicite).find((p) => dateISO >= p.debut && dateISO <= p.fin) ?? null;
}

// ── Ce qui manque pour décompter ───────────────────────────────────────────

/**
 * Pourquoi le décompte ne peut pas être calculé, en une phrase qui dit
 * précisément quoi saisir. Null quand tout est là.
 *
 * Un taux à zéro en dette fiscale nette n'est pas un taux : c'est un champ
 * vide. On refuse de calculer plutôt que de produire un montant dû de 0,00 qui
 * passerait pour un décompte fait.
 */
export function refusDecompte(p: ParametresTva): string | null {
  if (!p.assujettie) {
    return "L'entreprise n'est pas assujettie à la TVA : il n'y a pas de décompte à établir.";
  }
  if (!p.dateAssujettissement) {
    return "La date d'assujettissement n'est pas renseignée : complétez Réglages → TVA.";
  }
  if (!p.numero) {
    return "Le numéro de TVA n'est pas renseigné : complétez Réglages → TVA.";
  }
  if (p.methode === "tdfn") {
    if (nb(p.tauxTdfn1) <= 0) {
      return "Le taux de dette fiscale nette du secteur 1 n'est pas saisi. Il figure sur la décision de l'AFC — reportez-le dans Réglages → TVA.";
    }
    if (!String(p.libelleSecteur1 ?? "").trim()) {
      return "Le libellé du secteur 1 n'est pas saisi : complétez Réglages → TVA.";
    }
    if (p.tauxTdfn2 !== null && nb(p.tauxTdfn2) > 0 && !String(p.libelleSecteur2 ?? "").trim()) {
      return "Un second taux de dette fiscale nette est saisi sans libellé de secteur : complétez Réglages → TVA.";
    }
  }
  return null;
}

// ── Le calcul ──────────────────────────────────────────────────────────────

export type CaSecteur = { secteur: Secteur; ttc: number };

export type LigneDecompte = {
  secteur: Secteur;
  libelle: string;
  /** Chiffre d'affaires TTC de la période pour ce secteur. */
  ca: number;
  /** Taux de dette fiscale nette appliqué, en %. */
  taux: number;
  /** Montant dû à l'AFC pour ce secteur. */
  du: number;
};

export type Decompte = {
  lignes: LigneDecompte[];
  caTotal: number;
  totalDu: number;
};

/**
 * Le décompte en dette fiscale nette : le chiffre d'affaires TTC de chaque
 * secteur, multiplié par le taux que l'AFC a accordé à ce secteur.
 *
 * Sans second taux saisi, TOUT est rattaché au secteur 1 — c'est ce que
 * demande l'AFC tant qu'un second taux n'a pas été accordé. L'écran, lui,
 * montre quand même la part du secteur secondaire, avec l'avertissement des
 * 10 % : c'est ainsi qu'on voit venir l'obligation avant de la subir.
 */
export function calculerDecompteTdfn(p: {
  parametres: ParametresTva;
  caParSecteur: CaSecteur[];
}): Decompte {
  const { parametres: par } = p;
  const ca = (s: Secteur) => r2(p.caParSecteur.filter((c) => c.secteur === s).reduce((t, c) => t + nb(c.ttc), 0));

  const secondTaux = par.tauxTdfn2 !== null && nb(par.tauxTdfn2) > 0;
  const secteurDeux = secteurDuSecondTaux(par);

  const lignes: LigneDecompte[] = [];

  if (!secondTaux) {
    // Un seul taux : tout le chiffre d'affaires y passe, sans exception.
    const total = r2(p.caParSecteur.reduce((t, c) => t + nb(c.ttc), 0));
    lignes.push({
      secteur: "pension",
      libelle: String(par.libelleSecteur1 ?? "").trim() || "Secteur 1",
      ca: total,
      taux: nb(par.tauxTdfn1),
      du: r2((total * nb(par.tauxTdfn1)) / 100),
    });
  } else {
    const autre: Secteur = secteurDeux === "pension" ? "commerce" : "pension";
    lignes.push({
      secteur: autre,
      libelle: String(par.libelleSecteur1 ?? "").trim() || "Secteur 1",
      ca: ca(autre),
      taux: nb(par.tauxTdfn1),
      du: r2((ca(autre) * nb(par.tauxTdfn1)) / 100),
    });
    lignes.push({
      secteur: secteurDeux,
      libelle: String(par.libelleSecteur2 ?? "").trim() || "Secteur 2",
      ca: ca(secteurDeux),
      taux: nb(par.tauxTdfn2),
      du: r2((ca(secteurDeux) * nb(par.tauxTdfn2)) / 100),
    });
  }

  return {
    lignes,
    caTotal: r2(lignes.reduce((s, l) => s + l.ca, 0)),
    totalDu: r2(lignes.reduce((s, l) => s + l.du, 0)),
  };
}

/**
 * À quel secteur se rapporte le second taux.
 *
 * Il est nommé par son libellé : « commerce », « boutique », « vente » et
 * « atelier » désignent le commerce ; tout le reste, la pension. On ne demande
 * pas à Sabrina de choisir dans une liste ce qu'elle a déjà écrit.
 */
export function secteurDuSecondTaux(p: Pick<ParametresTva, "libelleSecteur2">): Secteur {
  const l = String(p.libelleSecteur2 ?? "").toLowerCase();
  return /commerce|boutique|vente|atelier|magasin/.test(l) ? "commerce" : "pension";
}

/**
 * Décompte en méthode effective : la TVA facturée de la période, moins
 * l'impôt préalable déductible.
 */
export type DecompteEffectif = {
  tvaFacturee: number;
  impotPrealable: number;
  totalDu: number;
};

export function calculerDecompteEffectif(p: {
  ventilation: Ventilation;
  impotPrealable: number | string;
}): DecompteEffectif {
  const facturee = r2(p.ventilation.totalTva);
  const prealable = r2(Math.max(nb(p.impotPrealable), 0));
  return { tvaFacturee: facturee, impotPrealable: prealable, totalDu: r2(facturee - prealable) };
}

// ── Les écritures ──────────────────────────────────────────────────────────

export type LigneEcriture = { compte: string; debit: number; credit: number };

/**
 * L'écriture du décompte en dette fiscale nette, passée UNE FOIS par période.
 *
 *     D 3806 Décompte TVA (dette fiscale nette)   x.xx
 *     C 2200 TVA due                                    x.xx
 *
 * En dette fiscale nette, les produits restent comptabilisés TTC sur leurs
 * comptes 3xxx et aucun impôt préalable n'est récupéré : rien ne se passe au
 * fil des factures. C'est l'erreur classique — comptabiliser de la TVA à
 * chaque pièce puis la recompter au décompte — et elle est évitée ici en ne
 * produisant AUCUNE écriture ailleurs.
 */
export function lignesEcritureDecompteTdfn(totalDu: number | string): LigneEcriture[] {
  const montant = r2(nb(totalDu));
  if (montant === 0) return [];
  if (montant > 0) {
    return [
      { compte: COMPTE_DECOMPTE_TDFN, debit: montant, credit: 0 },
      { compte: COMPTE_TVA_DUE, debit: 0, credit: montant },
    ];
  }
  // Un décompte négatif (retours supérieurs aux ventes) s'inverse.
  return [
    { compte: COMPTE_TVA_DUE, debit: -montant, credit: 0 },
    { compte: COMPTE_DECOMPTE_TDFN, debit: 0, credit: -montant },
  ];
}

/**
 * L'écriture du décompte en méthode effective.
 *
 * La TVA facturée a déjà été créditée en 2200 au fil des pièces, et l'impôt
 * préalable débité en 1170. Le décompte ne fait que solder 1170 dans 2200 :
 * il ne recrée pas la dette.
 */
export function lignesEcritureDecompteEffectif(d: DecompteEffectif): LigneEcriture[] {
  const prealable = r2(d.impotPrealable);
  if (prealable === 0) return [];
  return [
    { compte: COMPTE_TVA_DUE, debit: prealable, credit: 0 },
    { compte: COMPTE_IMPOT_PREALABLE, debit: 0, credit: prealable },
  ];
}

/** Le versement à l'AFC : la dette s'éteint, la banque aussi. */
export function lignesEcriturePaiementTva(montant: number | string): LigneEcriture[] {
  const m = r2(nb(montant));
  if (m <= 0) return [];
  return [
    { compte: COMPTE_TVA_DUE, debit: m, credit: 0 },
    { compte: COMPTE_BANQUE, debit: 0, credit: m },
  ];
}

// ── Le seuil des 10 % ──────────────────────────────────────────────────────

export type Seuil = {
  /** Part du secteur secondaire dans le chiffre d'affaires, en %. */
  part: number;
  secteur: Secteur;
  libelle: string;
  depasse: boolean;
  /** L'avertissement à afficher, ou null. */
  message: string | null;
};

export const SEUIL_SECOND_TAUX = 10;

/**
 * L'alerte du second taux.
 *
 * Quand une activité secondaire dépasse 10 % du chiffre d'affaires sur douze
 * mois glissants, l'AFC exige en principe un second taux de dette fiscale
 * nette. On le SIGNALE — on ne bloque rien, et surtout on n'invente aucun
 * taux : c'est l'AFC qui l'attribue, sur demande.
 */
export function seuilSecondTaux(p: {
  caParSecteur: CaSecteur[];
  /** Vrai si un second taux est déjà saisi : l'alerte n'a alors plus lieu d'être. */
  secondTauxDejaSaisi?: boolean;
}): Seuil | null {
  const total = r2(p.caParSecteur.reduce((s, c) => s + nb(c.ttc), 0));
  if (total <= 0) return null;

  const parSecteur = new Map<Secteur, number>();
  for (const c of p.caParSecteur) {
    parSecteur.set(c.secteur, r2((parSecteur.get(c.secteur) ?? 0) + nb(c.ttc)));
  }
  if (parSecteur.size < 2) return null;

  // Le secteur secondaire est le plus petit des deux.
  const classes = [...parSecteur.entries()].sort((a, b) => b[1] - a[1]);
  const [secteur, ca] = classes[classes.length - 1];
  const part = Math.round((ca / total) * 1000) / 10;

  const libelle = secteur === "pension" ? "pension et garderie" : "boutique et atelier";
  const depasse = part > SEUIL_SECOND_TAUX;

  return {
    part,
    secteur,
    libelle,
    depasse,
    message:
      depasse && !p.secondTauxDejaSaisi
        ? `L'activité ${libelle} représente ${String(part).replace(".", ",")} % de ton chiffre d'affaires. ` +
          "Un second taux de dette fiscale nette est probablement obligatoire — demande-le à l'AFC."
        : null,
  };
}
