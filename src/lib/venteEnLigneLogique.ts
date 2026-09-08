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
};

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
 * La remise d'adhésion, sur une ligne à elle. Jamais fondue dans les prix :
 * le client doit voir ce que son adhésion lui rapporte, et retrouver le prix
 * public de chaque article.
 *
 * Elle porte sur les articles, pas sur le port : la Poste ne fait pas de
 * remise aux membres.
 */
export function remiseMembre(
  lignes: LignePanier[],
  estMembre: boolean,
  pourcent: number | string | null | undefined
): number {
  if (!estMembre) return 0;
  const taux = nb(pourcent) ?? 0;
  if (taux <= 0) return 0;
  return r2((sousTotal(lignes) * taux) / 100);
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

/**
 * La grille de frais de port, telle qu'elle est enregistrée en paramètre.
 * Une grille illisible ne fait pas planter la boutique : elle rend une grille
 * vide, et l'envoi postal se refuse faute de tarif.
 */
export function lireGrillePort(brut: unknown): PalierPort[] {
  const source =
    typeof brut === "string"
      ? (() => { try { return JSON.parse(brut); } catch { return []; } })()
      : brut;
  if (!Array.isArray(source)) return [];
  return source
    .map((p) => ({
      jusqu_a_grammes: nb((p as PalierPort)?.jusqu_a_grammes) ?? 0,
      prix: nb((p as PalierPort)?.prix) ?? 0,
    }))
    .filter((p) => p.jusqu_a_grammes > 0 && p.prix >= 0)
    .sort((a, b) => a.jusqu_a_grammes - b.jusqu_a_grammes);
}

/**
 * Frais de port pour un poids donné : le premier palier qui le contient.
 * Au-delà du dernier palier, il n'y a pas de tarif — et donc pas d'envoi :
 * on rend null plutôt qu'un prix inventé.
 */
export function fraisPort(poidsGrammes: number, grille: PalierPort[]): number | null {
  if (grille.length === 0) return null;
  const poids = Math.max(poidsGrammes, 0);
  const palier = grille.find((p) => poids <= p.jusqu_a_grammes);
  return palier ? r2(palier.prix) : null;
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
  const port = fraisPort(poids, c.grillePort);

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

/** « 10 kg », « 750 g » — le poids comme on le dit. */
export function formatPoids(grammes: number): string {
  const g = Math.max(Math.round(grammes), 0);
  if (g < 1000) return `${g} g`;
  const kg = g / 1000;
  return `${kg % 1 === 0 ? kg : kg.toFixed(1)} kg`;
}

// ── Le total ───────────────────────────────────────────────────────────────

export type Total = {
  sousTotal: number;
  remise: number;
  port: number;
  aPayer: number;
};

/**
 * Le total, ligne par ligne, dans l'ordre où il se lit : les articles, ce que
 * l'adhésion enlève, ce que la Poste ajoute. Aucun de ces trois n'est fondu
 * dans un autre.
 */
export function totalCommande(p: {
  lignes: LignePanier[];
  estMembre: boolean;
  remisePourcent: number | string | null | undefined;
  fraisPort: number | null;
}): Total {
  const st = sousTotal(p.lignes);
  const remise = remiseMembre(p.lignes, p.estMembre, p.remisePourcent);
  const port = r2(Math.max(p.fraisPort ?? 0, 0));
  return { sousTotal: st, remise, port, aPayer: r2(st - remise + port) };
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
