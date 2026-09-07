/**
 * Règles pures de la boutique : catégories, taux de TVA proposé, mouvements de
 * stock et écarts d'inventaire. Aucune dépendance à la base — c'est ici que
 * vivent les décisions, et c'est ce fichier que les tests couvrent.
 *
 * TVA : pas encore activée. Chaque article porte pourtant son taux dès
 * maintenant, pour n'avoir rien à ressaisir le jour où elle le sera. Le prix
 * de vente est un prix TTC, et il le reste.
 */

export const TAUX_REDUIT = 2.6; // denrées alimentaires et litière
export const TAUX_NORMAL = 8.1; // tout le reste

export type CategorieArticle =
  | "alimentation"
  | "friandises"
  | "litiere"
  | "colliers"
  | "laisses"
  | "harnais"
  | "muselieres"
  | "longes"
  | "jouets"
  | "peluches"
  | "couchages"
  | "soins"
  | "medaillons_accessoires"
  | "divers";

/**
 * Les catégories, en français accentué, DANS L'ORDRE DU MAGASIN — pas dans
 * l'ordre alphabétique. C'est la seule source de cet ordre : les écrans
 * d'administration, les filtres et les menus la parcourent telle quelle.
 *
 * Le site vitrine est un projet séparé : il reçoit le même ordre par la
 * colonne `ordre_categorie` de la vue articles_vitrine, qui reprend cette
 * liste. Toute valeur ajoutée ici doit l'être là aussi.
 */
export const CATEGORIES_ARTICLE: {
  valeur: CategorieArticle;
  libelle: string;
  taux: number;
  /** Une denrée se périme : la date de péremption est proposée à l'entrée. */
  perissable: boolean;
}[] = [
  { valeur: "alimentation", libelle: "Alimentation", taux: TAUX_REDUIT, perissable: true },
  { valeur: "friandises",   libelle: "Friandises",   taux: TAUX_REDUIT, perissable: true },
  { valeur: "litiere",      libelle: "Litière",      taux: TAUX_REDUIT, perissable: false },
  { valeur: "colliers",     libelle: "Colliers",     taux: TAUX_NORMAL, perissable: false },
  { valeur: "laisses",      libelle: "Laisses",      taux: TAUX_NORMAL, perissable: false },
  { valeur: "harnais",      libelle: "Harnais",      taux: TAUX_NORMAL, perissable: false },
  { valeur: "muselieres",   libelle: "Muselières",   taux: TAUX_NORMAL, perissable: false },
  { valeur: "longes",       libelle: "Longes",       taux: TAUX_NORMAL, perissable: false },
  { valeur: "jouets",       libelle: "Jouets",       taux: TAUX_NORMAL, perissable: false },
  { valeur: "peluches",     libelle: "Peluches",     taux: TAUX_NORMAL, perissable: false },
  { valeur: "couchages",    libelle: "Couchages",    taux: TAUX_NORMAL, perissable: false },
  { valeur: "soins",        libelle: "Soins",        taux: TAUX_NORMAL, perissable: false },
  { valeur: "medaillons_accessoires", libelle: "Médaillons et accessoires", taux: TAUX_NORMAL, perissable: false },
  { valeur: "divers",       libelle: "Divers",       taux: TAUX_NORMAL, perissable: false },
];

/** Rang d'une catégorie dans l'ordre du magasin, pour trier une liste. */
export function ordreCategorie(categorie: string | null | undefined): number {
  const i = CATEGORIES_ARTICLE.findIndex((c) => c.valeur === categorie);
  return i === -1 ? CATEGORIES_ARTICLE.length : i;
}

export const MENTION_TAUX = "Taux modifiable, à vérifier pour les produits particuliers.";

export function libelleCategorieArticle(categorie: string | null | undefined): string {
  if (!categorie) return "—";
  return CATEGORIES_ARTICLE.find((c) => c.valeur === categorie)?.libelle ?? categorie;
}

/**
 * Taux proposé par la catégorie. 2,6 % pour l'alimentation, les friandises et
 * la litière ; 8,1 % pour le reste. Proposé seulement : la saisie prime.
 */
export function tauxPropose(categorie: string | null | undefined): number {
  return CATEGORIES_ARTICLE.find((c) => c.valeur === categorie)?.taux ?? TAUX_NORMAL;
}

export function estPerissable(categorie: string | null | undefined): boolean {
  return CATEGORIES_ARTICLE.find((c) => c.valeur === categorie)?.perissable ?? false;
}

// ── Mouvements ──────────────────────────────────────────────────────────────

export type TypeMouvement =
  | "entree"
  | "vente"
  | "ajustement"
  | "perte"
  | "usage_interne"
  | "retour";

export const TYPES_MOUVEMENT: {
  valeur: TypeMouvement;
  libelle: string;
  /** Sens imposé : +1 entrée, −1 sortie, 0 libre (l'ajustement va dans les deux sens). */
  sens: 1 | -1 | 0;
  motifObligatoire: boolean;
}[] = [
  { valeur: "entree",        libelle: "Entrée",                  sens:  1, motifObligatoire: false },
  { valeur: "retour",        libelle: "Retour client",           sens:  1, motifObligatoire: false },
  { valeur: "vente",         libelle: "Vente",                   sens: -1, motifObligatoire: false },
  { valeur: "perte",         libelle: "Perte / casse",           sens: -1, motifObligatoire: true },
  { valeur: "usage_interne", libelle: "Usage interne",           sens: -1, motifObligatoire: true },
  { valeur: "ajustement",    libelle: "Ajustement d'inventaire", sens:  0, motifObligatoire: true },
];

export function libelleMouvement(type: string | null | undefined): string {
  return TYPES_MOUVEMENT.find((t) => t.valeur === type)?.libelle ?? "—";
}

export function motifObligatoire(type: string | null | undefined): boolean {
  return TYPES_MOUVEMENT.find((t) => t.valeur === type)?.motifObligatoire ?? false;
}

/** Trois décimales : on pèse parfois au gramme, on n'ira jamais plus loin. */
export function arrondiQuantite(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Un nombre écrit comme on le dit : 12, 12.5 — jamais 12.000. */
export function formatQuantite(n: number | string | null | undefined): string {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return "0";
  return String(arrondiQuantite(v));
}

/** Stock après le mouvement. La quantité est signée : + à l'entrée, − à la sortie. */
export function stockApres(stockActuel: number, quantite: number): number {
  return arrondiQuantite(Number(stockActuel) + Number(quantite));
}

/**
 * Quantité signée d'un mouvement, à partir d'une quantité saisie toujours
 * positive : c'est le type qui donne le sens, jamais l'utilisateur.
 */
export function quantiteSignee(type: TypeMouvement, quantiteSaisie: number): number {
  const sens = TYPES_MOUVEMENT.find((t) => t.valeur === type)?.sens ?? 0;
  const q = arrondiQuantite(Math.abs(Number(quantiteSaisie)));
  return sens === -1 ? -q : q;
}

export const MESSAGE_MOTIF_REQUIS = "Indiquez le motif du mouvement.";

/**
 * Refus d'un mouvement, ou null s'il passe.
 *
 * Aucun stock négatif silencieux : une sortie qui ferait passer le stock sous
 * zéro est refusée, et le message dit ce qu'il reste. L'ajustement
 * d'inventaire est la seule exception — ce qui est compté dans le local fait
 * foi, même s'il contredit la base.
 */
export function refusMouvement(m: {
  type: TypeMouvement | string;
  quantite: number;
  stockActuel: number;
  motif?: string | null;
}): string | null {
  const quantite = Number(m.quantite);
  if (!Number.isFinite(quantite) || quantite === 0) {
    return "Indiquez une quantité différente de zéro.";
  }
  if (motifObligatoire(m.type) && !String(m.motif ?? "").trim()) {
    return MESSAGE_MOTIF_REQUIS;
  }

  const apres = stockApres(Number(m.stockActuel), quantite);
  if (apres < 0 && m.type !== "ajustement") {
    return `Stock insuffisant : il reste ${formatQuantite(m.stockActuel)} en stock, la sortie demandée est de ${formatQuantite(Math.abs(quantite))}.`;
  }
  return null;
}

// ── Inventaire ──────────────────────────────────────────────────────────────

/** Écart d'inventaire : compté moins théorique. Positif = on en a trouvé plus. */
export function ecartInventaire(stockTheorique: number, stockCompte: number): number {
  return arrondiQuantite(Number(stockCompte) - Number(stockTheorique));
}

export type LigneInventaire = {
  article_id: string;
  stock_theorique: number;
  stock_compte: number | null;
};

export type AjustementInventaire = {
  article_id: string;
  quantite: number;
  stock_compte: number;
};

/**
 * Ajustements à passer à la validation d'un inventaire : une ligne comptée qui
 * tombe juste ne produit rien. Une ligne laissée vide n'a pas été comptée, et
 * ne produit rien non plus — un oubli n'est pas une perte.
 */
export function ajustementsInventaire(lignes: LigneInventaire[]): AjustementInventaire[] {
  const ajustements: AjustementInventaire[] = [];
  for (const l of lignes) {
    if (l.stock_compte === null || l.stock_compte === undefined) continue;
    const compte = Number(l.stock_compte);
    if (!Number.isFinite(compte) || compte < 0) continue;
    const ecart = ecartInventaire(Number(l.stock_theorique), compte);
    if (ecart === 0) continue;
    ajustements.push({ article_id: l.article_id, quantite: ecart, stock_compte: compte });
  }
  return ajustements;
}

/** Motif commun d'un inventaire, tel qu'il apparaîtra dans l'historique. */
export function motifInventaire(dateISO: string): string {
  const [a, m, j] = dateISO.slice(0, 10).split("-");
  return `Inventaire du ${j}.${m}.${a}`;
}

// ── Prix, marge et valeur du stock ──────────────────────────────────────────

const r2 = (n: number) => Math.round(n * 100) / 100;

export type Marge = { montant: number; pourcentage: number | null };

/**
 * Marge sur le prix d'achat, en francs et en pour-cent. La TVA n'étant pas
 * activée, elle n'est pas déduite : le prix de vente est un TTC qui vaut
 * aujourd'hui son propre net. Lecture seule, à titre indicatif.
 */
export function margeArticle(
  prixVente: number | null | undefined,
  prixAchat: number | null | undefined
): Marge | null {
  if (prixVente === null || prixVente === undefined) return null;
  const vente = Number(prixVente);
  const achat = Number(prixAchat);
  if (!Number.isFinite(vente) || !Number.isFinite(achat) || !prixAchat) return null;
  const montant = r2(vente - achat);
  return { montant, pourcentage: achat > 0 ? Math.round((montant / achat) * 1000) / 10 : null };
}

/** Valeur du stock au prix d'achat. Un article sans prix d'achat ne pèse rien ici. */
export function valeurStock(
  articles: { stock_actuel: number | string | null; prix_achat: number | string | null }[]
): number {
  return r2(
    articles.reduce((somme, a) => {
      const stock = Number(a.stock_actuel ?? 0);
      const achat = Number(a.prix_achat ?? 0);
      if (!Number.isFinite(stock) || !Number.isFinite(achat)) return somme;
      return somme + stock * achat;
    }, 0)
  );
}

/** Sous le seuil : stock au niveau d'alerte ou en dessous. Sans seuil, pas d'alerte. */
export function sousLeSeuil(a: {
  stock_actuel: number | string | null;
  stock_alerte: number | string | null;
}): boolean {
  const seuil = Number(a.stock_alerte ?? 0);
  if (!Number.isFinite(seuil) || seuil <= 0) return false;
  return Number(a.stock_actuel ?? 0) <= seuil;
}

// ── Saisie d'un article ─────────────────────────────────────────────────────

export type RefusChamp = { champ: string; message: string };

const CATEGORIES = CATEGORIES_ARTICLE.map((c) => c.valeur) as string[];

/**
 * Validation d'une fiche article. Le refus nomme le champ fautif, pour que
 * l'écran puisse l'atteindre et y remettre le curseur.
 */
export function validerChampsArticle(champs: {
  nom?: string | null;
  categorie?: string | null;
  taux_tva?: number | null;
  prix_vente?: number | null;
  prix_achat?: number | null;
  stock_alerte?: number | null;
}): RefusChamp | null {
  if (!String(champs.nom ?? "").trim()) {
    return { champ: "nom", message: "Indiquez le nom de l'article." };
  }
  if (!CATEGORIES.includes(String(champs.categorie ?? ""))) {
    return { champ: "categorie", message: "Choisissez une catégorie." };
  }

  const taux = Number(champs.taux_tva);
  if (champs.taux_tva === null || champs.taux_tva === undefined ||
      !Number.isFinite(taux) || taux < 0 || taux > 100) {
    return { champ: "taux_tva", message: "Le taux de TVA doit être compris entre 0 et 100 %." };
  }

  const vente = Number(champs.prix_vente);
  if (champs.prix_vente === null || champs.prix_vente === undefined ||
      !Number.isFinite(vente) || vente < 0) {
    return { champ: "prix_vente", message: "Indiquez un prix TTC de vente valable." };
  }

  if (champs.prix_achat !== null && champs.prix_achat !== undefined) {
    const achat = Number(champs.prix_achat);
    if (!Number.isFinite(achat) || achat < 0) {
      return { champ: "prix_achat", message: "Le prix d'achat doit être un montant positif." };
    }
  }

  if (champs.stock_alerte !== null && champs.stock_alerte !== undefined) {
    const seuil = Number(champs.stock_alerte);
    if (!Number.isFinite(seuil) || seuil < 0) {
      return { champ: "stock_alerte", message: "Le seuil d'alerte doit être un nombre positif." };
    }
  }

  return null;
}

/** Référence saisie : on la normalise, on ne l'invente que si elle est vide. */
export function normaliserReference(reference: string | null | undefined): string | null {
  const r = String(reference ?? "").trim().toUpperCase();
  return r === "" ? null : r;
}

/** Un code-barres vide est un code-barres absent — l'index unique le veut ainsi. */
export function normaliserCodeBarres(code: string | null | undefined): string | null {
  const c = String(code ?? "").trim();
  return c === "" ? null : c;
}

/** Montant lu d'un champ texte : la virgule suisse est acceptée. */
export function lireNombre(brut: unknown): number | null {
  const texte = String(brut ?? "").replace(",", ".").trim();
  if (!texte) return null;
  const n = Number(texte);
  return Number.isFinite(n) ? n : null;
}

// ── Photo de l'article ──────────────────────────────────────────────────────

/**
 * Bucket PUBLIC, distinct des justificatifs.
 *
 * Une photo de produit est faite pour être vue : elle part sur le site vitrine,
 * qui est un autre projet, sans session et sans clé de service. Une URL signée,
 * même longue, finit par expirer — et personne ne serait là pour la renouveler :
 * la vitrine afficherait des images mortes. Le bucket public donne une URL
 * stable, mise en cache par le CDN, sans secret à partager. Les justificatifs
 * comptables, eux, restent dans leur bucket privé : un ticket de caisse n'a
 * rien à faire sur le web.
 */
export const BUCKET_PHOTOS_BOUTIQUE = "boutique-photos";

export function urlPhotoArticle(photoPath: string | null | undefined): string | null {
  const chemin = String(photoPath ?? "").trim();
  if (!chemin) return null;
  if (/^https?:\/\//i.test(chemin)) return chemin;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!base) return null;
  return `${base}/storage/v1/object/public/${BUCKET_PHOTOS_BOUTIQUE}/${chemin}`;
}
