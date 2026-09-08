import {
  arrondirEspeces,
  COMPTE_DIMINUTION_PRODUITS,
  COMPTE_FRAIS_BANCAIRES,
  type LigneEcriture,
} from "@/src/lib/comptaFactureLogique";

/**
 * Règles pures de la caisse au comptoir : panier, arrondi, rendu de monnaie,
 * écriture et retours. Aucune dépendance à la base — c'est ici que vivent les
 * décisions, et c'est ce fichier que les tests couvrent.
 *
 * L'arrondi aux 5 centimes n'est pas réécrit : c'est celui des factures
 * (arrondirEspeces), et les comptes d'écart sont les mêmes (3800 / 6940).
 *
 * TVA : chaque ligne emporte le TAUX de son article et son SECTEUR, figés au
 * moment de la vente. Le ticket les ventile en pied (APP 14) ; ici, on ne fait
 * que les copier — un ticket passé ne se recalcule jamais.
 */

export const COMPTE_CAISSE = "1000";
export const COMPTE_BANQUE = "1020";
export const COMPTE_VENTES_BOUTIQUE = "3200";

export type ModeReglementVente = "especes" | "twint" | "carte" | "facture_client";

export const MODES_CAISSE: { valeur: ModeReglementVente; libelle: string; icone: string }[] = [
  { valeur: "especes",        libelle: "Espèces",                  icone: "💵" },
  { valeur: "twint",          libelle: "TWINT",                    icone: "📱" },
  { valeur: "carte",          libelle: "Carte",                    icone: "💳" },
  { valeur: "facture_client", libelle: "Sur la facture du client", icone: "🧾" },
];

export function libelleModeVente(mode: string | null | undefined): string {
  return MODES_CAISSE.find((m) => m.valeur === mode)?.libelle ?? "—";
}

/**
 * Compte de trésorerie débité par un encaissement.
 * Le terminal de carte et TWINT se déversent sur le compte courant, comme pour
 * les dépenses ; « sur la facture » ne touche aucune trésorerie.
 */
export function compteEncaissement(mode: ModeReglementVente | string): string | null {
  if (mode === "especes") return COMPTE_CAISSE;
  if (mode === "twint" || mode === "carte") return COMPTE_BANQUE;
  return null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

// ── Panier ──────────────────────────────────────────────────────────────────

export type ArticleVendable = {
  id: string;
  nom: string;
  reference: string;
  code_barres: string | null;
  prix_vente: number | string;
  taux_tva: number | string;
  motif_tva?: string | null;
  /** Secteur de dette fiscale nette de l'article : il voyage avec la ligne. */
  secteur_tdfn?: string | null;
  stock_actuel: number | string;
  unite: string;
  photo_path?: string | null;
  /** 'personnalisable' : pas de stock de produit fini, il se configure. */
  type_article?: string | null;
  /** APP 16 : ce qu'il faut pour que `prixApplicable` puisse trancher. */
  categorie?: string | null;
  remise_membre_exclue?: boolean | null;
  date_limite?: string | null;
  statut_vitrine?: string | null;
};

/**
 * La remise retenue sur une ligne, telle qu'elle se fige à la vente.
 *
 * Elle n'est jamais recalculée après coup : un ticket passé garde le prix de
 * base, le taux et l'origine du jour où il a été imprimé, même si l'action a
 * pris fin depuis.
 */
export type RemiseLigne = {
  /** Le prix de base RÉEL, celui pratiqué hors action. Jamais un prix gonflé. */
  prix_base: number;
  remise_pourcentage: number;
  remise_origine: "action" | "anti_gaspillage" | "membre";
  /** « Action du mois −20 % », tel que la facture l'affichera. */
  remise_libelle: string;
};

/** Un article sur mesure n'a pas de stock : il ouvre le configurateur. */
export function estPersonnalisable(article: { type_article?: string | null }): boolean {
  return article.type_article === "personnalisable";
}

export type LignePanier = {
  article_id: string;
  /** Copie du nom au moment de la vente : un ticket passé ne bouge plus. */
  libelle: string;
  quantite: number;
  /** Copie du prix au moment de la vente. */
  prix_unitaire: number;
  /** Copie du taux légal, figée à la vente. */
  taux_tva: number;
  /** Pourquoi cette ligne est à 0 %, le cas échéant. */
  motif_tva?: string | null;
  /** Copie du secteur, pour le décompte TVA. */
  secteur_tdfn: string;
  montant: number;
  unite: string;
  /** Stock au moment où l'article est entré dans le panier, pour le garde-fou. */
  stock_disponible: number;
  /** Un article sur mesure se fabrique : il n'a pas de stock à contrôler. */
  sans_stock?: boolean;
  /** Le prix de base réel, quand une remise s'applique à cette ligne. */
  prix_base?: number | null;
  remise_pourcentage?: number | null;
  remise_origine?: string | null;
  remise_libelle?: string | null;
};

/**
 * Ligne figée à partir d'une fiche article : libellé, prix et taux sont copiés.
 *
 * `remise` vient de `prixApplicable` — la fonction unique — et jamais d'un
 * calcul refait ici. `prix_unitaire` est ce qui est RÉELLEMENT payé : c'est lui
 * qui fait le montant, l'écriture et la ventilation de TVA. Le prix de base
 * l'accompagne pour que le ticket puisse dire les trois chiffres.
 */
export function ligneDepuisArticle(
  article: ArticleVendable,
  quantite = 1,
  remise?: RemiseLigne | null
): LignePanier {
  const prixBase = r2(Number(article.prix_vente));
  const prix = remise ? r2(prixBase - r2((prixBase * remise.remise_pourcentage) / 100)) : prixBase;
  const q = arrondiQuantiteVente(quantite);
  return {
    article_id: article.id,
    libelle: article.nom,
    quantite: q,
    prix_unitaire: prix,
    taux_tva: Number(article.taux_tva),
    motif_tva: article.motif_tva ?? null,
    secteur_tdfn: article.secteur_tdfn === "pension" ? "pension" : "commerce",
    montant: r2(prix * q),
    unite: article.unite,
    stock_disponible: Number(article.stock_actuel),
    sans_stock: estPersonnalisable(article),
    prix_base: remise ? remise.prix_base : null,
    remise_pourcentage: remise ? remise.remise_pourcentage : null,
    remise_origine: remise ? remise.remise_origine : null,
    remise_libelle: remise ? remise.remise_libelle : null,
  };
}

/** Trois décimales, comme le stock : on ne vend pas au micro-gramme. */
export function arrondiQuantiteVente(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Quantité modifiée : le montant de la ligne suit, le prix ne bouge jamais. */
export function changerQuantite(ligne: LignePanier, quantite: number): LignePanier {
  const q = arrondiQuantiteVente(quantite);
  return { ...ligne, quantite: q, montant: r2(ligne.prix_unitaire * q) };
}

export function totalPanier(lignes: { montant: number | string }[]): number {
  return r2(lignes.reduce((s, l) => s + Number(l.montant ?? 0), 0));
}

/**
 * Refus du panier, ou null s'il peut partir en caisse.
 * On ne vend pas ce qu'on n'a pas : le refus dit ce qu'il reste, comme les
 * sorties de stock d'APP 10.
 */
export function refusPanier(lignes: LignePanier[]): string | null {
  if (lignes.length === 0) return "Le panier est vide.";
  for (const l of lignes) {
    if (!(l.quantite > 0)) return `Indiquez une quantité pour « ${l.libelle} ».`;
    // Un article sur mesure se fabrique : ce sont ses fournitures qui se
    // décomptent, au passage en fabrication, pas un stock de produit fini.
    if (l.sans_stock) continue;
    if (l.quantite > l.stock_disponible) {
      return `Stock insuffisant pour « ${l.libelle} » : il en reste ${l.stock_disponible}, vous en vendez ${l.quantite}.`;
    }
  }
  if (totalPanier(lignes) <= 0) return "Le total du panier doit être supérieur à zéro.";
  return null;
}

// ── Arrondi et rendu de monnaie ─────────────────────────────────────────────

export type Encaissement = {
  /** Total des lignes, avant arrondi. */
  total: number;
  /** Montant réellement à régler (arrondi aux 5 centimes en espèces). */
  aRegler: number;
  /** Écart d'arrondi : positif si l'on encaisse plus que dû. */
  arrondi: number;
};

/** Seules les espèces s'arrondissent : une carte passe au centime. */
export function encaissementVente(total: number, mode: ModeReglementVente | string): Encaissement {
  const { encaisse, arrondi } = arrondirEspeces(total, mode === "especes");
  return { total: r2(total), aRegler: encaisse, arrondi };
}

/**
 * Compte où loger un écart d'arrondi : un manque est une charge, un excédent
 * un produit. La règle des factures, à la lettre.
 */
export function compteArrondiPour(arrondi: number): string {
  return arrondi < 0 ? COMPTE_FRAIS_BANCAIRES : COMPTE_DIMINUTION_PRODUITS;
}

/**
 * Écart d'arrondi d'un retour.
 *
 * Un remboursement en espèces se compte en pièces : il tombe sur 5 centimes.
 * Mais le dernier retour d'une vente doit rendre EXACTEMENT ce qui avait été
 * encaissé — sinon la caisse garderait quelques centimes d'une vente pourtant
 * intégralement annulée. Le solde s'y ajuste donc, et tous les écarts d'une
 * vente et de ses retours s'annulent entre eux.
 */
export function arrondiRetour(r: {
  totalRetour: number;
  mode: ModeReglementVente | string;
  /** Ce que la vente avait réellement encaissé (total + arrondi). */
  encaisseOrigine: number;
  /** Ce que les retours précédents ont déjà rendu, en négatif. */
  dejaRembourse: number;
  /** Ce retour solde-t-il la vente ? */
  estTotal: boolean;
}): number {
  if (r.mode !== "especes") return 0;

  const total = r2(r.totalRetour);
  const caisse = r.estTotal
    ? r2(-(r2(r.encaisseOrigine) + r2(r.dejaRembourse)))
    : arrondirEspeces(total, true).encaisse;

  return r2(caisse - total);
}

/** Rendu de monnaie, ou null tant que le montant reçu ne couvre pas le dû. */
export function rendreMonnaie(aRegler: number, recu: number | null): number | null {
  if (recu === null || !Number.isFinite(recu)) return null;
  const rendu = r2(recu - aRegler);
  return rendu < 0 ? null : rendu;
}

// ── Écriture ────────────────────────────────────────────────────────────────

/**
 * Écriture d'une vente comptant : débit de la trésorerie, crédit de 3200.
 * L'écart d'arrondi part en 3800 s'il nous favorise, en 6940 sinon — la règle
 * des factures, à la lettre.
 *
 * Les mêmes lignes servent au retour : il suffit que le total soit négatif,
 * les sens s'inversent d'eux-mêmes. Le mode « sur la facture du client » ne
 * produit rien : le produit sera reconnu à l'émission de la facture.
 */
export function lignesEcritureVente(v: {
  totalLignes: number;
  arrondi?: number;
  mode: ModeReglementVente | string;
  /**
   * Sur un retour : le compte d'écart de la vente d'origine. Renverser une
   * écriture, c'est repasser par le même compte — pas en ouvrir un autre.
   */
  compteArrondi?: string | null;
}): LigneEcriture[] {
  const compte = compteEncaissement(v.mode);
  if (!compte) return [];

  const total = r2(v.totalLignes);
  const arrondi = r2(v.arrondi ?? 0);
  if (total === 0 && arrondi === 0) return [];

  const cible: Record<string, number> = {};
  const add = (c: string, montant: number) => {
    const v2 = r2((cible[c] ?? 0) + montant);
    if (v2 === 0) delete cible[c];
    else cible[c] = v2;
  };

  // Positif = débit net, comme dans le moteur des factures.
  add(compte, r2(total + arrondi));
  add(COMPTE_VENTES_BOUTIQUE, -total);
  if (arrondi !== 0) add(v.compteArrondi ?? compteArrondiPour(arrondi), -arrondi);

  const lignes: LigneEcriture[] = [];
  for (const [c, solde] of Object.entries(cible)) {
    if (solde > 0) lignes.push({ compte: c, debit: solde, credit: 0 });
    else lignes.push({ compte: c, debit: 0, credit: -solde });
  }
  return lignes;
}

// ── Retours ─────────────────────────────────────────────────────────────────

export type LigneVendue = {
  id: string;
  article_id: string | null;
  libelle: string;
  quantite: number | string;
  prix_unitaire: number | string;
  taux_tva: number | string;
  motif_tva?: string | null;
  secteur_tdfn?: string | null;
  montant: number | string;
  /** La remise figée à la vente. Un retour la reprend telle quelle. */
  prix_base?: number | string | null;
  remise_pourcentage?: number | string | null;
  remise_origine?: string | null;
  remise_libelle?: string | null;
};

/**
 * Ce qu'il reste à rendre sur chaque ligne d'une vente, compte tenu des retours
 * déjà passés. Les quantités d'un retour sont négatives : elles s'additionnent.
 */
export function resteARendre(
  lignesVente: LigneVendue[],
  lignesRetoursDeja: { article_id: string | null; libelle: string; quantite: number | string }[]
): Record<string, number> {
  const reste: Record<string, number> = {};
  for (const l of lignesVente) {
    const rendues = lignesRetoursDeja
      .filter((r) => r.article_id === l.article_id && r.libelle === l.libelle)
      .reduce((s, r) => s + Math.abs(Number(r.quantite)), 0);
    reste[l.id] = arrondiQuantiteVente(Math.max(Number(l.quantite) - rendues, 0));
  }
  return reste;
}

export type LigneRetour = {
  article_id: string | null;
  libelle: string;
  /** Négative : un retour est une vente à l'envers. */
  quantite: number;
  prix_unitaire: number;
  taux_tva: number;
  motif_tva: string | null;
  secteur_tdfn: string;
  montant: number;
  /** Reprise telle quelle : on rend ce qui a été payé, pas le prix du jour. */
  prix_base: number | null;
  remise_pourcentage: number | null;
  remise_origine: string | null;
  remise_libelle: string | null;
};

export type Retour = { lignes: LigneRetour[]; total: number };

/**
 * Lignes d'un retour partiel : une quantité par ligne d'origine, plafonnée à ce
 * qui reste à rendre. Les prix sont ceux de la vente, jamais ceux d'aujourd'hui.
 */
export function construireRetour(
  lignesVente: LigneVendue[],
  quantitesRendues: Record<string, number>,
  lignesRetoursDeja: { article_id: string | null; libelle: string; quantite: number | string }[] = []
): Retour {
  const reste = resteARendre(lignesVente, lignesRetoursDeja);
  const lignes: LigneRetour[] = [];

  for (const l of lignesVente) {
    const demande = Number(quantitesRendues[l.id] ?? 0);
    if (!Number.isFinite(demande) || demande <= 0) continue;
    const q = arrondiQuantiteVente(Math.min(demande, reste[l.id] ?? 0));
    if (q <= 0) continue;

    const prix = r2(Number(l.prix_unitaire));
    lignes.push({
      article_id: l.article_id,
      libelle: l.libelle,
      quantite: -q,
      prix_unitaire: prix,
      taux_tva: Number(l.taux_tva),
      motif_tva: l.motif_tva ?? null,
      secteur_tdfn: l.secteur_tdfn === "pension" ? "pension" : "commerce",
      montant: r2(-prix * q),
      // La remise d'origine voyage avec le retour : l'avoir doit dire la même
      // chose que le ticket, sans quoi les deux pièces ne se répondraient plus.
      prix_base: l.prix_base === null || l.prix_base === undefined ? null : r2(Number(l.prix_base)),
      remise_pourcentage:
        l.remise_pourcentage === null || l.remise_pourcentage === undefined
          ? null
          : Number(l.remise_pourcentage),
      remise_origine: l.remise_origine ?? null,
      remise_libelle: l.remise_libelle ?? null,
    });
  }

  return { lignes, total: r2(lignes.reduce((s, l) => s + l.montant, 0)) };
}

/** Le retour solde-t-il la vente ? Alors elle passera au statut « annulee ». */
export function retourTotal(
  lignesVente: LigneVendue[],
  retour: Retour,
  lignesRetoursDeja: { article_id: string | null; libelle: string; quantite: number | string }[] = []
): boolean {
  const apres = resteARendre(lignesVente, [
    ...lignesRetoursDeja,
    ...retour.lignes.map((l) => ({ article_id: l.article_id, libelle: l.libelle, quantite: l.quantite })),
  ]);
  return Object.values(apres).every((q) => q <= 0);
}

// ── Divers ──────────────────────────────────────────────────────────────────

export const MESSAGE_CLIENT_SANS_FACTURE =
  "Ce client n'a ni facture en brouillon ni séjour en cours : créez-lui une facture libre pour y porter cet achat.";

export const MESSAGE_FACTURE_EMISE =
  "La facture de ce client est déjà émise : elle ne reçoit plus de ligne. Encaissez au comptant, ou créez-lui une facture libre.";

/** Montant lu d'un champ texte : la virgule suisse est acceptée. */
export function lireMontant(brut: unknown): number | null {
  const texte = String(brut ?? "").replace(",", ".").trim();
  if (!texte) return null;
  const n = Number(texte);
  return Number.isFinite(n) ? n : null;
}

export const chf = (n: number) => `${n.toFixed(2)} CHF`;
