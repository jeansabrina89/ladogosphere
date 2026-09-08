/**
 * La TVA : taux légaux, attribution par défaut, et la ventilation d'un panier.
 *
 * Fonction pure, sans base : c'est ici que vivent les décisions, et c'est ce
 * fichier que les tests couvrent. La caisse, la boutique en ligne et la
 * facturation appellent TOUTES `ventilerPanier` — une seule implémentation,
 * pour qu'il n'y en ait pas trois qui divergent au fil des mois.
 *
 * Deux chiffres à ne jamais confondre :
 *
 *   • le TAUX LÉGAL (8,1 %, 2,6 %, 0 %) est celui qu'on facture au client et
 *     qui figure sur la pièce ;
 *   • le TAUX DE DETTE FISCALE NETTE est celui qu'on applique au chiffre
 *     d'affaires TTC pour payer l'AFC.
 *
 * Ils n'ont aucun rapport l'un avec l'autre. Le premier vit ici ; le second
 * n'est écrit nulle part dans le code — il est SAISI, et il vit dans
 * `parametres_tva`. Voir `decompteTvaLogique`.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;

const nb = (v: unknown): number => {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

// ── Les taux légaux ────────────────────────────────────────────────────────

/** Taux normal, au 1er janvier 2024. */
export const TAUX_NORMAL = 8.1;
/** Taux réduit : denrées alimentaires, y compris pour les animaux. */
export const TAUX_REDUIT = 2.6;
/** Hors champ ou exclu du champ de l'impôt. */
export const TAUX_EXCLU = 0;

export const TAUX_LEGAUX = [TAUX_NORMAL, TAUX_REDUIT, TAUX_EXCLU] as const;

/**
 * Un taux venu de la base ou d'un formulaire, ramené à un taux légal connu.
 *
 * Ce qui n'est pas un nombre est REFUSÉ, et non ramené à zéro : zéro est un
 * taux légal (hors champ), et laisser une saisie illisible y tomber
 * silencieusement ferait disparaître la TVA d'une ligne sans que personne ne
 * le voie.
 */
export function tauxValide(brut: unknown): number | null {
  if (brut === null || brut === undefined || brut === "") return null;
  const t = Number(String(brut).replace(",", "."));
  if (!Number.isFinite(t)) return null;
  const trouve = TAUX_LEGAUX.find((v) => Math.abs(v - t) < 0.0001);
  return trouve === undefined ? null : trouve;
}

export function libelleTaux(taux: number): string {
  const t = nb(taux);
  if (t === 0) return "0 % (hors champ ou exclu)";
  return `${String(t).replace(".", ",")} %`;
}

/** « TVA 8,1 % » — l'étiquette d'une ligne de ventilation, en pied de pièce. */
export function etiquetteLigneTva(taux: number): string {
  return `TVA ${String(nb(taux)).replace(".", ",")} %`;
}

// ── Attribution par défaut ─────────────────────────────────────────────────

/**
 * Ce qui se mange est au taux réduit. C'est la seule règle de fond ; tout le
 * reste de la boutique est au taux normal.
 *
 * Un défaut, pas une fatalité : chaque article garde son taux propre, et
 * l'écran de l'article le laisse changer.
 */
export const CATEGORIES_TAUX_REDUIT = [
  "alimentation_seche",
  "alimentation_humide",
  "friandises",
  "mastication",
  "litiere",
] as const;

export function tauxParDefautCategorie(categorie: string | null | undefined): number {
  const c = String(categorie ?? "").trim();
  return (CATEGORIES_TAUX_REDUIT as readonly string[]).includes(c) ? TAUX_REDUIT : TAUX_NORMAL;
}

/**
 * Taux par défaut d'une prestation, d'après son compte de produit.
 *
 * La pension, la garderie, la journée d'essai, les frais et les prestations
 * annexes sont au taux normal. L'adhésion est le seul cas discutable — voir
 * `ADHESION_A_QUALIFIER`.
 */
export function tauxParDefautCompte(compteProduit: string | null | undefined): number {
  const c = String(compteProduit ?? "").trim();
  // 3800 est une diminution de produit : elle suit ce qu'elle diminue, jamais
  // un taux à elle. L'appelant ventile la remise, il ne lui donne pas de taux.
  if (c === "3800") return TAUX_EXCLU;
  return TAUX_NORMAL;
}

/**
 * L'adhésion annuelle.
 *
 * Une cotisation de membre au sens de l'art. 21 al. 2 ch. 13 LTVA est EXCLUE
 * du champ ; mais il faut pour cela que l'association poursuive un but idéal
 * et que la cotisation ouvre les mêmes droits à tous les membres. Ce n'est pas
 * au logiciel de trancher : par défaut on la facture au taux normal, et on
 * pose la question à l'écran.
 */
export const COMPTE_ADHESION = "3005";
export const ADHESION_A_QUALIFIER =
  "L'adhésion est facturée à 8,1 %. Si elle constitue une cotisation de membre exclue " +
  "au sens de l'art. 21 LTVA, passez-la à 0 % — à vérifier avec votre fiduciaire.";

// ── Le secteur de dette fiscale nette ──────────────────────────────────────

export type Secteur = "pension" | "commerce";

export const SECTEURS: { valeur: Secteur; libelle: string }[] = [
  { valeur: "pension", libelle: "Pension et garderie" },
  { valeur: "commerce", libelle: "Boutique et atelier" },
];

export function libelleSecteur(secteur: string | null | undefined): string {
  return SECTEURS.find((s) => s.valeur === secteur)?.libelle ?? "—";
}

export function secteurValide(brut: unknown): Secteur | null {
  const s = String(brut ?? "").trim();
  return s === "pension" || s === "commerce" ? s : null;
}

/**
 * Tout ce qui se vend en boutique relève du commerce, quelle que soit la
 * catégorie : c'est le canal qui décide, pas la nature du produit. Un défaut,
 * modifiable article par article.
 */
export const SECTEUR_ARTICLE_PAR_DEFAUT: Secteur = "commerce";

/**
 * Secteur par défaut d'une prestation, d'après son compte de produit.
 * Séjours, garderie, frais et prestations annexes : c'est la pension.
 * La boutique a son compte à elle.
 */
export function secteurParDefautCompte(compteProduit: string | null | undefined): Secteur {
  return String(compteProduit ?? "").trim() === "3200" ? "commerce" : "pension";
}

// ── Extraction de la TVA d'un montant TTC ──────────────────────────────────

export type MontantVentile = { ttc: number; ht: number; tva: number };

/**
 * La TVA contenue dans un prix TTC. Les prix affichés sont TTC : la TVA s'en
 * extrait, elle ne s'y ajoute pas.
 *
 * `ht + tva === ttc` au centime, toujours — c'est l'arrondi de la TVA qui cède.
 */
export function extraireTVA(ttc: number | string, taux: number | string): MontantVentile {
  const montant = r2(nb(ttc));
  const t = nb(taux);
  if (t <= 0) return { ttc: montant, ht: montant, tva: 0 };
  const ht = r2(montant / (1 + t / 100));
  return { ttc: montant, ht, tva: r2(montant - ht) };
}

// ── La ventilation d'un panier ─────────────────────────────────────────────

export type LigneVentilable = {
  /** Montant TTC de la ligne, quantité comprise. */
  montant: number | string;
  /** Taux légal figé sur la ligne. */
  taux_tva: number | string;
};

export type PartTaux = {
  taux: number;
  /** Base TTC des articles, avant port et avant remise. */
  base: number;
  /** Part du port attribuée à ce taux. */
  port: number;
  /** Part de la remise imputée à ce taux, en positif. */
  remise: number;
  ttc: number;
  ht: number;
  tva: number;
};

export type Ventilation = {
  /** Une part par taux effectivement présent, du plus élevé au plus bas. */
  parts: PartTaux[];
  totalTtc: number;
  totalHt: number;
  totalTva: number;
};

/**
 * Ventiler un panier par taux : la fonction unique.
 *
 * Deux cas font trébucher tout le monde, et ils sont traités ici une fois pour
 * toutes :
 *
 *   • **Les frais de port** suivent le taux des marchandises transportées.
 *     Un seul taux au panier ? Le port prend ce taux. Panier mixte ? Le port
 *     se répartit au prorata des montants HORS TAXE de chaque taux. Le port
 *     n'est jamais à 0 % au prétexte qu'on ne sait pas quoi en faire.
 *
 *   • **La remise** (membre ou autre) n'a pas de taux à elle : elle diminue la
 *     base sur laquelle la TVA se calcule, au même prorata que le port.
 *
 * Les centimes perdus dans la répartition vont au taux LE PLUS ÉLEVÉ — c'est
 * le sens qui favorise le fisc, celui qu'on ne nous reprochera pas. Et la
 * somme des parts égale toujours, au centime, le total du panier : c'est
 * vérifié par les tests, pas seulement espéré.
 */
export function ventilerPanier(p: {
  lignes: LigneVentilable[];
  /** Frais de port TTC, positifs. */
  port?: number | string | null;
  /** Remise TTC, en POSITIF : elle sera soustraite. */
  remise?: number | string | null;
}): Ventilation {
  const port = r2(Math.max(nb(p.port), 0));
  const remiseDemandee = r2(Math.max(nb(p.remise), 0));

  // Base TTC par taux. Un taux inconnu retombe sur le taux normal plutôt que
  // de disparaître : mieux vaut trop de TVA que pas de ligne du tout.
  const base = new Map<number, number>();
  for (const l of p.lignes) {
    const t = tauxValide(l.taux_tva) ?? TAUX_NORMAL;
    base.set(t, r2((base.get(t) ?? 0) + nb(l.montant)));
  }

  // Panier vide : le port, s'il existe, ne suit rien — il prend le taux normal.
  if (base.size === 0) {
    if (port === 0) return { parts: [], totalTtc: 0, totalHt: 0, totalTva: 0 };
    base.set(TAUX_NORMAL, 0);
  }

  // Du plus élevé au plus bas : c'est l'ordre d'affichage, et c'est aussi le
  // premier de la liste qui reçoit les centimes d'arrondi.
  const taux = [...base.keys()].sort((a, b) => b - a);
  const totalBase = r2(taux.reduce((s, t) => s + (base.get(t) ?? 0), 0));

  // La remise ne peut pas dépasser ce qu'elle diminue.
  const remise = Math.min(remiseDemandee, Math.max(totalBase, 0));

  // Les poids : les montants HORS TAXE de chaque taux. C'est la base
  // imposable qu'on répartit, pas le prix affiché.
  const poids = taux.map((t) => extraireTVA(base.get(t) ?? 0, t).ht);
  const sommePoids = r2(poids.reduce((s, v) => s + v, 0));

  const repartir = (montant: number): number[] => {
    if (montant === 0 || sommePoids <= 0) {
      return taux.map((_, i) => (i === 0 ? r2(montant) : 0));
    }
    // Tous les taux sauf le premier prennent leur part ARRONDIE VERS LE BAS ;
    // le PREMIER — le plus élevé — prend tout ce qui reste. Les centimes de
    // l'arrondi de répartition tombent ainsi toujours du côté le plus taxé,
    // et la somme des parts vaut exactement le montant réparti.
    //
    // Arrondir vers le bas ailleurs garantit aussi que la part du premier ne
    // devient jamais négative : elle vaut au moins sa part exacte.
    const parts = taux.map((_, i) =>
      i === 0 ? 0 : plancherCentime((montant * poids[i]) / sommePoids)
    );
    parts[0] = r2(montant - parts.slice(1).reduce((s, v) => s + v, 0));
    return parts;
  };

  const parts_port = repartir(port);
  const parts_remise = repartir(remise);

  const parts: PartTaux[] = taux.map((t, i) => {
    const b = r2(base.get(t) ?? 0);
    const ttc = r2(b + parts_port[i] - parts_remise[i]);
    const { ht, tva } = extraireTVA(ttc, t);
    return { taux: t, base: b, port: parts_port[i], remise: parts_remise[i], ttc, ht, tva };
  });

  return {
    parts,
    totalTtc: r2(parts.reduce((s, x) => s + x.ttc, 0)),
    totalHt: r2(parts.reduce((s, x) => s + x.ht, 0)),
    totalTva: r2(parts.reduce((s, x) => s + x.tva, 0)),
  };
}

/**
 * Le centime inférieur. Le petit epsilon rattrape les flottants : sans lui,
 * 0,30 stocké comme 0,2999999999 tomberait à 0,29.
 */
function plancherCentime(n: number): number {
  return Math.floor(n * 100 + 1e-9) / 100;
}

// ── Ce qui s'affiche en pied de pièce ──────────────────────────────────────

export type ParametresTvaAffichage = {
  assujettie: boolean;
  numero: string | null;
  /** Avant cette date, rien n'est assujetti. */
  dateAssujettissement: string | null;
};

export type PiedTva = {
  numero: string | null;
  totalHt: number;
  totalTtc: number;
  /** Une ligne par taux réellement présent, hors 0 % sans montant. */
  lignes: { taux: number; etiquette: string; base: number; tva: number }[];
};

/**
 * Le bloc de ventilation d'une facture ou d'un ticket, ou `null`.
 *
 * `null` veut dire : n'affiche RIEN. Pas de numéro, pas de ventilation, pas de
 * ligne « TVA 0,00 » — mentionner une TVA qu'on ne verse pas est une faute
 * lourde, et une ligne à zéro ressemble déjà à une TVA facturée.
 */
export function piedTva(
  params: ParametresTvaAffichage,
  ventilation: Ventilation,
  dateISO: string | null
): PiedTva | null {
  if (!params.assujettie) return null;
  if (params.dateAssujettissement && dateISO && dateISO < params.dateAssujettissement) return null;

  const lignes = ventilation.parts
    .filter((p) => p.taux > 0 && p.tva !== 0)
    .map((p) => ({
      taux: p.taux,
      etiquette: etiquetteLigneTva(p.taux),
      base: p.ht,
      tva: p.tva,
    }));

  // Assujettie mais rien d'imposable sur cette pièce : le numéro suffit, la
  // ventilation n'a rien à dire.
  return {
    numero: (params.numero ?? "").trim() || null,
    totalHt: ventilation.totalHt,
    totalTtc: ventilation.totalTtc,
    lignes,
  };
}

/**
 * Le taux qui s'applique VRAIMENT à une ligne, à une date donnée.
 *
 * Zéro tant que l'entreprise n'est pas assujettie, et zéro avant la date
 * d'assujettissement : une pièce d'avant ne porte pas de TVA, même si son
 * article en porte un aujourd'hui.
 */
export function tauxApplicable(
  params: ParametresTvaAffichage,
  dateISO: string | null,
  tauxLigne: number | string
): number {
  if (!params.assujettie) return 0;
  if (params.dateAssujettissement && dateISO && dateISO < params.dateAssujettissement) return 0;
  return tauxValide(tauxLigne) ?? 0;
}

// ── Le numéro de TVA ───────────────────────────────────────────────────────

/** CHE-123.456.789 TVA — le format de l'AFC, et rien d'autre. */
export const FORMAT_NUMERO_TVA = /^CHE-\d{3}\.\d{3}\.\d{3} TVA$/;

export function numeroTvaValide(brut: unknown): boolean {
  return FORMAT_NUMERO_TVA.test(String(brut ?? "").trim());
}

/**
 * Met en forme ce qui a été tapé : « 123456789 », « CHE123.456.789 » et
 * « che-123.456.789 tva » donnent tous le bon numéro. Rend null si les neuf
 * chiffres n'y sont pas — on ne devine pas un numéro d'entreprise.
 */
export function normaliserNumeroTva(brut: unknown): string | null {
  const chiffres = String(brut ?? "").replace(/\D/g, "");
  if (chiffres.length !== 9) return null;
  return `CHE-${chiffres.slice(0, 3)}.${chiffres.slice(3, 6)}.${chiffres.slice(6, 9)} TVA`;
}
