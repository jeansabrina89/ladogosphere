/**
 * Statistiques de la boutique — le calcul, sans base.
 *
 * Ce qui compte :
 * - les lignes des ventes FINALISÉES, et celles de leurs retours, qui s'en
 *   déduisent (quantités et montants négatifs) ;
 * - une vente entièrement rendue passe « annulee » : elle est exclue, ET ses
 *   retours avec elle — sans quoi ils la déduiraient une seconde fois ;
 * - les ventes de recette (fiche client ou article ZZ…, adresse de test) sont
 *   exclues, par la règle des fiches de recette ;
 * - un retour se range dans la période OÙ il a lieu.
 *
 * La marge se calcule sur les lignes qui ont un coût figé, et seulement sur
 * elles : une ligne sans coût n'est jamais comptée à coût nul. La part des
 * ventes couverte est annoncée à côté du chiffre.
 *
 * Module pur.
 */

// ── Période ────────────────────────────────────────────────────────────────

export const PERIODES = [
  { valeur: "mois", libelle: "Ce mois" },
  { valeur: "mois_precedent", libelle: "Mois précédent" },
  { valeur: "3_mois", libelle: "3 mois" },
  { valeur: "12_mois", libelle: "12 mois" },
  { valeur: "exercice", libelle: "Exercice" },
  { valeur: "libre", libelle: "Dates libres" },
] as const;

export type Periode = (typeof PERIODES)[number]["valeur"];

export function estPeriode(v: unknown): v is Periode {
  return PERIODES.some((p) => p.valeur === v);
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (a: number, m: number, j: number) => `${a}-${pad(m)}-${pad(j)}`;
const dernierJour = (a: number, m: number) => new Date(Date.UTC(a, m, 0)).getUTCDate();

/** Recule de n mois, en gardant le jour quand il existe (31 mars − 1 mois = 28/29 février). */
function reculerMois(jour: string, n: number): string {
  const [a, m, j] = jour.split("-").map(Number);
  const total = a * 12 + (m - 1) - n;
  const na = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return iso(na, nm, Math.min(j, dernierJour(na, nm)));
}

function lendemain(jour: string): string {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Les bornes d'une période, INCLUSES, en dates de Zurich.
 * - « 3 mois » et « 12 mois » sont glissants et finissent aujourd'hui ;
 * - l'exercice est l'année civile (c'est l'exercice comptable de la pension) ;
 * - des dates libres inversées se remettent dans l'ordre ; incomplètes, on
 *   retombe sur le mois en cours.
 */
export function bornesPeriode(
  periode: Periode,
  aujourdhui: string,
  libre?: { du?: string | null; au?: string | null },
): { du: string; au: string } {
  const [a, m] = aujourdhui.split("-").map(Number);
  switch (periode) {
    case "mois_precedent": {
      const pa = m === 1 ? a - 1 : a;
      const pm = m === 1 ? 12 : m - 1;
      return { du: iso(pa, pm, 1), au: iso(pa, pm, dernierJour(pa, pm)) };
    }
    case "3_mois":
      return { du: lendemain(reculerMois(aujourdhui, 3)), au: aujourdhui };
    case "12_mois":
      return { du: lendemain(reculerMois(aujourdhui, 12)), au: aujourdhui };
    case "exercice":
      return { du: iso(a, 1, 1), au: iso(a, 12, 31) };
    case "libre": {
      const du = libre?.du && ISO.test(libre.du) ? libre.du : null;
      const au = libre?.au && ISO.test(libre.au) ? libre.au : null;
      if (du && au) return du <= au ? { du, au } : { du: au, au: du };
      return bornesPeriode("mois", aujourdhui);
    }
    case "mois":
    default:
      return { du: iso(a, m, 1), au: iso(a, m, dernierJour(a, m)) };
  }
}

export const CANAUX = [
  { valeur: "tous", libelle: "Tous" },
  { valeur: "comptoir", libelle: "Comptoir" },
  { valeur: "en_ligne", libelle: "En ligne" },
] as const;
export type Canal = (typeof CANAUX)[number]["valeur"];

// ── Les lignes ─────────────────────────────────────────────────────────────

export type LigneStat = {
  vente_id: string;
  /** Pour un retour : la vente d'origine. */
  vente_origine_id: string | null;
  /** Date de Zurich de la vente (ou du retour). */
  jour: string;
  canal: string;
  vendu_par: string | null;
  statut_vente: string;
  /** Statut de la vente d'origine, pour un retour. */
  statut_origine: string | null;
  /** Fiche client de recette, ou vente d'origine d'un client de recette. */
  client_recette: boolean;
  article_id: string | null;
  article_nom: string | null;
  article_categorie: string | null;
  article_recette: boolean;
  quantite: number;
  /** Montant TTC de la ligne, signé. */
  montant: number;
  taux_tva: number;
  cout_unitaire_fige: number | null;
  remise_origine: string | null;
  libelle: string;
};

export type Filtres = {
  du: string;
  au: string;
  canal: Canal;
  vendeuse: string | null;
};

/** La ligne entre-t-elle dans les statistiques ? */
export function ligneRetenue(l: LigneStat, f: Filtres): boolean {
  if (l.jour < f.du || l.jour > f.au) return false;
  if (l.statut_vente !== "finalisee") return false;
  // Le retour d'une vente entièrement rendue : la vente est exclue, lui aussi.
  if (l.vente_origine_id && l.statut_origine !== "finalisee") return false;
  if (l.client_recette || l.article_recette) return false;
  if (f.canal !== "tous" && l.canal !== f.canal) return false;
  if (f.vendeuse && l.vendu_par !== f.vendeuse) return false;
  return true;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const ht = (l: Pick<LigneStat, "montant" | "taux_tva">) =>
  l.montant / (1 + (Number(l.taux_tva) || 0) / 100);

// ── Agrégats ───────────────────────────────────────────────────────────────

export type Agregat = {
  cle: string;
  libelle: string;
  categorie: string | null;
  quantite: number;
  caTtc: number;
  caHt: number;
  /** Coût figé total des lignes qui en ont un. */
  cout: number;
  /** CA HT des seules lignes chiffrées : la base de la marge. */
  caHtChiffre: number;
  /** Marge brute sur les lignes chiffrées ; null si aucune ne l'est. */
  marge: number | null;
  margePct: number | null;
  lignesSansCout: number;
  lignes: number;
};

function nouvelAgregat(cle: string, libelle: string, categorie: string | null): Agregat {
  return {
    cle, libelle, categorie, quantite: 0, caTtc: 0, caHt: 0, cout: 0, caHtChiffre: 0,
    marge: null, margePct: null, lignesSansCout: 0, lignes: 0,
  };
}

function ajouter(a: Agregat, l: LigneStat) {
  a.quantite += l.quantite;
  a.caTtc += l.montant;
  a.caHt += ht(l);
  a.lignes += 1;
  if (l.cout_unitaire_fige === null || l.cout_unitaire_fige === undefined) {
    a.lignesSansCout += 1;
  } else {
    a.cout += l.quantite * Number(l.cout_unitaire_fige);
    a.caHtChiffre += ht(l);
  }
}

function clore(a: Agregat): Agregat {
  const chiffre = a.lignes - a.lignesSansCout > 0;
  const marge = chiffre ? r2(a.caHtChiffre - a.cout) : null;
  return {
    ...a,
    quantite: Math.round(a.quantite * 1000) / 1000,
    caTtc: r2(a.caTtc),
    caHt: r2(a.caHt),
    cout: r2(a.cout),
    caHtChiffre: r2(a.caHtChiffre),
    marge,
    margePct: marge !== null && Math.abs(a.caHtChiffre) > 0.005
      ? Math.round((marge / a.caHtChiffre) * 1000) / 10
      : null,
  };
}

export type Statistiques = {
  articles: Agregat[];
  categories: Agregat[];
  totaux: {
    caTtc: number;
    caHt: number;
    cout: number;
    marge: number | null;
    margePct: number | null;
    nbVentes: number;
    panierMoyen: number | null;
    /** Part du CA TTC réalisée avec des membres (une remise membre sur la vente). */
    partMembres: number | null;
    remiseMembre: number;
  };
  couverture: {
    /** Lignes d'article sans coût figé. */
    lignesSansCout: number;
    lignesArticle: number;
    /** Part du CA HT des articles couverte par un coût, en %. */
    pourcentage: number | null;
  };
};

export type ArticleCatalogue = { id: string; nom: string; categorie: string | null };

/**
 * Tout l'écran, depuis les lignes brutes et les filtres.
 * `catalogue` : les articles vendables à montrer même sans vente (« ne se vend pas »).
 */
export function calculerStatistiques(
  lignesBrutes: LigneStat[],
  filtres: Filtres,
  catalogue: ArticleCatalogue[] = [],
): Statistiques {
  const lignes = lignesBrutes.filter((l) => ligneRetenue(l, filtres));

  const parArticle = new Map<string, Agregat>();
  const parCategorie = new Map<string, Agregat>();
  for (const a of catalogue) {
    parArticle.set(a.id, nouvelAgregat(a.id, a.nom, a.categorie));
  }

  let caTtc = 0, caHt = 0, cout = 0, caHtChiffre = 0, caHtArticles = 0;
  let lignesArticle = 0, lignesSansCout = 0, remiseMembre = 0;
  const ventes = new Set<string>();
  const caParVente = new Map<string, number>();
  const ventesMembres = new Set<string>();

  for (const l of lignes) {
    caTtc += l.montant;
    caHt += ht(l);
    // Une vente se compte par sa vente d'origine : un retour ne fait pas une vente de plus.
    const venteRef = l.vente_origine_id ?? l.vente_id;
    if (!l.vente_origine_id) ventes.add(l.vente_id);
    caParVente.set(venteRef, (caParVente.get(venteRef) ?? 0) + l.montant);

    const estRemiseMembre = l.remise_origine === "membre" || (!l.article_id && /remise membre/i.test(l.libelle));
    if (estRemiseMembre) {
      ventesMembres.add(venteRef);
      if (!l.article_id) remiseMembre += -l.montant;
    }

    if (!l.article_id) continue;
    lignesArticle += 1;
    caHtArticles += ht(l);
    if (l.cout_unitaire_fige === null || l.cout_unitaire_fige === undefined) {
      lignesSansCout += 1;
    } else {
      cout += l.quantite * Number(l.cout_unitaire_fige);
      caHtChiffre += ht(l);
    }

    const art = parArticle.get(l.article_id)
      ?? nouvelAgregat(l.article_id, l.article_nom ?? l.libelle, l.article_categorie);
    ajouter(art, l);
    parArticle.set(l.article_id, art);

    const cleCat = l.article_categorie ?? "—";
    const cat = parCategorie.get(cleCat) ?? nouvelAgregat(cleCat, cleCat, cleCat);
    ajouter(cat, l);
    parCategorie.set(cleCat, cat);
  }

  const caMembres = [...ventesMembres].reduce((s, v) => s + (caParVente.get(v) ?? 0), 0);
  const marge = lignesArticle - lignesSansCout > 0 ? r2(caHtChiffre - cout) : null;

  return {
    articles: [...parArticle.values()].map(clore),
    categories: [...parCategorie.values()].map(clore),
    totaux: {
      caTtc: r2(caTtc),
      caHt: r2(caHt),
      cout: r2(cout),
      marge,
      margePct: marge !== null && Math.abs(caHtChiffre) > 0.005 ? Math.round((marge / caHtChiffre) * 1000) / 10 : null,
      nbVentes: ventes.size,
      panierMoyen: ventes.size > 0 ? r2(caTtc / ventes.size) : null,
      partMembres: Math.abs(caTtc) > 0.005 ? Math.round((caMembres / caTtc) * 1000) / 10 : null,
      remiseMembre: r2(remiseMembre),
    },
    couverture: {
      lignesSansCout,
      lignesArticle,
      pourcentage: Math.abs(caHtArticles) > 0.005 ? Math.round((caHtChiffre / caHtArticles) * 100) : null,
    },
  };
}

/**
 * « Marge calculée sur 87 % des ventes — 12 lignes sans coût renseigné », ou
 * null quand toutes les lignes ont leur coût. Jamais une marge à 100 % faute
 * de coût : c'est précisément ce que cette phrase empêche.
 */
export function avertissementCouverture(c: Statistiques["couverture"]): string | null {
  if (c.lignesSansCout === 0) return null;
  const lignes = `${c.lignesSansCout} ligne${c.lignesSansCout > 1 ? "s" : ""} sans coût renseigné`;
  if (c.pourcentage === null || c.lignesSansCout === c.lignesArticle) {
    return `Marge non calculable — ${lignes}`;
  }
  return `Marge calculée sur ${c.pourcentage} % des ventes — ${lignes}`;
}

// ── Tri, palmarès, export ──────────────────────────────────────────────────

export const COLONNES_TRI = ["libelle", "quantite", "caTtc", "caHt", "cout", "marge", "margePct"] as const;
export type ColonneTri = (typeof COLONNES_TRI)[number];

export function trier(lignes: Agregat[], colonne: ColonneTri, sens: "asc" | "desc"): Agregat[] {
  const facteur = sens === "asc" ? 1 : -1;
  return [...lignes].sort((a, b) => {
    const va = a[colonne];
    const vb = b[colonne];
    // Une marge inconnue va toujours au fond, quel que soit le sens.
    if (va === null && vb !== null) return 1;
    if (vb === null && va !== null) return -1;
    if (typeof va === "string" || typeof vb === "string") {
      return String(va ?? "").localeCompare(String(vb ?? ""), "fr") * facteur;
    }
    return ((Number(va) - Number(vb)) || a.libelle.localeCompare(b.libelle, "fr")) * facteur;
  });
}

/**
 * Les dix premiers et les dix derniers par chiffre d'affaires, parmi les
 * articles qui se sont vendus, et à part ceux qui ne se sont pas vendus du tout.
 */
export function palmares(articles: Agregat[]): { premiers: Set<string>; derniers: Set<string>; sansVente: Set<string> } {
  const vendus = articles.filter((a) => a.lignes > 0);
  const parCa = [...vendus].sort((a, b) => b.caTtc - a.caTtc || a.libelle.localeCompare(b.libelle, "fr"));
  const premiers = new Set(parCa.slice(0, 10).map((a) => a.cle));
  const derniers = new Set(parCa.slice(-10).filter((a) => !premiers.has(a.cle)).map((a) => a.cle));
  const sansVente = new Set(articles.filter((a) => a.lignes === 0).map((a) => a.cle));
  return { premiers, derniers, sansVente };
}

const nombreCsv = (n: number | null) => (n === null ? "" : n.toFixed(2));
const texteCsv = (t: string) => (/[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t);

/** La table par article, en CSV point-virgule (Excel suisse), BOM compris. */
export function csvArticles(articles: Agregat[], libelleCategorie: (c: string | null) => string): string {
  const entete = ["Article", "Catégorie", "Quantité", "CA TTC", "CA HT", "Coût figé", "Marge CHF", "Marge %", "Lignes sans coût"];
  const lignes = articles.map((a) => [
    texteCsv(a.libelle),
    texteCsv(libelleCategorie(a.categorie)),
    String(a.quantite),
    nombreCsv(a.caTtc),
    nombreCsv(a.caHt),
    nombreCsv(a.cout),
    nombreCsv(a.marge),
    a.margePct === null ? "" : a.margePct.toFixed(1),
    String(a.lignesSansCout),
  ].join(";"));
  return "﻿" + [entete.join(";"), ...lignes].join("\r\n") + "\r\n";
}

export type ParamsStatistiques = { periode?: string; du?: string; au?: string; canal?: string; vendeuse?: string };

/** Les filtres lus dans l'adresse : un lien partagé montre le même écran. */
export function lireFiltresStatistiques(params: ParamsStatistiques, aujourdhui: string) {
  const periode: Periode = estPeriode(params.periode) ? params.periode : "mois";
  const { du, au } = bornesPeriode(periode, aujourdhui, { du: params.du, au: params.au });
  const canal: Canal = CANAUX.some((c) => c.valeur === params.canal) ? (params.canal as Canal) : "tous";
  const vendeuse = params.vendeuse && /^[0-9a-f-]{36}$/i.test(params.vendeuse) ? params.vendeuse : null;
  return { periode, du, au, canal, vendeuse };
}
