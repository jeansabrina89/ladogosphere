import { sousLeSeuil, valeurStock } from "@/src/lib/boutiqueLogique";
import { estEnRetard } from "@/src/lib/personnalisationLogique";

/**
 * Les chiffres du tableau de bord de la boutique : ceux qui décident d'une
 * action, et rien d'autre. Fonction pure, sans base — c'est elle que les tests
 * couvrent, et c'est elle qui dit ce qu'un chiffre veut dire.
 *
 * Les retours (ventes négatives) comptent dans les MONTANTS, jamais dans le
 * nombre de ventes : on n'a pas vendu deux fois parce qu'on a rendu.
 */

export type VenteDuTableau = {
  date_vente: string;
  montant_total: number | string;
  mode_reglement: string | null;
  vente_origine_id: string | null;
};

export type CommandeDuTableau = {
  statut: string;
  date_promise: string | null;
};

export type ArticleDuTableau = {
  actif: boolean;
  composant?: boolean;
  type_article?: string | null;
  stock_actuel: number | string | null;
  stock_alerte: number | string | null;
  prix_achat: number | string | null;
};

export type ChiffresBoutique = {
  ventesJourNombre: number;
  ventesJourTotal: number;
  ventesMoisTotal: number;
  especesJour: number;
  articlesActifs: number;
  sousLeSeuil: number;
  commandesAFaire: number;
  commandesEnRetard: number;
  valeurStock: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Le jour d'une vente, quel que soit le fuseau écrit dans l'horodatage. */
function jourDe(dateVente: string): string {
  return String(dateVente ?? "").slice(0, 10);
}

export function chiffresBoutique(entree: {
  ventes: VenteDuTableau[];
  commandes: CommandeDuTableau[];
  articles: ArticleDuTableau[];
  /** Aujourd'hui, en ISO — jamais lu de l'horloge ici. */
  jourISO: string;
}): ChiffresBoutique {
  const jour = entree.jourISO.slice(0, 10);
  const mois = jour.slice(0, 7);

  const duJour = entree.ventes.filter((v) => jourDe(v.date_vente) === jour);
  const duMois = entree.ventes.filter((v) => jourDe(v.date_vente).startsWith(mois));

  // Un article sur mesure n'a pas de stock, une fourniture ne se vend pas
  // seule : ni l'un ni l'autre ne compte parmi les articles du magasin.
  const enRayon = entree.articles.filter(
    (a) => a.actif && a.composant !== true && a.type_article !== "personnalisable"
  );

  return {
    ventesJourNombre: duJour.filter((v) => !v.vente_origine_id).length,
    ventesJourTotal: r2(duJour.reduce((s, v) => s + Number(v.montant_total), 0)),
    ventesMoisTotal: r2(duMois.reduce((s, v) => s + Number(v.montant_total), 0)),
    especesJour: r2(
      duJour
        .filter((v) => v.mode_reglement === "especes")
        .reduce((s, v) => s + Number(v.montant_total), 0)
    ),
    articlesActifs: enRayon.length,
    sousLeSeuil: enRayon.filter((a) =>
      sousLeSeuil({ stock_actuel: a.stock_actuel, stock_alerte: a.stock_alerte })
    ).length,
    commandesAFaire: entree.commandes.filter((c) => c.statut === "a_faire").length,
    commandesEnRetard: entree.commandes.filter((c) =>
      estEnRetard(c.date_promise, c.statut, jour)
    ).length,
    valeurStock: valeurStock(
      enRayon.map((a) => ({ stock_actuel: a.stock_actuel, prix_achat: a.prix_achat }))
    ),
  };
}

/** Premier jour du mois d'une date ISO — la borne des « ventes du mois ». */
export function debutDuMois(jourISO: string): string {
  return `${jourISO.slice(0, 7)}-01`;
}
