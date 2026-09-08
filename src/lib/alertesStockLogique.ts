import { disponibilite } from "@/src/lib/venteEnLigneLogique";

/**
 * Alerte de retour en stock — les règles, sans base ni requête.
 *
 * Trois décisions vivent ici, et une seule fois :
 *  1. cet article peut-il porter une alerte ?
 *  2. cette adresse est-elle acceptable ?
 *  3. ce mouvement de stock fait-il REVENIR l'article ?
 *
 * La troisième est la plus importante : notifier n'est pas « du stock est
 * arrivé », c'est « il n'y en avait plus, il y en a ». Une livraison sur un
 * article déjà disponible ne réveille personne.
 */

// ── L'article peut-il porter une alerte ? ───────────────────────────────────

export type ArticleAlerte = {
  type_article?: string | null;
  vendable_en_ligne?: boolean | null;
  actif?: boolean | null;
  /** stock_actuel − stock_reserve, tel que le calcule la boutique en ligne. */
  stock_disponible?: number | string | null;
};

/**
 * On ne propose l'alerte que là où elle a un sens.
 *
 * Un article personnalisable n'est jamais « épuisé » : il se fabrique à la
 * commande. Lui coller une alerte de retour en stock promettrait un
 * réapprovisionnement qui n'existe pas.
 */
export function alerteProposable(article: ArticleAlerte | null | undefined): boolean {
  if (!article) return false;
  if (article.type_article === "personnalisable") return false;
  if (article.vendable_en_ligne !== true) return false;
  if (article.actif === false) return false;
  // C'est la disponibilité de la boutique en ligne qui tranche, pas un calcul
  // de stock refait ici.
  return disponibilite(article.stock_disponible, article.type_article).etat === "epuise";
}

// ── L'adresse ───────────────────────────────────────────────────────────────

/** Comparaison et stockage se font sur la même forme : minuscules, sans marges. */
export function normaliserEmail(brut: string | null | undefined): string {
  return String(brut ?? "").trim().toLowerCase();
}

/**
 * Une adresse plausible, pas une adresse prouvée : seul l'e-mail reçu prouve
 * une adresse. On refuse ce qui ne peut manifestement pas en être une.
 */
export function refusEmail(brut: string | null | undefined): string | null {
  const email = normaliserEmail(brut);
  if (!email) return "Indiquez l'adresse à laquelle vous prévenir.";
  if (email.length > 254) return "Cette adresse est trop longue.";
  if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email)) {
    return "Cette adresse e-mail ne semble pas valable.";
  }
  return null;
}

/** Le refus complet d'une inscription : l'article d'abord, l'adresse ensuite. */
export function refusInscription(
  article: ArticleAlerte | null | undefined,
  email: string | null | undefined
): string | null {
  if (!article) return "Cet article n'existe plus.";
  if (article.type_article === "personnalisable") {
    return "Cet article se fabrique à la commande : il n'est jamais en rupture.";
  }
  if (!alerteProposable(article)) {
    return "Cet article est disponible : vous pouvez le commander tout de suite.";
  }
  return refusEmail(email);
}

// ── Le déclenchement ────────────────────────────────────────────────────────

/**
 * Le retour en stock : on n'en était plus disponible, on l'est.
 *
 * Le seuil est le passage de ≤ 0 à > 0, pas le signe du mouvement. Une
 * livraison de dix pièces sur un article qui en avait déjà trois ne prévient
 * personne — il n'était pas parti.
 */
export function estRetourEnStock(
  disponibleAvant: number | string | null | undefined,
  disponibleApres: number | string | null | undefined
): boolean {
  const avant = Number(disponibleAvant ?? 0);
  const apres = Number(disponibleApres ?? 0);
  if (!Number.isFinite(avant) || !Number.isFinite(apres)) return false;
  return avant <= 0 && apres > 0;
}

/** Ce qui reste réellement disponible : le stock moins ce qui est déjà réservé. */
export function disponibleDe(
  stockActuel: number | string | null | undefined,
  stockReserve: number | string | null | undefined
): number {
  const stock = Number(stockActuel ?? 0);
  const reserve = Number(stockReserve ?? 0);
  const n = (Number.isFinite(stock) ? stock : 0) - (Number.isFinite(reserve) ? reserve : 0);
  return Math.round(n * 1000) / 1000;
}

// ── Les attentes, côté pension ──────────────────────────────────────────────

export type LigneAlerte = {
  id: string;
  article_id: string;
  email: string;
  cree_le: string;
  notifie_le: string | null;
};

export type FiltreAttentes = "toutes" | "en_attente" | "notifiees";

export function filtrerAttentes<T extends { notifie_le: string | null }>(
  lignes: T[],
  filtre: FiltreAttentes
): T[] {
  if (filtre === "en_attente") return lignes.filter((l) => l.notifie_le === null);
  if (filtre === "notifiees") return lignes.filter((l) => l.notifie_le !== null);
  return lignes;
}

export type ResumeArticle = {
  article_id: string;
  enAttente: number;
  notifiees: number;
  total: number;
  /** La demande la plus ancienne encore en attente. */
  depuis: string | null;
};

/**
 * Combien de monde attend quoi, par article, du plus attendu au moins attendu.
 *
 * C'est une information d'ACHAT : elle dit quoi racheter, et en quelle
 * quantité. Le tri se fait donc sur les attentes en cours, pas sur le total —
 * ceux qu'on a déjà prévenus n'attendent plus rien.
 */
export function resumeParArticle(lignes: LigneAlerte[]): ResumeArticle[] {
  const parArticle = new Map<string, ResumeArticle>();

  for (const l of lignes) {
    const r = parArticle.get(l.article_id) ?? {
      article_id: l.article_id, enAttente: 0, notifiees: 0, total: 0, depuis: null,
    };
    r.total += 1;
    if (l.notifie_le === null) {
      r.enAttente += 1;
      if (!r.depuis || l.cree_le < r.depuis) r.depuis = l.cree_le;
    } else {
      r.notifiees += 1;
    }
    parArticle.set(l.article_id, r);
  }

  return [...parArticle.values()].sort(
    (a, b) => b.enAttente - a.enAttente || b.total - a.total || a.article_id.localeCompare(b.article_id)
  );
}

/** « 7 personnes attendent cet article » — au singulier quand il n'y en a qu'une. */
export function libelleAttentes(nombre: number): string {
  if (nombre <= 0) return "Personne n'attend cet article";
  if (nombre === 1) return "1 personne attend cet article";
  return `${nombre} personnes attendent cet article`;
}

/**
 * L'ordre d'envoi : le premier inscrit est le premier prévenu.
 *
 * Ce n'est pas une file d'attente sur le stock — prévenir n'est pas réserver —
 * mais celui qui attend depuis trois semaines mérite de l'apprendre en premier.
 */
export function ordreDeNotification(lignes: LigneAlerte[]): LigneAlerte[] {
  return lignes
    .filter((l) => l.notifie_le === null)
    .slice()
    .sort((a, b) => (a.cree_le < b.cree_le ? -1 : a.cree_le > b.cree_le ? 1 : a.id.localeCompare(b.id)));
}

/** La phrase qui évite l'attente fausse. Elle part dans chaque e-mail. */
export const MENTION_SANS_RESERVATION =
  "Cet e-mail ne met rien de côté : l'article part au premier qui commande.";

// ── Le modèle d'e-mail ──────────────────────────────────────────────────────

/**
 * Les textes par défaut du message « Retour en stock ».
 *
 * Ils vivent ici, avec la règle qu'ils servent, plutôt que noyés dans le
 * fichier d'envoi : c'est le même geste que `MENTION_SANS_RESERVATION`, et
 * cela les rend lisibles par les tests sans réveiller la base.
 *
 * `email.ts` les reprend dans DEFAUTS_MODELES : l'écran « Modèles d'e-mails »
 * les propose donc à la modification comme n'importe quel autre message.
 */
export const MODELE_RETOUR_EN_STOCK = {
  sujet: "{article} est de nouveau disponible",
  titre: "Il est revenu ! 🎉",
  intro: "Vous nous aviez demandé de vous prévenir : « {article} » est de nouveau en boutique.",
  message_final: "À très vite dans la boutique ! 🐾",
} as const;

/** Ce que l'écran d'administration propose de remplacer dans ce modèle. */
export const META_RETOUR_EN_STOCK = {
  type: "retour_en_stock",
  label: "Retour en stock",
  variables: ["article", "prix"],
} as const;
