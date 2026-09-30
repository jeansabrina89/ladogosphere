/**
 * Clients box privé et box refacturés — la règle, sans la base (APP 61).
 *
 * ── DEUX CHOSES QU'ON APPELAIT PAREIL ─────────────────────────────────────
 *
 * Huit box du chenil se louent DIRECTEMENT à la propriétaire. Sabrina ne
 * refacture aucun loyer à ces clients : elle leur vend des prestations —
 * balade, repas, nettoyage, garde. Ils ne paient pas d'adhésion, et l'équipe
 * leur ouvre les prestations à la main. Ce sont les « clients box privé ».
 *
 * Un seul box, aujourd'hui, a son loyer refacturé par Sabrina (celui de Belle).
 * Ce n'est pas la même relation : il y a un montant mensuel à facturer, une
 * période, un prorata. C'est un « box refacturé ».
 *
 * Les deux vivaient sur le même écran, sous le même mot — « locataire » — et
 * l'un des deux portait un champ « loyer » que l'autre n'aurait jamais dû
 * voir. Un champ qu'on ne devrait pas remplir finit par l'être.
 *
 * ── LA RÈGLE, SANS NOUVELLE COLONNE ───────────────────────────────────────
 *
 * `locataire_box = true` ET `loyer_refacture` vide ou 0 → client box privé.
 * `loyer_refacture > 0` → box refacturé.
 *
 * Aucune colonne de plus : le montant EST la distinction. Ajouter un drapeau
 * aurait créé deux sources de vérité, et le jour où elles se contrediraient —
 * un loyer saisi sans le drapeau — personne ne saurait laquelle croire.
 *
 * ── CE QUE LES MOTS TECHNIQUES GARDENT ────────────────────────────────────
 *
 * `locataire_box`, `loyer_refacture`, `/prestations/locataires`, `perm_*` : les
 * noms de colonnes, de routes et de permissions ne changent PAS. Renommer une
 * colonne pour un mot d'écran, c'est risquer la base pour un libellé.
 */

export type SorteBox = "prive" | "refacture";

/** Ce qu'il faut savoir d'une fiche pour la ranger. */
export type FicheBox = {
  locataire_box?: boolean | null;
  loyer_refacture?: number | string | null;
};

/** Le loyer d'une fiche, en nombre. Vide, illisible ou négatif : 0. */
export function loyerDe(fiche: FicheBox): number {
  const n = Number(fiche.loyer_refacture ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * De quelle sorte est cette fiche ?
 *
 * Un loyer à 0 compte comme ABSENT : c'est la valeur qu'on trouve quand
 * quelqu'un a effacé un montant, et une location sans loyer n'est pas une
 * location refacturée.
 */
export function sorteDeBox(fiche: FicheBox): SorteBox {
  return loyerDe(fiche) > 0 ? "refacture" : "prive";
}

export function estBoxPrive(fiche: FicheBox): boolean {
  return fiche.locataire_box === true && sorteDeBox(fiche) === "prive";
}

export function estBoxRefacture(fiche: FicheBox): boolean {
  return fiche.locataire_box === true && sorteDeBox(fiche) === "refacture";
}

/** Les deux listes, dans l'ordre reçu. Une fiche non cochée n'est ni l'un ni l'autre. */
export function repartirBox<T extends FicheBox>(fiches: readonly T[]): { prives: T[]; refactures: T[] } {
  return {
    prives: fiches.filter((f) => estBoxPrive(f)),
    refactures: fiches.filter((f) => estBoxRefacture(f)),
  };
}

// ── La saisie ─────────────────────────────────────────────────────────────

export const REFUS_LOYER_MANQUANT =
  "Indiquez le loyer mensuel refacturé : un box refacturé sans loyer n'en est pas un.";

/**
 * Le refus de saisie d'un box refacturé, ou `null`.
 *
 * Un loyer à 0 est refusé comme un loyer absent : il ferait basculer la fiche
 * en « client box privé » au premier affichage, et personne ne comprendrait
 * pourquoi le box a changé de section.
 */
export function refusLoyerRefacture(brut: unknown): string | null {
  const texte = String(brut ?? "").trim().replace(",", ".");
  if (texte === "") return REFUS_LOYER_MANQUANT;
  const n = Number(texte);
  if (!Number.isFinite(n) || n <= 0) return REFUS_LOYER_MANQUANT;
  return null;
}

/**
 * La sorte demandée par un formulaire.
 *
 * Absente, elle vaut « privé » — la sorte qui n'écrit AUCUN loyer. C'est le
 * repli sûr : une requête forgée qui omet la sorte pour glisser un montant
 * n'obtient rien. Mieux vaut un loyer non enregistré qu'un loyer inventé.
 */
export function sorteDemandee(brut: unknown): SorteBox {
  return String(brut ?? "").trim() === "refacture" ? "refacture" : "prive";
}

// ── Les mots de l'écran ───────────────────────────────────────────────────

export const TITRE_BOX_PRIVE = "🏠 Clients box privé";
export const TITRE_BOX_REFACTURES = "🧾 Box refacturés";

export const VIDE_BOX_PRIVE = "Aucun client box privé";
export const VIDE_BOX_REFACTURES = "Aucun box refacturé";

export const AIDE_BOX_REFACTURES =
  "Le loyer du box est refacturé chaque mois au client, en plus des prestations éventuelles.";

/** Le box est celui du chenil, pas un box de la pension : on le dit. */
export const AIDE_NUMERO_BOX =
  "Le numéro du box au chenil (ex. Box 15). Ce box n'est pas un box de la pension.";

export const LIEN_REFACTURER = "Refacturer le loyer de ce box";
