/**
 * Règles pures des dépenses : catégories, comptes et construction de
 * l'écriture. Aucune dépendance à la base — c'est ici que vit la décision
 * comptable, et c'est ce fichier que les tests couvrent.
 *
 * Le moteur d'écritures existant n'est pas contourné : ces lignes sont
 * transmises telles quelles à passer_ecriture (cf. src/lib/depenses.ts).
 *
 * TVA : hors sujet pour l'instant. Les colonnes montant_ht / montant_tva /
 * taux_tva existent en base, elles restent nulles et ne sont pas affichées.
 */

export type ModePaiementDepense = "banque" | "caisse" | "carte" | "twint" | "a_payer";
export type ModeReglement = Exclude<ModePaiementDepense, "a_payer">;

export type StatutDepense = "brouillon" | "validee" | "payee" | "annulee";

export const COMPTE_BANQUE = "1020";
export const COMPTE_CAISSE = "1000";
export const COMPTE_CREANCIERS = "2000";

/**
 * Catégories proposées à la saisie. On choisit une catégorie en français, pas
 * un numéro de compte — le numéro reste affiché en petit, pour contrôle.
 * L'ordre est celui de la fiche de compta quotidienne.
 */
export const CATEGORIES_DEPENSE = [
  { compte: "6000", libelle: "Loyer des box" },
  { compte: "6300", libelle: "Assurances" },
  { compte: "4410", libelle: "Vétérinaire et soins" },
  { compte: "4400", libelle: "Alimentation des pensionnaires" },
  { compte: "6100", libelle: "Petit matériel et nettoyage" },
  { compte: "6510", libelle: "Téléphone et internet" },
  { compte: "6570", libelle: "Logiciels et hébergement" },
  { compte: "6940", libelle: "Frais bancaires et commissions" },
  { compte: "4000", libelle: "Matières de fabrication" },
  { compte: "4200", libelle: "Marchandises à revendre (boutique)" },
  { compte: "6200", libelle: "Frais de véhicule" },
  { compte: "6700", libelle: "Autre charge" },
] as const;

/** Achat de marchandises revendues telles quelles. */
export const COMPTE_MARCHANDISES = "4200";

/** Achat de ce qu'on transforme : sangle, boucles, rivets, puces, fil. */
export const COMPTE_MATIERES = "4000";

/**
 * Les deux catégories qui ouvrent l'entrée en stock. L'une entre des
 * marchandises revendables, l'autre des composants ; dans les deux cas c'est
 * du stock, et aucune écriture ne s'ajoute — l'achat est déjà en charge.
 */
export const COMPTES_AVEC_STOCK: readonly string[] = [COMPTE_MATIERES, COMPTE_MARCHANDISES];

export function ouvreEntreeStock(compte: string | null | undefined): boolean {
  return !!compte && COMPTES_AVEC_STOCK.includes(compte);
}

/**
 * Aide affichée sous le choix de catégorie.
 *
 * Deux catégories voisines qui se ressemblent doivent se distinguer à l'écran,
 * pas dans la tête de la personne qui saisit : chacune dit ce qu'elle couvre
 * ET renvoie explicitement vers l'autre.
 */
export const AIDE_CATEGORIE_DEPENSE: Record<string, string> = {
  "4000":
    "Ce que vous transformez : sangle, boucles, rivets, puces, fil. " +
    "Pour ce que vous revendez tel quel, choisissez Marchandises à revendre.",
  "4200":
    "Ce que vous revendez tel quel : croquettes, jouets, colliers achetés finis. " +
    "Pour ce que vous transformez, choisissez Matières de fabrication.",
};

export function aideCategorieDepense(compte: string | null | undefined): string | null {
  if (!compte) return null;
  return AIDE_CATEGORIE_DEPENSE[compte] ?? null;
}

export type CategorieDepense = (typeof CATEGORIES_DEPENSE)[number];

export const COMPTES_DEPENSE = CATEGORIES_DEPENSE.map((c) => c.compte) as readonly string[];

/** Libellé de la catégorie d'un compte, ou le numéro seul s'il est inconnu. */
export function libelleCategorie(compte: string | null | undefined): string {
  if (!compte) return "—";
  return CATEGORIES_DEPENSE.find((c) => c.compte === compte)?.libelle ?? compte;
}

export const MODES_PAIEMENT: { valeur: ModePaiementDepense; libelle: string }[] = [
  { valeur: "banque", libelle: "Banque" },
  { valeur: "carte", libelle: "Carte" },
  { valeur: "twint", libelle: "TWINT" },
  { valeur: "caisse", libelle: "Espèces (caisse)" },
  { valeur: "a_payer", libelle: "À payer plus tard" },
];

export function libelleMode(mode: string | null | undefined): string {
  return MODES_PAIEMENT.find((m) => m.valeur === mode)?.libelle ?? "—";
}

/**
 * Compte de contrepartie d'un mode de paiement.
 * Carte et TWINT passent par le compte courant : ce sont des débits bancaires.
 * « À payer » crée une dette fournisseur, soldée plus tard.
 */
export function compteContrepartie(mode: ModePaiementDepense): string {
  switch (mode) {
    case "caisse":
      return COMPTE_CAISSE;
    case "a_payer":
      return COMPTE_CREANCIERS;
    case "banque":
    case "carte":
    case "twint":
      return COMPTE_BANQUE;
  }
}

export type LigneEcriture = { compte: string; debit: number; credit: number };

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Écriture de la dépense : débit du compte de charge, crédit de la
 * contrepartie. Une seule décision, un seul endroit.
 */
export function lignesEcritureDepense(d: {
  compte_charge: string;
  montant: number;
  mode_paiement: ModePaiementDepense;
}): LigneEcriture[] {
  const montant = r2(Number(d.montant));
  if (!Number.isFinite(montant) || montant <= 0) {
    throw new Error("Le montant d'une dépense doit être strictement positif.");
  }
  if (!d.compte_charge) throw new Error("Compte de charge manquant.");

  return [
    { compte: d.compte_charge, debit: montant, credit: 0 },
    { compte: compteContrepartie(d.mode_paiement), debit: 0, credit: montant },
  ];
}

/**
 * Écriture du règlement d'une dépense restée « à payer » :
 * le compte Créanciers est soldé par la liquidité choisie.
 */
export function lignesEcritureReglement(d: {
  montant: number;
  mode: ModeReglement;
}): LigneEcriture[] {
  const montant = r2(Number(d.montant));
  if (!Number.isFinite(montant) || montant <= 0) {
    throw new Error("Le montant d'un règlement doit être strictement positif.");
  }
  return [
    { compte: COMPTE_CREANCIERS, debit: montant, credit: 0 },
    { compte: compteContrepartie(d.mode), debit: 0, credit: montant },
  ];
}

export const MESSAGE_JUSTIFICATIF_REQUIS = "Ajoutez le justificatif";

export type DecisionValidation =
  | { autorise: true }
  | { autorise: false; message: string };

/**
 * Peut-on valider cette dépense ? Sans pièce justificative, non — et le
 * message affiché sous le bouton est celui-ci, mot pour mot.
 */
export function peutValiderDepense(d: {
  statut: StatutDepense | string;
  nbPieces: number;
  montant?: number | null;
  compte_charge?: string | null;
}): DecisionValidation {
  if (d.statut !== "brouillon") {
    return { autorise: false, message: "Seul un brouillon peut être validé." };
  }
  if (!d.compte_charge) {
    return { autorise: false, message: "Choisissez une catégorie." };
  }
  if (!d.montant || Number(d.montant) <= 0) {
    return { autorise: false, message: "Indiquez un montant supérieur à zéro." };
  }
  if (d.nbPieces < 1) {
    return { autorise: false, message: MESSAGE_JUSTIFICATIF_REQUIS };
  }
  return { autorise: true };
}

// ── Justificatifs ───────────────────────────────────────────────────────────

export const TAILLE_MAX_PIECE = 10 * 1024 * 1024; // 10 Mo

export const MIMES_PIECE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf",
};

/** Refus de dépôt, ou null si le fichier est acceptable. */
export function refusFichierPiece(f: { type?: string | null; size?: number | null }): string | null {
  const mime = (f.type ?? "").toLowerCase();
  if (!MIMES_PIECE[mime]) {
    return "Format accepté : photo (JPEG, PNG, HEIC) ou PDF.";
  }
  const taille = Number(f.size ?? 0);
  if (!taille) return "Fichier vide.";
  if (taille > TAILLE_MAX_PIECE) {
    return `Fichier trop lourd : ${(taille / 1024 / 1024).toFixed(1)} Mo pour 10 Mo au maximum.`;
  }
  return null;
}

export function extensionPiece(mime: string): string {
  return MIMES_PIECE[(mime ?? "").toLowerCase()] ?? "bin";
}
