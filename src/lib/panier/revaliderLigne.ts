import {
  figerChoix,
  refusConfigurationAvecDependances,
  prixTotal,
  valeursActives,
  type ChoixFige,
  type ChoixParGroupe,
  type Dependance,
  type OptionGroupe,
} from "@/src/lib/personnalisationLogique";

/**
 * La revalidation d'une ligne de panier contre le catalogue.
 *
 * Ce que le navigateur envoie, ce sont des IDENTIFIANTS et une quantité :
 * l'article, et pour un article sur mesure le choix retenu par groupe. Tout le
 * reste — prix de base, suppléments d'options, poids, libellés, taux de TVA —
 * vient du catalogue lu en base. Un prix envoyé par le navigateur n'est jamais
 * lu ; s'il en arrive un, la fusion le dit une fois au journal et continue.
 *
 * Fonction pure : le catalogue lui est REMIS (chargerCatalogue s'en occupe),
 * elle ne lit rien. C'est elle que les tests couvrent, sans base.
 */

/** Au-delà, ce n'est plus un panier : c'est une commande de gros, qui se parle. */
export const PANIER_QUANTITE_MAX = 20;

/** Autant de lignes différentes suffit largement ; au-delà, on refuse l'envoi. */
export const PANIER_LIGNES_MAX = 50;

export type CodeLigneInvalide =
  | "ARTICLE_INDISPONIBLE"
  | "ARTICLE_CONFIGURABLE"
  | "CONFIGURATION_ILLISIBLE"
  | "OPTION_INCONNUE"
  | "OPTION_INCOMPATIBLE"
  | "OPTION_MANQUANTE"
  | "OPTION_DOUBLON"
  | "QUANTITE_INVALIDE"
  | "QUANTITE_PLAFOND"
  | "QUANTITE_STOCK"
  | "LIGNES_MAX"
  | "PRIX_MODIFIE";

export type LigneInvalide = {
  ok: false;
  code: CodeLigneInvalide;
  /** Le champ fautif : « quantite », « article_id », ou l'identifiant du groupe. */
  champ: string;
  /** Une phrase pour l'écran, déjà en français. */
  message: string;
};

/** Ce que le navigateur a le droit d'envoyer. */
export type EntreeLigne = {
  article_id: string;
  quantite: number | string;
  /** Article sur mesure : le choix par groupe, par identifiants. */
  choix?: ChoixParGroupe | { groupe_id: string; valeur_id?: string | null; texte?: string | null; nombre?: number | null }[] | null;
  /** Toléré, jamais lu : le navigateur d'une version précédente en envoyait. */
  prix_unitaire?: unknown;
  configuration?: unknown;
};

export type ArticleCatalogue = {
  id: string;
  nom: string;
  prix_vente: number;
  taux_tva: number;
  secteur_tdfn: string | null;
  type_article: string;
  poids_grammes: number | null;
  /** Déjà filtré par les règles de la vitrine : présent ici veut dire vendable. */
  stock_disponible: number;
};

export type OptionsArticle = { groupes: OptionGroupe[]; dependances: Dependance[] };

export type Catalogue = {
  articles: Map<string, ArticleCatalogue>;
  /** Seulement pour les articles sur mesure. */
  options: Map<string, OptionsArticle>;
  /** Le prix du jour, remise d'adhésion et rubriques comprises. */
  prixArticle: (article: ArticleCatalogue) => {
    prixFinal: number;
    prix_base: number | null;
    remise_pourcentage: number | null;
    remise_origine: string | null;
    remise_libelle: string | null;
  };
};

export type LigneRevalidee = {
  ok: true;
  article_id: string;
  libelle: string;
  quantite: number;
  prix_unitaire: number;
  montant: number;
  taux_tva: number;
  secteur_tdfn: string;
  poids_grammes: number | null;
  /** La remise figée à la ligne (APP 16), telle que le catalogue la donne. */
  prix_base: number | null;
  remise_pourcentage: number | null;
  remise_origine: string | null;
  remise_libelle: string | null;
  /** Article sur mesure : les choix figés, prêts à être écrits. */
  configuration: ChoixFige[] | null;
  /** Vrai quand le navigateur a envoyé un prix : il a été ignoré. */
  prixClientIgnore: boolean;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

const invalide = (code: CodeLigneInvalide, champ: string, message: string): LigneInvalide =>
  ({ ok: false, code, champ, message });

/**
 * Le choix, remis sous la forme d'un objet par groupe. Un groupe cité deux
 * fois est refusé : on ne devine pas lequel des deux compte.
 */
function normaliserChoix(
  brut: EntreeLigne["choix"],
): { ok: true; choix: ChoixParGroupe } | LigneInvalide {
  if (!brut) return { ok: true, choix: {} };
  if (!Array.isArray(brut)) return { ok: true, choix: brut as ChoixParGroupe };

  const choix: ChoixParGroupe = {};
  for (const c of brut) {
    const groupe = String(c?.groupe_id ?? "").trim();
    if (!groupe) return invalide("OPTION_INCONNUE", "choix", "Une option envoyée ne dit pas à quelle question elle répond.");
    if (choix[groupe]) {
      return invalide("OPTION_DOUBLON", groupe, "La même question a reçu deux réponses.");
    }
    choix[groupe] = {
      valeur_id: c.valeur_id ?? null,
      texte: c.texte ?? null,
      nombre: c.nombre ?? null,
    };
  }
  return { ok: true, choix };
}

/** Une quantité : un entier, au moins 1, au plus PANIER_QUANTITE_MAX. */
export function verifierQuantite(brut: unknown, plafondStock: number | null): { ok: true; quantite: number } | LigneInvalide {
  if (typeof brut !== "number" || !Number.isFinite(brut) || !Number.isInteger(brut) || brut < 1) {
    return invalide("QUANTITE_INVALIDE", "quantite", "La quantité doit être un nombre entier, au moins 1.");
  }
  if (brut > PANIER_QUANTITE_MAX) {
    return invalide("QUANTITE_PLAFOND", "quantite", `Au maximum ${PANIER_QUANTITE_MAX} exemplaires par ligne. Écrivez-nous pour une commande plus grande.`);
  }
  if (plafondStock !== null && brut > plafondStock) {
    return invalide("QUANTITE_STOCK", "quantite", plafondStock <= 0
      ? "Cet article est épuisé."
      : `Il n'en reste que ${plafondStock}.`);
  }
  return { ok: true, quantite: brut };
}

/**
 * Une ligne entrante, relue contre le catalogue. Renvoie la ligne recalculée,
 * ou le refus avec son code et son champ.
 */
export function revaliderLigne(entree: EntreeLigne, catalogue: Catalogue): LigneRevalidee | LigneInvalide {
  const article = catalogue.articles.get(String(entree.article_id ?? ""));
  // Le catalogue ne contient que ce qui est actif, publié et vendable en
  // ligne : absent d'ici veut dire « plus proposé », quelle qu'en soit la raison.
  if (!article) {
    return invalide("ARTICLE_INDISPONIBLE", "article_id", "Cet article n'est plus proposé.");
  }

  const surMesure = article.type_article === "personnalisable";
  const normalise = normaliserChoix(entree.choix);
  if (!("ok" in normalise) || normalise.ok !== true) return normalise as LigneInvalide;
  const choix = normalise.choix;
  const aDesChoix = Object.keys(choix).length > 0;

  if (!surMesure && aDesChoix) {
    return invalide("ARTICLE_CONFIGURABLE", "choix", "Cet article ne se configure pas.");
  }
  if (surMesure && !aDesChoix) {
    // Un panier d'une version précédente ne garde que les libellés figés : on
    // ne peut pas les recontrôler, donc on demande de reconfigurer.
    return invalide(
      entree.configuration ? "CONFIGURATION_ILLISIBLE" : "ARTICLE_CONFIGURABLE",
      "choix",
      "Cet article se configure avant d'être mis au panier : reprenez-le depuis sa fiche.",
    );
  }

  // ── Les options : elles doivent venir de CE catalogue ────────────────────
  let configuration: ChoixFige[] | null = null;
  let prixUnitaire = 0;

  if (surMesure) {
    const options = catalogue.options.get(article.id);
    if (!options) {
      return invalide("ARTICLE_INDISPONIBLE", "article_id", "Les options de cet article ne sont plus disponibles.");
    }
    const { groupes, dependances } = options;
    const parGroupe = new Map(groupes.map((g) => [g.id, g]));

    for (const [groupeId, reponse] of Object.entries(choix)) {
      const groupe = parGroupe.get(groupeId);
      if (!groupe) {
        return invalide("OPTION_INCONNUE", groupeId, "Une des questions n'existe plus pour cet article.");
      }
      const valeurId = reponse?.valeur_id ?? null;
      if (!valeurId) continue; // texte, mesure, booléen : contrôlés par refusConfiguration…

      if (valeursActives(groupe).some((v) => v.id === valeurId)) continue;
      // La valeur existe-t-elle AILLEURS ? Alors elle n'est pas de ce groupe.
      const ailleurs = groupes.some((g) => g.valeurs.some((v) => v.id === valeurId));
      return ailleurs
        ? invalide("OPTION_INCOMPATIBLE", groupeId, `La réponse choisie n'appartient pas à « ${groupe.nom} ».`)
        : invalide("OPTION_INCONNUE", groupeId, `Cette réponse n'existe plus pour « ${groupe.nom} ».`);
    }

    // Obligatoires, dépendances, bornes des mesures : la règle du configurateur.
    const refus = refusConfigurationAvecDependances(groupes, choix, dependances);
    if (refus) {
      const groupeManquant = groupes.find((g) => g.obligatoire && !choix[g.id]);
      return invalide("OPTION_MANQUANTE", groupeManquant?.id ?? "choix", refus);
    }

    configuration = figerChoix(groupes, choix, dependances);
    // Le prix d'un article sur mesure : sa base et ses suppléments, comme au
    // configurateur. Les rubriques et la remise d'adhésion ne s'y appliquent pas.
    prixUnitaire = r2(prixTotal(article.prix_vente, groupes, choix, dependances));
  }

  // ── La quantité ──────────────────────────────────────────────────────────
  // Un entier, et rien d'autre : « 3 » venu d'un JSON n'est pas un nombre, et
  // une pièce sur mesure se fabrique de toute façon à l'unité.
  const verif = verifierQuantite(
    surMesure ? 1 : entree.quantite,
    surMesure ? null : Math.max(article.stock_disponible, 0),
  );
  if (!("ok" in verif) || verif.ok !== true) return verif as LigneInvalide;
  const quantite = verif.quantite;

  // ── Le prix : du catalogue, jamais du navigateur ─────────────────────────
  const remise = surMesure
    ? { prixFinal: prixUnitaire, prix_base: null, remise_pourcentage: null, remise_origine: null, remise_libelle: null }
    : catalogue.prixArticle(article);
  const prix = r2(remise.prixFinal);

  return {
    ok: true,
    article_id: article.id,
    libelle: surMesure ? `${article.nom} — sur mesure` : article.nom,
    quantite,
    prix_unitaire: prix,
    montant: r2(quantite * prix),
    taux_tva: Number(article.taux_tva),
    secteur_tdfn: article.secteur_tdfn ?? "commerce",
    poids_grammes: article.poids_grammes,
    prix_base: remise.prix_base,
    remise_pourcentage: remise.remise_pourcentage,
    remise_origine: remise.remise_origine,
    remise_libelle: remise.remise_libelle,
    configuration,
    prixClientIgnore: entree.prix_unitaire !== undefined && entree.prix_unitaire !== null,
  };
}

/** Le refus d'un envoi trop gros, avant même de regarder les lignes. */
export function refusNombreDeLignes(nombre: number): LigneInvalide | null {
  return nombre > PANIER_LIGNES_MAX
    ? invalide("LIGNES_MAX", "lignes", `Un panier ne peut pas dépasser ${PANIER_LIGNES_MAX} lignes.`)
    : null;
}

/** Le prix a bougé entre la mise au panier et la validation : on le fait revoir. */
export function refusPrixModifie(ancien: number, nouveau: number): LigneInvalide | null {
  return r2(ancien) === r2(nouveau)
    ? null
    : invalide("PRIX_MODIFIE", "prix_unitaire",
        "Un prix a changé depuis que vous l'avez mis au panier : vérifiez votre panier avant de valider.");
}

/**
 * Les identifiants d'un choix DÉJÀ figé (ligne de panier en base), quand ils
 * y sont. Les lignes figées avant cette règle n'en portent pas : on ne les
 * devine pas depuis les libellés, on rend `undefined` et l'appelant décide.
 */
export function choixDepuisConfiguration(configuration: unknown): ChoixParGroupe | undefined {
  if (!Array.isArray(configuration) || configuration.length === 0) return undefined;
  const choix: ChoixParGroupe = {};
  for (const c of configuration as Record<string, unknown>[]) {
    const groupe = typeof c?.groupe_id === "string" ? c.groupe_id : null;
    if (!groupe) return undefined;
    choix[groupe] = {
      valeur_id: typeof c.valeur_id === "string" ? c.valeur_id : null,
      texte: typeof c.valeur_texte === "string" ? c.valeur_texte : null,
      nombre: typeof c.valeur_nombre === "number" ? c.valeur_nombre : null,
      ...(typeof c.valeur_libelle === "string" && c.valeur_libelle === "Oui" ? { booleen: true } : {}),
    };
  }
  return choix;
}
