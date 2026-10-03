/**
 * APP 73 — les fournisseurs par domaine (décision de Sabrina, 03.10.2026).
 *
 * Les fournisseurs de la boutique se trouvent dans Boutique, ceux de l'atelier
 * dans Atelier, les autres (propriétaire, énergie, assurances…) dans
 * Comptabilité, qui les voit TOUS. Un fournisseur porte un ou plusieurs
 * domaines (`fournisseurs.domaines`, migration app73_fournisseurs_domaines),
 * jamais aucun — la base le refuse aussi.
 *
 * À ne pas confondre avec l'USAGE (src/lib/usagesFournisseurs.ts), dérivé du
 * compte de charge : l'usage dit où va la dépense, le domaine dit où l'on
 * range la fiche.
 *
 * Module pur.
 */

export type Domaine = "boutique" | "atelier" | "general";

export const DOMAINES: { valeur: Domaine; libelle: string; court: string; fond: string; texte: string }[] = [
  { valeur: "boutique", libelle: "🛍️ Boutique", court: "Boutique", fond: "#E4F1EC", texte: "#1F6E5B" },
  { valeur: "atelier", libelle: "🧰 Atelier", court: "Atelier", fond: "#F4EAC9", texte: "#6E5410" },
  { valeur: "general", libelle: "📈 Autres frais (loyer, énergie…)", court: "Autres frais", fond: "#EDE8DF", texte: "#5C5446" },
];

export const MESSAGE_DOMAINE_REQUIS = "Cochez au moins un domaine : Boutique, Atelier ou Autres frais.";

export function estDomaine(v: unknown): v is Domaine {
  return v === "boutique" || v === "atelier" || v === "general";
}

/** Les domaines d'une fiche, dans l'ordre de DOMAINES, sans doublon ni inconnu. */
export function domainesValides(brut: unknown): Domaine[] {
  const liste = Array.isArray(brut) ? brut : [];
  return DOMAINES.map((d) => d.valeur).filter((v) => liste.includes(v));
}

/** Un fournisseur sans domaine lisible se range dans « Autres frais », comme le défaut de la base. */
export function domainesDe(f: { domaines?: unknown }): Domaine[] {
  const d = domainesValides(f.domaines);
  return d.length > 0 ? d : ["general"];
}

export function infoDomaine(d: Domaine) {
  return DOMAINES.find((x) => x.valeur === d)!;
}

/** Le domaine d'un filtre lu dans l'adresse (?domaine=atelier), ou null = tous. */
export function lireDomaine(brut: unknown): Domaine | null {
  const v = Array.isArray(brut) ? brut[0] : brut;
  return estDomaine(v) ? v : null;
}

/** Les fournisseurs d'un domaine ; sans domaine, tous. */
export function fournisseursDuDomaine<T extends { domaines?: unknown }>(liste: T[], domaine: Domaine | null): T[] {
  if (!domaine) return liste;
  return liste.filter((f) => domainesDe(f).includes(domaine));
}

/**
 * Le choix sur une DÉPENSE : tous les fournisseurs, ceux des autres frais
 * d'abord (loyer, énergie… : ce qu'on saisit le plus souvent en dépense), puis
 * les autres, chaque groupe par nom.
 */
export function ordrePourDepense<T extends { nom?: string | null; domaines?: unknown }>(liste: T[]): T[] {
  const general = (f: T) => (domainesDe(f).includes("general") ? 0 : 1);
  return [...liste].sort((a, b) =>
    general(a) - general(b) || String(a.nom ?? "").localeCompare(String(b.nom ?? ""), "fr"));
}

/**
 * Le choix sur une fiche ARTICLE : les fournisseurs de son domaine. Le
 * fournisseur déjà enregistré reste proposé même s'il n'en est pas — sinon
 * ouvrir la fiche pour corriger un prix effacerait son fournisseur en silence.
 */
export function choixPourArticle<T extends { id: string; domaines?: unknown }>(
  liste: T[],
  domaine: "boutique" | "atelier",
  actuel?: string | null,
): T[] {
  return liste.filter((f) => domainesDe(f).includes(domaine) || (!!actuel && f.id === actuel));
}
