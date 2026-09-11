/**
 * La facture mensuelle d'un locataire de box.
 *
 * Trois sortes de lignes, et elles ne se mélangent jamais :
 *
 *   · le FORFAIT, au prix figé à la souscription ;
 *   · les prestations À L'ACTE réellement faites, groupées par type ;
 *   · le LOYER DU BOX refacturé, sur son propre compte de produit.
 *
 * Le loyer sur 3021 et non 3020 : un loyer qui transite n'est pas un service
 * rendu. Les fondre empêcherait Sabrina de lire d'un coup d'œil ce qu'elle
 * gagne et ce qu'elle ne fait que faire passer.
 *
 * Une prestation non faite n'est pas facturée. Une tâche annulée avec motif
 * sort du décompte, et son motif peut figurer en note.
 *
 * Fonction pure : ni base, ni requête.
 */

export const COMPTE_PRESTATIONS = "3020";
export const COMPTE_LOYER_REFACTURE = "3021";
export const CODE_TVA_LOYER = "loyer_box_refacture";

const r2 = (n: number) => Math.round(n * 100) / 100;

export type LigneFacture = {
  libelle: string;
  quantite: number;
  prix_unitaire: number;
  montant: number;
  compte_produit: string;
  taux_tva: number;
  motif_tva: string | null;
  /** Les identifiants de tâches reprises par cette ligne. */
  taches: string[];
};

export type TacheAFacturer = {
  id: string;
  prestation_id: string;
  nom: string;
  statut: string;
  facturable: boolean;
  prix_fige: number | string | null;
  taux_tva: number | string | null;
  motif_tva?: string | null;
  motif_annulation?: string | null;
  date: string;
};

export type Forfait = {
  nom: string;
  prix: number | string | null;
  taux_tva: number | string | null;
  motif_tva?: string | null;
};

export type LoyerRefacture = {
  montant: number | string | null;
  taux_tva: number | string | null;
  motif_tva?: string | null;
  /** Bornes de la location, pour le prorata. */
  depuis?: string | null;
  jusquAu?: string | null;
};

export type FactureMensuelle = {
  lignes: LigneFacture[];
  total: number;
  /** Les prestations écartées, avec leur motif — à reprendre en note si voulu. */
  notes: string[];
  /** Ce que la ligne de loyer doit à un mois incomplet. */
  proratLoyer: { jours: number; joursDuMois: number; complet: boolean } | null;
};

// ── Le mois ───────────────────────────────────────────────────────────────

/** Premier et dernier jour d'un mois « AAAA-MM ». */
export function bornesDuMois(mois: string): { debut: string; fin: string; jours: number } {
  const [a, m] = mois.split("-").map(Number);
  const jours = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return { debut: `${a}-${mm}-01`, fin: `${a}-${mm}-${String(jours).padStart(2, "0")}`, jours };
}

export function libelleMois(mois: string): string {
  const noms = [
    "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre",
  ];
  const [a, m] = mois.split("-").map(Number);
  return `${noms[m - 1] ?? mois} ${a}`;
}

/**
 * Le prorata du loyer : JOURS RÉELS SUR JOURS DU MOIS.
 *
 * C'est la règle la plus simple et la plus lisible, et c'est pour cela qu'elle
 * est retenue : un locataire parti le 10 d'un mois de 30 jours paie 10/30. Pas
 * de trentième commercial, pas de demi-mois, rien qui demande d'expliquer.
 *
 * Un mois entièrement couvert ne subit AUCUN prorata — pas même un arrondi :
 * le montant saisi sort tel quel.
 */
export function proratLoyer({
  mois,
  depuis,
  jusquAu,
}: {
  mois: string;
  depuis?: string | null;
  jusquAu?: string | null;
}): { jours: number; joursDuMois: number; complet: boolean } {
  const { debut, fin, jours: joursDuMois } = bornesDuMois(mois);
  const d = depuis && depuis > debut ? depuis : debut;
  const f = jusquAu && jusquAu < fin ? jusquAu : fin;
  if (f < d) return { jours: 0, joursDuMois, complet: false };
  const jours =
    Math.round((Date.parse(`${f}T12:00:00Z`) - Date.parse(`${d}T12:00:00Z`)) / 86400000) + 1;
  return { jours, joursDuMois, complet: jours >= joursDuMois };
}

// ── La facture ────────────────────────────────────────────────────────────

/**
 * Les lignes proposées pour un mois. Rien n'est écrit ici : c'est une
 * proposition, que l'écran montre avant que Sabrina ne l'émette.
 *
 * Le forfait se déduit des absences SEULEMENT si le réglage le dit — c'est une
 * décision que Sabrina n'a pas encore prise, et qui ne se devine pas.
 */
export function factureMensuelleLocataire({
  mois,
  forfait,
  taches,
  loyer,
  absenceDeduite = false,
  joursAbsence = 0,
}: {
  mois: string;
  forfait?: Forfait | null;
  taches: readonly TacheAFacturer[];
  loyer?: LoyerRefacture | null;
  absenceDeduite?: boolean;
  joursAbsence?: number;
}): FactureMensuelle {
  const lignes: LigneFacture[] = [];
  const notes: string[] = [];
  const { jours: joursDuMois } = bornesDuMois(mois);

  // 1. Le forfait, au prix figé.
  if (forfait && Number(forfait.prix ?? 0) > 0) {
    const plein = Number(forfait.prix ?? 0);
    const retenus = absenceDeduite
      ? Math.max(0, joursDuMois - Math.max(0, Math.floor(joursAbsence)))
      : joursDuMois;
    const montant = r2((plein * retenus) / joursDuMois);
    if (absenceDeduite && retenus < joursDuMois) {
      notes.push(
        `Forfait réduit de ${joursDuMois - retenus} jour(s) d'absence sur ${joursDuMois}.`
      );
    }
    lignes.push({
      libelle: `${forfait.nom} — ${libelleMois(mois)}`,
      quantite: 1,
      prix_unitaire: montant,
      montant,
      compte_produit: COMPTE_PRESTATIONS,
      taux_tva: Number(forfait.taux_tva ?? 0),
      motif_tva: (forfait.motif_tva ?? null) || null,
      taches: [],
    });
  }

  // 2. Les prestations à l'acte, groupées par type, prix et taux — deux
  //    passages au même prix font une ligne « ×4 », pas quatre lignes.
  const groupes = new Map<string, LigneFacture>();
  for (const t of taches) {
    if (t.statut === "annulee") {
      const motif = String(t.motif_annulation ?? "").trim();
      notes.push(`${t.date} — ${t.nom} non faite${motif ? ` : ${motif}` : ""}.`);
      continue;
    }
    if (!t.facturable || t.statut !== "faite") continue;
    const prix = Number(t.prix_fige ?? 0);
    const taux = Number(t.taux_tva ?? 0);
    const cle = `${t.prestation_id}|${prix}|${taux}`;
    const existante = groupes.get(cle);
    if (existante) {
      existante.quantite += 1;
      existante.montant = r2(existante.quantite * existante.prix_unitaire);
      existante.taches.push(t.id);
    } else {
      groupes.set(cle, {
        libelle: t.nom,
        quantite: 1,
        prix_unitaire: prix,
        montant: r2(prix),
        compte_produit: COMPTE_PRESTATIONS,
        taux_tva: taux,
        motif_tva: (t.motif_tva ?? null) || null,
        taches: [t.id],
      });
    }
  }
  lignes.push(...groupes.values());

  // 3. Le loyer refacturé, sur SON compte. Il ne dépend d'aucune tâche et
  //    n'est jamais déduit pour absence : il court tant que le box est occupé.
  let prorat: FactureMensuelle["proratLoyer"] = null;
  if (loyer && Number(loyer.montant ?? 0) > 0) {
    prorat = proratLoyer({ mois, depuis: loyer.depuis, jusquAu: loyer.jusquAu });
    if (prorat.jours > 0) {
      const plein = Number(loyer.montant ?? 0);
      const montant = prorat.complet
        ? r2(plein)
        : r2((plein * prorat.jours) / prorat.joursDuMois);
      lignes.push({
        libelle: prorat.complet
          ? `Loyer du box — ${libelleMois(mois)}`
          : `Loyer du box — ${libelleMois(mois)} (${prorat.jours} jour(s) sur ${prorat.joursDuMois})`,
        quantite: 1,
        prix_unitaire: montant,
        montant,
        compte_produit: COMPTE_LOYER_REFACTURE,
        taux_tva: Number(loyer.taux_tva ?? 0),
        motif_tva: (loyer.motif_tva ?? null) || null,
        taches: [],
      });
    }
  }

  return {
    lignes,
    total: r2(lignes.reduce((s, l) => s + l.montant, 0)),
    notes,
    proratLoyer: prorat,
  };
}

/** Le total indicatif des prestations d'une formule, par mois. */
export function totalIndicatifFormule(
  lignes: readonly { quantite_par_semaine: number | string; prix: number | string }[]
): { parSemaine: number; parMois: number } {
  const parSemaine = r2(
    lignes.reduce(
      (s, l) => s + Number(l.quantite_par_semaine ?? 0) * Number(l.prix ?? 0),
      0
    )
  );
  // 52 semaines sur 12 mois : le mois moyen fait 4,333 semaines. C'est un
  // repère pour composer, pas un montant qu'on facture.
  return { parSemaine, parMois: r2((parSemaine * 52) / 12) };
}
