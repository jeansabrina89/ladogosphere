/**
 * Règles pures de la vente en ligne : disponibilité affichée, remise membre,
 * poids et frais de port, modes de remise, statuts d'une commande.
 *
 * Aucune dépendance à la base — c'est ici que vivent les décisions, et c'est
 * ce fichier que les tests couvrent. La transaction, elle, vit dans les RPC
 * confirmer_commande / remettre_commande, qui appellent eux-mêmes
 * finaliser_vente et passer_ecriture : le moteur d'écritures n'est pas
 * contourné.
 *
 * TVA : aucune n'est calculée. Les taux sont figés ligne à ligne, la
 * ventilation viendra en APP 14.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;

const nb = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

// ── Disponibilité affichée ─────────────────────────────────────────────────

/**
 * Ce que le client a le droit de savoir.
 *
 * Au-delà de trois, la quantité exacte ne le regarde pas : elle renseigne un
 * concurrent et ne l'aide en rien. En dessous, elle le presse utilement —
 * « Plus que 2 » est une information, « 47 en stock » est une indiscrétion.
 */
export type Disponibilite =
  | { etat: "en_stock"; libelle: string }
  | { etat: "dernier"; libelle: string }
  | { etat: "epuise"; libelle: string };

export function disponibilite(
  stockDisponible: number | string | null | undefined,
  typeArticle?: string | null
): Disponibilite {
  // Un article personnalisable se fabrique : il n'a pas de stock à épuiser.
  if (typeArticle === "personnalisable") {
    return { etat: "en_stock", libelle: "Sur commande" };
  }
  const n = Math.max(Math.floor(nb(stockDisponible) ?? 0), 0);
  if (n <= 0) return { etat: "epuise", libelle: "Épuisé" };
  if (n <= 3) return { etat: "dernier", libelle: n === 1 ? "Dernier exemplaire" : `Plus que ${n}` };
  return { etat: "en_stock", libelle: "En stock" };
}

export function estCommandable(
  stockDisponible: number | string | null | undefined,
  typeArticle?: string | null
): boolean {
  return disponibilite(stockDisponible, typeArticle).etat !== "epuise";
}

// ── Le panier ──────────────────────────────────────────────────────────────

export type LignePanier = {
  article_id: string;
  libelle: string;
  quantite: number;
  prix_unitaire: number | string;
  taux_tva: number | string;
  /** Renseigné quand la ligne est un article configuré d'APP 12. */
  commande_personnalisee_id?: string | null;
  /** Poids unitaire, pour le colis. Null : poids inconnu. */
  poids_grammes?: number | null;
  expediable?: boolean;
  type_article?: string | null;
  /** Stock disponible au moment de l'affichage, pour prévenir tôt. */
  stock_disponible?: number | null;
  /**
   * APP 16 : la remise se pose SUR LA LIGNE, pas sur le panier.
   *
   * `prix_unitaire` est ce qui est réellement payé ; `prix_base` est le prix
   * pratiqué hors action, et il n'est jamais gonflé pour grossir l'écart.
   */
  prix_base?: number | string | null;
  remise_pourcentage?: number | string | null;
  remise_origine?: string | null;
  remise_libelle?: string | null;
};

/** Le prix de base d'une ligne : celui figé s'il existe, sinon le prix payé. */
export function prixBaseLigne(l: LignePanier): number {
  const base = nb(l.prix_base);
  return r2(base === null ? Number(l.prix_unitaire ?? 0) : base);
}

/** Ce que la remise enlève sur cette ligne, quantité comprise. */
export function remiseLigne(l: LignePanier): number {
  return r2(Number(l.quantite) * (prixBaseLigne(l) - r2(Number(l.prix_unitaire ?? 0))));
}

export function montantLigne(l: LignePanier): number {
  return r2(Number(l.quantite) * Number(l.prix_unitaire ?? 0));
}

export function sousTotal(lignes: LignePanier[]): number {
  return r2(lignes.reduce((s, l) => s + montantLigne(l), 0));
}

export function nombreArticles(lignes: LignePanier[]): number {
  return lignes.reduce((s, l) => s + Number(l.quantite), 0);
}

// ── Remise membre ──────────────────────────────────────────────────────────

/**
 * Ce que les remises de ligne enlèvent au total, tous motifs confondus.
 *
 * Depuis APP 16 la remise n'est plus un rabais de PANIER : elle se pose sur
 * chaque ligne, parce qu'une action et la remise membre ne s'additionnent pas
 * et que l'arbitrage se fait article par article. Le client voit toujours ce
 * qu'il économise, et il retrouve toujours le prix de base de chaque article —
 * la promesse n'a pas changé, seul l'endroit du calcul a changé.
 *
 * Elle porte sur les articles, pas sur le port : la Poste ne fait pas de
 * remise aux membres.
 */
export function remiseTotale(lignes: LignePanier[]): number {
  return r2(lignes.reduce((s, l) => s + remiseLigne(l), 0));
}

/** Le total AU PRIX DE BASE, avant les remises de ligne. */
export function sousTotalBase(lignes: LignePanier[]): number {
  return r2(lignes.reduce((s, l) => s + r2(Number(l.quantite) * prixBaseLigne(l)), 0));
}

/**
 * Les remises regroupées par ORIGINE, pour le récapitulatif du panier.
 *
 * Un panier peut porter une action sur une ligne et la remise membre sur les
 * autres : chacune se nomme, chacune s'additionne de son côté. Une remise
 * anonyme n'apprend rien au client.
 */
export function remisesParOrigine(
  lignes: LignePanier[]
): { libelle: string; montant: number }[] {
  const parLibelle = new Map<string, number>();
  for (const l of lignes) {
    const montant = remiseLigne(l);
    if (montant <= 0) continue;
    const libelle = String(l.remise_libelle ?? "").trim() || "Remise";
    parLibelle.set(libelle, r2((parLibelle.get(libelle) ?? 0) + montant));
  }
  return [...parLibelle].map(([libelle, montant]) => ({ libelle, montant }));
}

export function libelleRemiseMembre(pourcent: number | string | null | undefined): string {
  const taux = nb(pourcent) ?? 0;
  return `Remise membre −${taux % 1 === 0 ? taux : taux.toFixed(1)} %`;
}

// ── Poids et frais de port ─────────────────────────────────────────────────

/** Poids total du panier, en grammes. Un poids inconnu compte pour zéro. */
export function poidsTotal(lignes: LignePanier[]): number {
  return lignes.reduce((s, l) => s + Number(l.quantite) * (nb(l.poids_grammes) ?? 0), 0);
}

/** Les lignes dont le poids n'est pas renseigné : le colis ne se calcule pas à l'aveugle. */
export function lignesSansPoids(lignes: LignePanier[]): LignePanier[] {
  return lignes.filter((l) => l.type_article !== "personnalisable" && nb(l.poids_grammes) === null);
}

export type PalierPort = { jusqu_a_grammes: number; prix: number };

/** Les paliers par poids croissant : l'ordre de saisie ne compte pas. */
export function trierPaliers(paliers: PalierPort[]): PalierPort[] {
  return [...paliers].sort((a, b) => a.jusqu_a_grammes - b.jusqu_a_grammes);
}

/**
 * Une grille qu'on peut chiffrer : au moins un palier, des poids entiers
 * strictement croissants, des prix positifs ou nuls. Une seule entorse, et
 * c'est toute la grille qui ne vaut rien — un palier manquant ferait payer le
 * tarif d'un colis plus léger.
 */
export function grilleCoherente(grille: PalierPort[]): boolean {
  if (grille.length === 0) return false;
  let precedent = 0;
  for (const p of grille) {
    if (!Number.isInteger(p.jusqu_a_grammes) || p.jusqu_a_grammes <= precedent) return false;
    if (!Number.isFinite(p.prix) || p.prix < 0) return false;
    precedent = p.jusqu_a_grammes;
  }
  return true;
}

/**
 * La grille de frais de port, telle qu'elle est enregistrée en paramètre.
 * Une grille illisible ne fait pas planter la boutique : elle rend une grille
 * vide, et l'envoi postal se refuse faute de tarif.
 *
 * Elle ne répare rien en silence : un prix illisible ne devient pas 0 — ce
 * serait une livraison offerte par accident —, un palier invalide n'est pas
 * écarté pour garder les autres. Toute la grille est refusée.
 */
export function lireGrillePort(brut: unknown): PalierPort[] {
  const source =
    typeof brut === "string"
      ? (() => { try { return JSON.parse(brut); } catch { return []; } })()
      : brut;
  if (!Array.isArray(source)) return [];
  const paliers: PalierPort[] = [];
  for (const p of source) {
    const jusqu_a_grammes = nb((p as PalierPort)?.jusqu_a_grammes);
    const prix = nb((p as PalierPort)?.prix);
    if (jusqu_a_grammes === null || prix === null) return [];
    paliers.push({ jusqu_a_grammes, prix: r2(prix) });
  }
  const triee = trierPaliers(paliers);
  return grilleCoherente(triee) ? triee : [];
}

/**
 * La grille saisie dans Réglages → Boutique, et le poids maximum d'un colis.
 *
 * Les paliers arrivent déjà triés par l'écran ; ce contrôle ne trie pas, il
 * juge : poids strictement croissants, prix positifs ou nuls, et le dernier
 * palier ne dépasse pas le poids maximum. Sans cette dernière règle, un colis
 * plus lourd que le maximum aurait un prix — et un colis entre le dernier
 * palier et le maximum n'en aurait pas.
 */
export function validerGrillePort(p: {
  paliers: PalierPort[];
  poidsMaxGrammes: number;
}): { ok: true } | { ok: false; message: string } {
  const max = p.poidsMaxGrammes;
  if (!Number.isInteger(max) || max <= 0) {
    return { ok: false, message: "Le poids maximum d'un colis doit être un nombre positif." };
  }
  if (p.paliers.length === 0) {
    return { ok: false, message: "La grille doit compter au moins un palier : sans tarif, rien ne peut partir par la poste." };
  }
  let precedent = 0;
  for (const palier of p.paliers) {
    if (!Number.isInteger(palier.jusqu_a_grammes) || palier.jusqu_a_grammes <= 0) {
      return { ok: false, message: "Chaque palier indique un poids positif." };
    }
    if (palier.jusqu_a_grammes <= precedent) {
      return { ok: false, message: "Les poids des paliers doivent être strictement croissants : deux paliers ne peuvent pas avoir le même poids." };
    }
    if (!Number.isFinite(palier.prix) || palier.prix < 0) {
      return { ok: false, message: "Chaque palier a un prix, positif ou nul." };
    }
    precedent = palier.jusqu_a_grammes;
  }
  if (precedent > max) {
    return {
      ok: false,
      message: `Le dernier palier (${formatPoids(precedent)}) dépasse le poids maximum d'un colis (${formatPoids(max)}).`,
    };
  }
  return { ok: true };
}

/** Une ligne de la grille telle qu'on la tape à l'écran : kilos et francs. */
export type LigneSaisieGrille = { kg: string; prix: string };

/** « 2 », « 2,5 », « 0.75 » : un nombre à la suisse, ou null. */
function lireDecimal(brut: string, decimalesMax: number): number | null {
  const texte = String(brut ?? "").trim().replace(/[’'\s]/g, "");
  if (!new RegExp(`^\\d+([.,]\\d{1,${decimalesMax}})?$`).test(texte)) return null;
  return Number(texte.replace(",", "."));
}

/** La grille enregistrée, présentée pour l'écran : kilos et francs. */
export function grilleEnSaisie(grille: PalierPort[]): LigneSaisieGrille[] {
  return grille.map((p) => ({
    kg: String(Math.round(p.jusqu_a_grammes) / 1000),
    prix: r2(p.prix).toFixed(2),
  }));
}

/**
 * La saisie de Réglages → Boutique : les paliers (en kilos, à l'écran) et le
 * poids maximum d'un colis. Les lignes entièrement vides sont ignorées ; les
 * paliers sont triés par poids croissant, puis jugés par validerGrillePort.
 * Le résultat est au format que lit fraisPort — il n'y en a pas d'autre.
 */
export function lireSaisieGrille(p: {
  lignes: LigneSaisieGrille[];
  poidsMaxKg: string;
}): { ok: true; paliers: PalierPort[]; poidsMaxGrammes: number } | { ok: false; message: string } {
  const max = lireDecimal(p.poidsMaxKg, 3);
  if (max === null || !(max > 0)) {
    return { ok: false, message: "Indiquez le poids maximum d'un colis en kilos, par exemple 10." };
  }
  const paliers: PalierPort[] = [];
  for (const l of p.lignes) {
    if (!String(l.kg ?? "").trim() && !String(l.prix ?? "").trim()) continue;
    const kg = lireDecimal(l.kg, 3);
    if (kg === null || !(kg > 0)) {
      return { ok: false, message: `« ${String(l.kg ?? "").trim() || "(vide)"} » n'est pas un poids en kilos : indiquez par exemple 2 ou 0,5.` };
    }
    const prix = lireDecimal(l.prix, 2);
    if (prix === null) {
      return { ok: false, message: `Le palier de ${kg} kg n'a pas de prix lisible : indiquez un montant, 0 compris.` };
    }
    paliers.push({ jusqu_a_grammes: Math.round(kg * 1000), prix: r2(prix) });
  }
  const tries = trierPaliers(paliers);
  const poidsMaxGrammes = Math.round(max * 1000);
  const verdict = validerGrillePort({ paliers: tries, poidsMaxGrammes });
  if (!verdict.ok) return verdict;
  return { ok: true, paliers: tries, poidsMaxGrammes };
}

/**
 * Le seuil de livraison offerte, tel qu'il est enregistré en paramètre.
 * Vide, nul ou illisible : null — la livraison n'est jamais offerte.
 */
export function lireFrancoPort(brut: unknown): number | null {
  const n = nb(brut);
  return n !== null && n > 0 ? r2(n) : null;
}

/**
 * Le montant des articles atteint-il le seuil de livraison offerte ?
 *
 * Le montant comparé est ce que le client paie pour la marchandise : APRÈS
 * les remises de ligne (la remise membre comprise), AVANT le port. Un membre
 * qui commande 105.– d'articles en paie 94.50 : il n'atteint pas 100.–.
 * Un seuil null n'est jamais atteint.
 */
export function francoAtteint(montantArticles: number, seuil: number | null | undefined): boolean {
  if (seuil === null || seuil === undefined || !(seuil > 0)) return false;
  return r2(montantArticles) >= r2(seuil);
}

/** Ce qu'il faut pour décider d'une livraison offerte. */
export type Franco = { montantArticles: number; seuil: number | null | undefined };

/**
 * Frais de port pour un poids donné : le premier palier qui le contient.
 * Au-delà du dernier palier, il n'y a pas de tarif — et donc pas d'envoi :
 * on rend null plutôt qu'un prix inventé.
 *
 * C'est la SEULE fonction qui chiffre le port. La livraison offerte y vit
 * aussi : le seuil atteint, le port vaut 0. Mais elle n'ouvre pas l'envoi là
 * où il n'y a pas de tarif — elle annule un prix, elle n'en crée pas. Les
 * autres conditions de l'envoi postal (articles expédiables, poids maximum)
 * restent jugées par optionsRemise, avant elle.
 */
export function fraisPort(
  poidsGrammes: number,
  grille: PalierPort[],
  franco?: Franco | null,
): number | null {
  // Vide ou incohérente : pas de tarif, donc pas d'envoi. Jamais un 0 par défaut.
  if (!grilleCoherente(grille)) return null;
  const poids = Math.max(poidsGrammes, 0);
  const palier = grille.find((p) => poids <= p.jusqu_a_grammes);
  if (!palier) return null;
  if (franco && francoAtteint(franco.montantArticles, franco.seuil)) return 0;
  return r2(palier.prix);
}

/**
 * La saisie de Réglages → Boutique : « Livraison offerte à partir de ».
 * Vide : jamais (la valeur enregistrée est vide). Sinon un nombre positif, en
 * francs, deux décimales au plus. La virgule suisse est acceptée.
 */
export function lireSaisieFrancoPort(
  brut: unknown,
): { ok: true; valeur: string; seuil: number | null } | { ok: false; message: string } {
  // Les séparateurs de milliers (1'000, 1’000, 1 000) ne changent rien au montant.
  const texte = String(brut ?? "").trim().replace(/[’'\s]/g, "");
  if (texte === "") return { ok: true, valeur: "", seuil: null };
  if (!/^\d+([.,]\d{1,2})?$/.test(texte)) {
    return { ok: false, message: "Indiquez un montant en francs, par exemple 100 ou 99.50 — ou laissez vide pour ne jamais offrir la livraison." };
  }
  const n = r2(Number(texte.replace(",", ".")));
  if (!(n > 0)) return { ok: false, message: "Le seuil doit être supérieur à zéro. Laissez vide pour ne jamais offrir la livraison." };
  return { ok: true, valeur: String(n), seuil: n };
}

/** « 100.– » pour un montant rond, « 99.50 » sinon : le seuil comme on l'affiche. */
export function libelleSeuil(seuil: number): string {
  const n = r2(seuil);
  return n % 1 === 0 ? `${n}.–` : n.toFixed(2);
}

// ── Modes de remise ────────────────────────────────────────────────────────

export type ModeRemise = "retrait" | "depart_chien" | "postal";

export type OptionRemise = {
  valeur: ModeRemise;
  libelle: string;
  /** Ce que ça coûte. Null : indisponible, donc rien à payer. */
  frais: number | null;
  disponible: boolean;
  /** Pourquoi c'est indisponible, en toutes lettres. Jamais une option muette. */
  raison: string | null;
};

export type ContexteRemise = {
  lignes: LignePanier[];
  /** Le client a-t-il une réservation à venir ou en cours ? */
  reservationAVenir: boolean;
  grillePort: PalierPort[];
  poidsMaxGrammes: number;
  /** Seuil de livraison offerte, en francs d'articles. Null : jamais offerte. */
  francoPortDes?: number | null;
};

/**
 * Les trois modes, TOUJOURS affichés — un mode absent laisse croire qu'il
 * n'existe pas ; un mode grisé avec sa raison apprend quelque chose. C'est la
 * même règle que pour les coloris indisponibles du configurateur.
 */
export function optionsRemise(c: ContexteRemise): OptionRemise[] {
  const nonExpediables = c.lignes.filter(
    (l) => l.type_article !== "personnalisable" && l.expediable === false
  );
  const poids = poidsTotal(c.lignes);
  const sansPoids = lignesSansPoids(c.lignes);
  const port = fraisPort(poids, c.grillePort, {
    montantArticles: sousTotal(c.lignes),
    seuil: c.francoPortDes ?? null,
  });

  const raisonPostal =
    c.lignes.length === 0 ? "Votre panier est vide."
    : nonExpediables.length > 0
      ? nonExpediables.some((l) => (l.libelle ?? "").length >= 0) && nonExpediables.length === 1
        ? `« ${nonExpediables[0].libelle} » ne peut pas être expédié : c'est trop lourd pour un colis.`
        : `${nonExpediables.length} articles de votre panier ne peuvent pas être expédiés : c'est trop lourd pour un colis.`
    : sansPoids.length > 0
      ? `Le poids de « ${sansPoids[0].libelle} » n'est pas connu : l'envoi ne peut pas être chiffré.`
    : poids > c.poidsMaxGrammes
      ? `Ce panier dépasse ${formatPoids(c.poidsMaxGrammes)} : il faut venir le chercher.`
    : port === null
      ? "Aucun tarif d'envoi ne couvre ce poids."
    : null;

  return [
    {
      valeur: "retrait",
      libelle: "Retrait à la pension",
      frais: 0,
      disponible: c.lignes.length > 0,
      raison: c.lignes.length === 0 ? "Votre panier est vide." : null,
    },
    {
      valeur: "depart_chien",
      libelle: "Remise au départ de votre chien",
      frais: 0,
      disponible: c.lignes.length > 0 && c.reservationAVenir,
      raison:
        c.lignes.length === 0 ? "Votre panier est vide."
        : !c.reservationAVenir
          ? "Vous n'avez pas de séjour prévu. Cette option reviendra dès votre prochaine réservation."
          : null,
    },
    {
      valeur: "postal",
      libelle: "Envoi postal",
      frais: raisonPostal === null ? port : null,
      disponible: raisonPostal === null,
      raison: raisonPostal,
    },
  ];
}

export function optionRemise(c: ContexteRemise, mode: ModeRemise): OptionRemise {
  return optionsRemise(c).find((o) => o.valeur === mode)!;
}

/**
 * Ce que le panier dit de la livraison offerte.
 *
 * Rien quand le seuil est null, rien quand l'envoi postal n'est pas possible :
 * annoncer une livraison offerte sur un colis qu'on ne peut pas envoyer serait
 * une promesse creuse. Sinon, le seuil et s'il est atteint — jamais la
 * distance qui reste : ce n'est pas le ton de la maison.
 */
export function infoLivraisonOfferte(c: ContexteRemise): { seuil: number; atteint: boolean } | null {
  const seuil = c.francoPortDes ?? null;
  if (seuil === null || !(seuil > 0)) return null;
  if (!optionRemise(c, "postal").disponible) return null;
  return { seuil, atteint: francoAtteint(sousTotal(c.lignes), seuil) };
}

/**
 * La ligne de port d'une commande CONFIRMÉE, lue sur ses frais figés.
 *   • « offerte » : un envoi postal à 0.– — la livraison offerte ;
 *   • un montant : un envoi postal payant ;
 *   • null : un retrait ou une remise au départ du chien, sans ligne de port.
 */
export function mentionPortCommande(c: {
  mode_remise: string | null | undefined;
  frais_port: number | string | null | undefined;
}): "offerte" | number | null {
  if (c.mode_remise !== "postal") return null;
  const port = r2(nb(c.frais_port) ?? 0);
  return port > 0 ? port : "offerte";
}

/** « 10 kg », « 750 g » — le poids comme on le dit. */
export function formatPoids(grammes: number): string {
  const g = Math.max(Math.round(grammes), 0);
  if (g < 1000) return `${g} g`;
  const kg = g / 1000;
  return `${kg % 1 === 0 ? kg : kg.toFixed(1)} kg`;
}

// ── Le total ───────────────────────────────────────────────────────────────

export type Total = {
  /** Les articles à leur prix de base — celui pratiqué hors action. */
  sousTotal: number;
  /** Ce que les remises de ligne enlèvent, tous motifs confondus. */
  remise: number;
  port: number;
  aPayer: number;
};

/**
 * Le total, ligne par ligne, dans l'ordre où il se lit : les articles, ce que
 * les remises enlèvent, ce que la Poste ajoute. Aucun de ces trois n'est fondu
 * dans un autre.
 *
 * Les remises sont déjà DANS les lignes — c'est `prixApplicable` qui les y a
 * mises. Ici on ne fait que les additionner pour les montrer : le total à payer
 * reste la somme des lignes plus le port, et rien n'est retiré deux fois.
 */
export function totalCommande(p: {
  lignes: LignePanier[];
  fraisPort: number | null;
}): Total {
  const base = sousTotalBase(p.lignes);
  const remise = remiseTotale(p.lignes);
  const port = r2(Math.max(p.fraisPort ?? 0, 0));
  return { sousTotal: base, remise, port, aPayer: r2(base - remise + port) };
}

// ── Refus de confirmation ──────────────────────────────────────────────────

/**
 * Ce qui empêche de confirmer, côté navigateur comme côté serveur. Le serveur
 * revérifiera le stock dans la transaction — ici on prévient tôt, là-bas on
 * garantit.
 */
export function refusConfirmation(p: {
  lignes: LignePanier[];
  mode: ModeRemise | null;
  contexte: ContexteRemise;
  modePaiement: ModePaiement | null;
  adresseComplete?: boolean;
}): string | null {
  if (p.lignes.length === 0) return "Votre panier est vide.";
  if (!p.mode) return "Choisissez comment vous voulez recevoir votre commande.";

  const option = optionRemise(p.contexte, p.mode);
  if (!option.disponible) return option.raison ?? "Ce mode de remise n'est pas possible.";

  if (p.mode === "postal" && p.adresseComplete === false) {
    return "Indiquez l'adresse de livraison.";
  }
  if (!p.modePaiement) return "Choisissez comment vous voulez payer.";

  // Ce qui a pu être acheté au comptoir entre-temps se voit déjà ici.
  const epuise = p.lignes.find(
    (l) =>
      l.type_article !== "personnalisable" &&
      l.stock_disponible !== null &&
      l.stock_disponible !== undefined &&
      Number(l.stock_disponible) < Number(l.quantite)
  );
  if (epuise) {
    return `« ${epuise.libelle} » n'est plus disponible en quantité suffisante. Retirez-le du panier pour continuer.`;
  }
  return null;
}

// ── Paiement ───────────────────────────────────────────────────────────────

export type ModePaiement = "sur_place" | "facture" | "en_ligne";

export const MODES_PAIEMENT_LIGNE: {
  valeur: ModePaiement;
  libelle: string;
  aide: string;
  actif: boolean;
}[] = [
  {
    valeur: "sur_place",
    libelle: "Je paie au retrait",
    aide: "Vous réglez en venant chercher votre commande, comme au comptoir.",
    actif: true,
  },
  {
    valeur: "facture",
    libelle: "Recevoir une facture",
    aide: "La facture part par e-mail à la confirmation, avec son bulletin de versement QR.",
    actif: true,
  },
  {
    valeur: "en_ligne",
    libelle: "Payer en ligne",
    aide: "Pas encore disponible.",
    actif: false,
  },
];

export function libelleModePaiement(mode: string | null | undefined): string {
  return MODES_PAIEMENT_LIGNE.find((m) => m.valeur === mode)?.libelle ?? "—";
}

// ── Statuts d'une commande ─────────────────────────────────────────────────

export type StatutCommandeLigne =
  | "panier" | "confirmee" | "en_preparation" | "prete" | "remise" | "expediee" | "annulee";

export const STATUTS_COMMANDE_LIGNE: {
  valeur: StatutCommandeLigne;
  libelle: string;
  /** Client : ce qu'il lit. */
  libelleClient: string;
}[] = [
  { valeur: "panier", libelle: "Panier", libelleClient: "Panier en cours" },
  { valeur: "confirmee", libelle: "À préparer", libelleClient: "Commande reçue" },
  { valeur: "en_preparation", libelle: "En préparation", libelleClient: "En préparation" },
  { valeur: "prete", libelle: "Prête", libelleClient: "Prête" },
  { valeur: "remise", libelle: "Remise", libelleClient: "Remise" },
  { valeur: "expediee", libelle: "Expédiée", libelleClient: "Expédiée" },
  { valeur: "annulee", libelle: "Annulée", libelleClient: "Annulée" },
];

export function libelleStatutLigne(statut: string | null | undefined, pourClient = false): string {
  const s = STATUTS_COMMANDE_LIGNE.find((x) => x.valeur === statut);
  if (!s) return "—";
  return pourClient ? s.libelleClient : s.libelle;
}

/** Une commande dont le stock est retenu : confirmée et pas encore sortie. */
export function reserveLeStock(statut: string | null | undefined): boolean {
  return statut === "confirmee" || statut === "en_preparation" || statut === "prete";
}

/** Le statut de sortie qui correspond au mode de remise choisi. */
export function statutSortie(mode: ModeRemise | null | undefined): "remise" | "expediee" {
  return mode === "postal" ? "expediee" : "remise";
}

export function libelleModeRemise(mode: string | null | undefined): string {
  switch (mode) {
    case "retrait": return "Retrait à la pension";
    case "depart_chien": return "Remise au départ de votre chien";
    case "postal": return "Envoi postal";
    default: return "—";
  }
}

// ── Adresse de livraison ───────────────────────────────────────────────────

export type Adresse = {
  nom: string;
  rue: string;
  npa: string;
  localite: string;
  pays?: string | null;
};

export function adresseComplete(a: Partial<Adresse> | null | undefined): boolean {
  if (!a) return false;
  return ["nom", "rue", "npa", "localite"].every(
    (c) => String((a as Record<string, unknown>)[c] ?? "").trim().length > 0
  );
}

export function formatAdresse(a: Partial<Adresse> | null | undefined): string {
  if (!adresseComplete(a)) return "—";
  const parts = [a!.nom, a!.rue, `${a!.npa} ${a!.localite}`];
  if (a!.pays && a!.pays.trim() && a!.pays.trim().toLowerCase() !== "suisse") parts.push(a!.pays.trim());
  return parts.join("\n");
}

// ── Ce qu'un visiteur SANS COMPTE lit ──────────────────────────────────────

/**
 * La disponibilité pour un visiteur : deux mots, jamais un compte à rebours.
 *
 * Un client connecté voit « Plus que 2 » — c'est un service, il peut décider
 * vite. Un visiteur anonyme n'a que `en_stock` : le nombre ne quitte pas la
 * base pour lui, et « En stock » suffit à savoir qu'on peut l'avoir.
 */
export function disponibiliteVitrine(
  enStock: boolean | null | undefined,
  typeArticle?: string | null
): Disponibilite {
  if (typeArticle === "personnalisable") {
    return { etat: "en_stock", libelle: "Sur commande" };
  }
  return enStock === true
    ? { etat: "en_stock", libelle: "En stock" }
    : { etat: "epuise", libelle: "Épuisé" };
}

/**
 * La mention faite au visiteur à propos de la remise membre.
 *
 * On ne lui applique PAS la remise — il n'est pas membre, et la lui montrer
 * puis la retirer à la validation serait une petite trahison. On dit ce qui
 * est vrai : elle existe, elle vaut tant, et voilà une raison d'adhérer.
 */
export function mentionRemiseMembre(remisePourcent: number | string | null | undefined): string | null {
  const p = Number(remisePourcent ?? 0);
  if (!Number.isFinite(p) || p <= 0) return null;
  const propre = Math.round(p * 10) / 10;
  return `Membres : −${String(propre).replace(".", ",")} % sur la boutique`;
}
