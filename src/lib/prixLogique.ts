/**
 * Le prix qu'un client paie vraiment — et la seule fonction qui le dit.
 *
 * `prixApplicable` est appelée par la caisse, la boutique en ligne, la fiche
 * produit et la facturation. Il n'y en a QU'UNE : trois implémentations
 * divergeraient, c'est certain, et le jour où elles divergent c'est le client
 * qui paie l'écart.
 *
 * Deux règles portent tout le reste :
 *
 *  1. Sur une ligne, une action et la remise membre ne s'ADDITIONNENT jamais.
 *     La plus avantageuse pour le client s'applique, une seule fois. La remise
 *     membre continue de jouer pleinement sur toutes les autres lignes du
 *     panier — c'est une décision de Sabrina, pas une limite technique.
 *
 *  2. Le prix comparatif affiché est le prix de base RÉEL de l'article, celui
 *     pratiqué hors action. On ne fabrique jamais un « prix habituel » plus
 *     élevé pour grossir la remise : l'ordonnance sur l'indication des prix
 *     l'interdit, et c'est de toute façon malhonnête.
 *
 * Fonction pure : ni base, ni requête. C'est ce fichier que les tests
 * couvrent, et c'est lui qui décide.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;

const nb = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

// ── Les trois rubriques ────────────────────────────────────────────────────

export type TypePromotion = "nouveaute" | "action" | "anti_gaspillage";
export type CiblePromotion = "tous" | "membres";

/** Ce qu'un type de rubrique est, et ce qu'il exige. */
export const TYPES_PROMOTION: {
  valeur: TypePromotion;
  libelle: string;
  /** Le nom proposé à la création. Sabrina peut le réécrire. */
  nomPropose: string;
  /** Une remise chiffrée, ou une simple mise en avant ? */
  avecPourcentage: boolean;
  aide: string;
}[] = [
  {
    valeur: "nouveaute",
    libelle: "Nouveautés",
    nomPropose: "Nouveautés",
    avecPourcentage: false,
    aide:
      "Une mise en avant, sans remise. Les articles se choisissent à la main : " +
      "« arrivé depuis 30 jours » n'est pas une nouveauté, c'est une date.",
  },
  {
    valeur: "action",
    libelle: "Action du mois",
    nomPropose: "Action du mois",
    avecPourcentage: true,
    aide: "Une remise sur une sélection, pour tout le monde ou pour les membres seuls.",
  },
  {
    valeur: "anti_gaspillage",
    libelle: "Anti-gaspillage",
    nomPropose: "Anti-gaspillage",
    avecPourcentage: true,
    aide: "Une remise sur ce qui approche de sa date limite, pour l'écouler plutôt que le jeter.",
  },
];

export function typePromotion(type: string | null | undefined) {
  return TYPES_PROMOTION.find((t) => t.valeur === type) ?? null;
}

export function libelleTypePromotion(type: string | null | undefined): string {
  return typePromotion(type)?.libelle ?? "—";
}

export const CIBLES_PROMOTION: { valeur: CiblePromotion; libelle: string; aide: string }[] = [
  { valeur: "tous", libelle: "Tout le monde", aide: "Visible et applicable à tous, membres compris." },
  {
    valeur: "membres",
    libelle: "Membres seulement",
    aide:
      "Un visiteur non connecté n'en voit rien : ni le prix barré, ni la mention. " +
      "Montrer une remise qu'on ne peut pas obtenir n'est pas une réclame, c'est une déception.",
  },
];

export type Promotion = {
  id: string;
  nom: string;
  type: TypePromotion | string;
  pourcentage: number | string | null;
  date_debut: string;
  date_fin: string;
  cible: CiblePromotion | string;
  texte?: string | null;
  actif: boolean;
  ordre?: number | null;
};

// ── Ce qu'on donne à la fonction ───────────────────────────────────────────

export type ArticlePrix = {
  id: string;
  prix_vente: number | string;
  categorie?: string | null;
  /** Cet article ne donne jamais droit à la remise membre. */
  remise_membre_exclue?: boolean | null;
  date_limite?: string | null;
  /** Les rubriques auxquelles il appartient, déjà chargées. */
  promotions?: Promotion[] | null;
  /**
   * Le pourcentage de remise membre de SA catégorie, lu de
   * `remise_membre_categories`. Null ou 0 : la catégorie est exclue.
   */
  remise_membre_pourcent?: number | string | null;
};

export type ClientPrix = { estMembre?: boolean | null } | null | undefined;

export type OrigineRemise = "action" | "anti_gaspillage" | "membre";

export type Candidat = {
  origine: OrigineRemise;
  pourcentage: number;
  /** « Action du mois −20 % », « Remise membre −10 % ». */
  libelle: string;
  /** Le nom seul, sans le pourcentage. */
  nom: string;
  promotionId: string | null;
};

export type PrixApplicable = {
  /** Le prix de base réel, celui pratiqué hors action. */
  prixBase: number;
  /** Le taux retenu, ou null s'il n'y a aucune remise. */
  pourcentage: number | null;
  /** Ce que la remise enlève, en francs. */
  remise: number;
  origine: OrigineRemise | null;
  /** L'origine en toutes lettres, telle qu'elle paraît sur la facture. */
  libelle: string | null;
  /** Ce que le client paie. */
  prixFinal: number;
  /** Tout ce qui était en lice, retenu compris, du plus avantageux au moins. */
  candidats: Candidat[];
  /**
   * Vrai quand plusieurs remises se disputaient la ligne. Une seule s'applique,
   * et Sabrina doit pouvoir le lire à l'écran plutôt que le découvrir au ticket.
   */
  cumulEvite: boolean;
};

// ── Période, cible, visibilité ─────────────────────────────────────────────

/** Les dates sont des « AAAA-MM-JJ » : elles se comparent telles quelles. */
export function enPeriode(
  promo: { date_debut: string; date_fin: string },
  dateISO: string
): boolean {
  const j = String(dateISO ?? "").slice(0, 10);
  if (!j) return false;
  return String(promo.date_debut).slice(0, 10) <= j && j <= String(promo.date_fin).slice(0, 10);
}

/**
 * Cette rubrique s'adresse-t-elle à cette personne ?
 *
 * Une action « membres » est INVISIBLE au visiteur non connecté : ni son prix
 * barré, ni sa mention, ni sa rubrique. Il n'apprend pas qu'elle existe pour
 * ensuite se la voir refuser.
 */
export function cibleAtteinte(promo: { cible: string }, client: ClientPrix): boolean {
  if (promo.cible !== "membres") return true;
  return client?.estMembre === true;
}

/** Les rubriques qui jouent, ici, maintenant, pour cette personne. */
export function promotionsApplicables(
  promotions: Promotion[] | null | undefined,
  client: ClientPrix,
  dateISO: string
): Promotion[] {
  return (promotions ?? []).filter(
    (p) => p.actif === true && enPeriode(p, dateISO) && cibleAtteinte(p, client)
  );
}

// ── Les libellés ───────────────────────────────────────────────────────────

/** « 20 », « 7,5 » — un pourcentage comme on l'écrit. */
export function formatPourcentage(p: number): string {
  const propre = Math.round(p * 10) / 10;
  return String(propre).replace(".", ",");
}

/** « Action du mois −20 % ». Le nom d'abord, le chiffre ensuite. */
export function libelleRemise(nom: string, pourcentage: number): string {
  return `${nom} −${formatPourcentage(pourcentage)} %`;
}

export const NOM_REMISE_MEMBRE = "Remise membre";

// ── La fonction unique ─────────────────────────────────────────────────────

/**
 * Le prix applicable à un article, pour une personne, un jour donné.
 *
 * Les candidats sont mis côte à côte, et LE PLUS AVANTAGEUX POUR LE CLIENT
 * l'emporte, seul. À égalité de pourcentage, la rubrique nommée passe devant la
 * remise membre : le client lit « Action du mois −10 % » plutôt qu'une remise
 * anonyme, et il paie exactement pareil.
 *
 * Un article exclu de la remise membre n'en montre AUCUNE mention : annoncer
 * une remise qui ne s'applique pas est pire que ne rien annoncer.
 */
export function prixApplicable(p: {
  article: ArticlePrix;
  client?: ClientPrix;
  date: string;
}): PrixApplicable {
  const prixBase = r2(nb(p.article.prix_vente) ?? 0);
  const client = p.client ?? null;
  const candidats: Candidat[] = [];

  for (const promo of promotionsApplicables(p.article.promotions, client, p.date)) {
    // « Nouveautés » met en avant, elle ne remise pas : pas de pourcentage,
    // donc pas de candidat.
    if (promo.type !== "action" && promo.type !== "anti_gaspillage") continue;
    const pourcentage = nb(promo.pourcentage) ?? 0;
    if (pourcentage <= 0) continue;
    const nom = String(promo.nom ?? "").trim() || libelleTypePromotion(promo.type);
    candidats.push({
      origine: promo.type === "action" ? "action" : "anti_gaspillage",
      pourcentage,
      nom,
      libelle: libelleRemise(nom, pourcentage),
      promotionId: promo.id,
    });
  }

  const pourcentMembre = nb(p.article.remise_membre_pourcent) ?? 0;
  if (
    client?.estMembre === true &&
    p.article.remise_membre_exclue !== true &&
    pourcentMembre > 0
  ) {
    candidats.push({
      origine: "membre",
      pourcentage: pourcentMembre,
      nom: NOM_REMISE_MEMBRE,
      libelle: libelleRemise(NOM_REMISE_MEMBRE, pourcentMembre),
      promotionId: null,
    });
  }

  // Le plus avantageux d'abord. À égalité, la rubrique nommée devant la remise
  // membre, puis l'ordre alphabétique — pour que deux exécutions donnent
  // toujours la même réponse.
  candidats.sort(
    (a, b) =>
      b.pourcentage - a.pourcentage ||
      Number(a.origine === "membre") - Number(b.origine === "membre") ||
      a.nom.localeCompare(b.nom, "fr")
  );

  const retenu = candidats[0] ?? null;
  const remise = retenu ? r2((prixBase * retenu.pourcentage) / 100) : 0;

  return {
    prixBase,
    pourcentage: retenu?.pourcentage ?? null,
    remise,
    origine: retenu?.origine ?? null,
    libelle: retenu?.libelle ?? null,
    prixFinal: r2(prixBase - remise),
    candidats,
    cumulEvite: candidats.length > 1,
  };
}

/**
 * La remise telle qu'elle se FIGE sur une ligne de vente, de commande ou de
 * facture. Null quand il n'y en a pas : une ligne sans remise ne porte aucune
 * de ces quatre colonnes, et son prix de base est son prix, tout simplement.
 */
export function remiseLigne(prix: PrixApplicable): {
  prix_base: number;
  remise_pourcentage: number;
  remise_origine: OrigineRemise;
  remise_libelle: string;
} | null {
  if (prix.origine === null || prix.libelle === null || prix.pourcentage === null) return null;
  return {
    prix_base: prix.prixBase,
    remise_pourcentage: prix.pourcentage,
    remise_origine: prix.origine,
    remise_libelle: prix.libelle,
  };
}

/**
 * Ce que Sabrina lit quand plusieurs remises se disputaient une ligne. Rien à
 * dire quand il n'y en avait qu'une : le silence vaut mieux qu'un avertissement
 * qui ne prévient de rien.
 */
export function mentionCumulEvite(prix: PrixApplicable): string | null {
  if (!prix.cumulEvite || !prix.libelle) return null;
  const ecartes = prix.candidats
    .slice(1)
    .map((c) => `${c.nom} −${formatPourcentage(c.pourcentage)} %`)
    .join(", ");
  return `${prix.libelle} s'applique — ${ecartes} ne s'y ajoute${prix.candidats.length > 2 ? "nt" : ""} pas. Le client garde la plus avantageuse.`;
}

// ── Le même calcul, côté navigateur ────────────────────────────────────────

/**
 * Le contexte de prix mis à plat, pour traverser la frontière serveur →
 * navigateur. La caisse en a besoin : le prix doit se recalculer quand on
 * choisit un client, sans aller-retour, et c'est la MÊME fonction qui le fait.
 */
export type ContextePrixPlat = {
  date: string;
  promotionsParArticle: Record<string, Promotion[]>;
  remiseParCategorie: Record<string, number>;
};

export function prixDansContexte(
  ctx: ContextePrixPlat,
  article: {
    id: string;
    prix_vente: number | string;
    categorie?: string | null;
    remise_membre_exclue?: boolean | null;
    date_limite?: string | null;
  },
  client: ClientPrix
): PrixApplicable {
  return prixApplicable({
    article: {
      id: article.id,
      prix_vente: article.prix_vente,
      categorie: article.categorie ?? null,
      remise_membre_exclue: article.remise_membre_exclue ?? false,
      date_limite: article.date_limite ?? null,
      promotions: ctx.promotionsParArticle[article.id] ?? [],
      remise_membre_pourcent: ctx.remiseParCategorie[article.categorie ?? ""] ?? 0,
    },
    client,
    date: ctx.date,
  });
}

// ── La date limite d'un anti-gaspillage ────────────────────────────────────

const MOIS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

/** « À écouler avant le 12 octobre ». */
export function mentionDateLimite(date: string | null | undefined): string | null {
  const j = String(date ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(j)) return null;
  const [, mois, jour] = j.split("-");
  const m = MOIS[Number(mois) - 1];
  if (!m) return null;
  return `À écouler avant le ${Number(jour)} ${m}`;
}

// ── La marge, pendant qu'on tape le pourcentage ────────────────────────────

export type ApercuMarge = {
  prixBase: number;
  prixRemise: number;
  prixAchat: number | null;
  /** Ce qui reste, prix d'achat déduit. Null quand le prix d'achat manque. */
  marge: number | null;
  /** Vrai quand on vendrait à perte. On PRÉVIENT, on ne bloque pas. */
  sousLePrixDAchat: boolean;
};

/**
 * L'effet d'un pourcentage sur un article, article par article, pendant la
 * saisie. Une action qui passe sous le prix d'achat n'est pas interdite —
 * écouler un fond de stock à perte peut être le bon geste — mais elle ne doit
 * jamais être décidée sans le savoir.
 */
export function apercuMarge(p: {
  prixVente: number | string | null | undefined;
  prixAchat: number | string | null | undefined;
  pourcentage: number | string | null | undefined;
}): ApercuMarge {
  const prixBase = r2(nb(p.prixVente) ?? 0);
  const pct = Math.max(nb(p.pourcentage) ?? 0, 0);
  const prixRemise = r2(prixBase - r2((prixBase * pct) / 100));
  const prixAchat = nb(p.prixAchat);

  return {
    prixBase,
    prixRemise,
    prixAchat,
    marge: prixAchat === null ? null : r2(prixRemise - prixAchat),
    sousLePrixDAchat: prixAchat !== null && prixAchat > 0 && prixRemise < prixAchat,
  };
}

export const AVERTISSEMENT_SOUS_PRIX_ACHAT =
  "Ce prix passe sous le prix d'achat : la vente se ferait à perte.";

// ── Les rubriques telles que la boutique les montre ────────────────────────

export type RubriqueBoutique<A> = {
  promotion: Promotion;
  articles: A[];
};

/**
 * Les rubriques à afficher, dans l'ordre choisi par Sabrina.
 *
 * Une rubrique VIDE ne s'affiche pas : ni titre, ni cadre, ni « bientôt ». Un
 * rayon vide dans un magasin, personne ne le met en vitrine. Les articles
 * fournis sont déjà ceux que la personne a le droit de voir — un brouillon ou
 * un article masqué n'arrive jamais jusqu'ici.
 */
export function rubriquesBoutique<A extends { id: string }>(
  promotions: Promotion[] | null | undefined,
  articlesParPromotion: Map<string, A[]>,
  client: ClientPrix,
  dateISO: string
): RubriqueBoutique<A>[] {
  return promotionsApplicables(promotions, client, dateISO)
    .map((promotion) => ({ promotion, articles: articlesParPromotion.get(promotion.id) ?? [] }))
    .filter((r) => r.articles.length > 0)
    .sort(
      (a, b) =>
        Number(a.promotion.ordre ?? 0) - Number(b.promotion.ordre ?? 0) ||
        a.promotion.nom.localeCompare(b.promotion.nom, "fr")
    );
}

// ── Refus de saisie d'une rubrique ─────────────────────────────────────────

export type RefusPromotion = { champ: string; message: string } | null;

export function refusPromotion(p: {
  nom: string;
  type: string;
  pourcentage: number | string | null | undefined;
  date_debut: string;
  date_fin: string;
  cible: string;
}): RefusPromotion {
  if (!p.nom.trim()) return { champ: "nom", message: "Donnez un nom à cette rubrique." };

  const type = typePromotion(p.type);
  if (!type) return { champ: "type", message: "Choisissez le type de rubrique." };

  if (!p.date_debut) return { champ: "date_debut", message: "Indiquez la date de début." };
  if (!p.date_fin) return { champ: "date_fin", message: "Indiquez la date de fin." };
  if (p.date_fin < p.date_debut) {
    return { champ: "date_fin", message: "La fin ne peut pas précéder le début." };
  }

  if (!CIBLES_PROMOTION.some((c) => c.valeur === p.cible)) {
    return { champ: "cible", message: "Choisissez à qui cette rubrique s'adresse." };
  }

  const pct = nb(p.pourcentage);
  if (type.avecPourcentage) {
    if (pct === null || pct <= 0) {
      return { champ: "pourcentage", message: `Une ${type.libelle.toLowerCase()} demande un pourcentage de remise.` };
    }
    if (pct > 100) {
      return { champ: "pourcentage", message: "Un pourcentage de remise ne dépasse pas 100 %." };
    }
  } else if (pct !== null && pct > 0) {
    return {
      champ: "pourcentage",
      message: "Les Nouveautés mettent en avant sans remiser : laissez le pourcentage vide.",
    };
  }

  return null;
}
