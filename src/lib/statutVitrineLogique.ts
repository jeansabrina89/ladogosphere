/**
 * Ce qu'un article MONTRE — à ne pas confondre avec ce qu'il EST.
 *
 * Deux drapeaux, deux questions différentes, et il ne faut jamais les prendre
 * l'un pour l'autre :
 *
 *  · `actif`          — cet article existe-t-il encore ? Décoché, il est retiré
 *                       du catalogue : plus de caisse, plus de vitrine, plus
 *                       rien. C'est la fin de sa vie commerciale.
 *
 *  · `statut_vitrine` — se montre-t-il ? Un article bien vivant peut être en
 *                       préparation (brouillon) ou volontairement retiré de la
 *                       vue des clients tout en restant vendable au comptoir
 *                       (masqué).
 *
 * Un article retiré (`actif = false`) ne se montre nulle part, quel que soit
 * son statut de vitrine : `actif` a le dernier mot. L'inverse n'est pas vrai —
 * un article actif peut parfaitement ne rien montrer.
 *
 * Fonction pure : ni base, ni requête.
 */

export type StatutVitrine = "brouillon" | "publie" | "masque";

export const STATUT_VITRINE_PAR_DEFAUT: StatutVitrine = "publie";

export const STATUTS_VITRINE: {
  valeur: StatutVitrine;
  libelle: string;
  /** La pastille de la liste : une couleur et un mot, lisibles d'un coup d'œil. */
  pastille: string;
  couleur: string;
  fond: string;
  aide: string;
}[] = [
  {
    valeur: "brouillon",
    libelle: "Brouillon",
    pastille: "✏️ Brouillon",
    couleur: "#6E5410",
    fond: "#F4EAC9",
    aide:
      "Invisible et invendable partout, y compris à la caisse. La fiche reste " +
      "entièrement modifiable : c'est un article qu'on prépare.",
  },
  {
    valeur: "publie",
    libelle: "Publié",
    pastille: "✅ Publié",
    couleur: "#1F6E5B",
    fond: "#DFF0E8",
    aide: "Visible et vendable, au comptoir comme en ligne.",
  },
  {
    valeur: "masque",
    libelle: "Masqué",
    pastille: "🙈 Masqué",
    couleur: "#1B2B5E",
    fond: "#E4E7F0",
    aide:
      "Invisible aux clients — catalogue public et boutique en ligne — mais " +
      "toujours vendable au comptoir. Pour ce qu'on écoule sans le mettre en avant.",
  },
];

export function statutVitrine(valeur: string | null | undefined): StatutVitrine {
  return STATUTS_VITRINE.some((s) => s.valeur === valeur)
    ? (valeur as StatutVitrine)
    : STATUT_VITRINE_PAR_DEFAUT;
}

export function infoStatutVitrine(valeur: string | null | undefined) {
  const v = statutVitrine(valeur);
  return STATUTS_VITRINE.find((s) => s.valeur === v)!;
}

export function libelleStatutVitrine(valeur: string | null | undefined): string {
  return infoStatutVitrine(valeur).libelle;
}

/**
 * La phrase qui articule les deux drapeaux, affichée là où on les règle. Elle
 * est écrite une fois et lue partout : c'est la confusion entre les deux qui
 * coûte cher, pas leur existence.
 */
export const ARTICULATION_ACTIF_VITRINE =
  "« Article actif » dit qu'il existe encore ; « Statut en vitrine » dit s'il se montre. " +
  "Un article retiré ne se vend plus nulle part ; un article masqué se vend encore au comptoir.";

// ── Ce qui se voit, ce qui se vend ─────────────────────────────────────────

export type ArticleVisibilite = {
  actif?: boolean | null;
  statut_vitrine?: string | null;
  date_publication?: string | null;
  publier_a_l_entree_stock?: boolean | null;
};

/**
 * La date de publication est-elle passée ? Une date absente ne retient rien.
 * Les deux valeurs sont des instants ISO : elles se comparent telles quelles.
 */
export function publicationAtteinte(
  datePublication: string | null | undefined,
  maintenantISO: string
): boolean {
  const d = String(datePublication ?? "").trim();
  if (!d) return true;
  return d <= maintenantISO;
}

/**
 * Visible d'un client : publié, actif, et la date de publication passée.
 * C'est la règle que la vue `articles_vitrine` applique en SQL — elle est
 * répétée ici pour que les tests puissent la lire sans base, jamais pour
 * filtrer après coup ce que la requête aurait laissé passer.
 */
export function visibleEnVitrine(a: ArticleVisibilite, maintenantISO: string): boolean {
  if (a.actif === false) return false;
  if (statutVitrine(a.statut_vitrine) !== "publie") return false;
  return publicationAtteinte(a.date_publication, maintenantISO);
}

/**
 * Vendable au comptoir : tout ce qui est actif SAUF un brouillon. Un article
 * masqué se vend très bien à la caisse — c'est précisément ce qu'on lui demande.
 */
export function vendableAuComptoir(a: ArticleVisibilite): boolean {
  if (a.actif === false) return false;
  return statutVitrine(a.statut_vitrine) !== "brouillon";
}

// ── La publication automatique ─────────────────────────────────────────────

export type DeclencheurPublication = "date" | "entree_stock";

/**
 * Le brouillon dont la date est arrivée. Les deux chemins d'auto-publication
 * se CUMULENT : le premier qui se présente publie, l'autre ne fait plus rien.
 */
export function doitPublierParDate(a: ArticleVisibilite, maintenantISO: string): boolean {
  if (a.actif === false) return false;
  if (statutVitrine(a.statut_vitrine) !== "brouillon") return false;
  const d = String(a.date_publication ?? "").trim();
  return d !== "" && d <= maintenantISO;
}

/**
 * Le brouillon que la première entrée de stock rend disponible.
 *
 * La condition n'est pas « une entrée a eu lieu » mais « il n'y en avait pas,
 * il y en a » — exactement celle du retour en stock d'APP 13h, et pour la même
 * raison : un réassort sur un article déjà disponible ne publie rien.
 */
export function doitPublierParStock(
  a: ArticleVisibilite,
  disponibleAvant: number,
  disponibleApres: number
): boolean {
  if (a.actif === false) return false;
  if (a.publier_a_l_entree_stock !== true) return false;
  if (statutVitrine(a.statut_vitrine) !== "brouillon") return false;
  return disponibleAvant <= 0 && disponibleApres > 0;
}

/** Ce que le journal retiendra du geste. */
export function evenementPublication(declencheur: DeclencheurPublication): string {
  return declencheur === "date" ? "publication_auto_date" : "publication_auto_stock";
}

export function mentionPublicationProgrammee(a: ArticleVisibilite): string | null {
  if (statutVitrine(a.statut_vitrine) !== "brouillon") return null;
  const bouts: string[] = [];
  if (String(a.date_publication ?? "").trim()) bouts.push("à la date prévue");
  if (a.publier_a_l_entree_stock === true) bouts.push("à la première entrée de stock");
  if (bouts.length === 0) return null;
  return `Se publiera tout seul ${bouts.join(" ou ")}.`;
}

// ── Le compteur de brouillons ──────────────────────────────────────────────

export function compterParStatut(
  articles: ArticleVisibilite[]
): Record<StatutVitrine, number> {
  const compte: Record<StatutVitrine, number> = { brouillon: 0, publie: 0, masque: 0 };
  for (const a of articles) {
    if (a.actif === false) continue;
    compte[statutVitrine(a.statut_vitrine)] += 1;
  }
  return compte;
}

/** « 4 brouillons », « 1 brouillon » — ou rien du tout s'il n'y en a pas. */
export function libelleCompteBrouillons(n: number): string | null {
  if (n <= 0) return null;
  return `${n} brouillon${n > 1 ? "s" : ""}`;
}
