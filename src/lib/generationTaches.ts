import {
  JOURS_SEMAINE,
  cleSemaine,
  datesDe,
  decalerJour,
  joursValides,
  jourDe,
  type JourSemaine,
} from "@/src/lib/prestationsLogique";

/**
 * La génération des tâches d'un forfait, sur une fenêtre glissante.
 *
 * QUATORZE JOURS, jamais l'année entière. Une année générée d'avance, c'est
 * quelques milliers de lignes qu'il faudrait toutes reprendre au moindre
 * changement de formule — et qu'on finirait par reprendre à moitié.
 *
 * Trois règles, et elles tiennent ensemble :
 *
 *   · la FORMULE dit quoi, combien par semaine, et quels jours ;
 *   · les JOURS PERSONNALISÉS remplacent les jours d'une prestation pour UNE
 *     semaine — c'est ce qui permet de jongler sans changer d'abonnement ;
 *   · la régénération est IDEMPOTENTE : relancer ne duplique rien, et une
 *     tâche déjà faite n'est jamais supprimée.
 *
 * Fonction pure : ni base, ni requête. C'est elle que les tests couvrent.
 */

export const FENETRE_JOURS = 14;

export type LigneFormule = {
  prestation_id: string;
  quantite_par_semaine: number;
  /** null vaut « tous les jours ». Une liste dit lesquels. */
  jours?: string[] | null;
};

/**
 * Les ajustements, par semaine ISO puis par prestation :
 *   { "2026-W38": { "<prestation_id>": ["lundi","jeudi"] } }
 *
 * Une liste vide vaut « rien cette semaine-là » — c'est ainsi qu'un locataire
 * dit qu'il sera absent. Une prestation absente de l'objet suit la formule.
 */
export type JoursPersonnalises = Record<string, Record<string, string[]>>;

export type TacheAttendue = {
  date: string;
  prestation_id: string;
  /** Distingue deux passages du même jour pour la même prestation. */
  rang: number;
};

export type TacheExistante = TacheAttendue & {
  id: string;
  statut: string;
};

/**
 * Les jours retenus pour une prestation, une semaine donnée.
 *
 * L'ajustement REMPLACE les jours de la formule pour cette semaine ; il ne s'y
 * ajoute pas. Sans ajustement, la formule s'applique ; sans jours dans la
 * formule, c'est tous les jours.
 */
export function joursRetenus({
  ligne,
  semaine,
  joursPersonnalises,
}: {
  ligne: LigneFormule;
  semaine: string;
  joursPersonnalises?: JoursPersonnalises | null;
}): JourSemaine[] {
  const ajuste = joursPersonnalises?.[semaine]?.[ligne.prestation_id];
  if (Array.isArray(ajuste)) return joursValides(ajuste);
  return ligne.jours ? joursValides(ligne.jours) : [...JOURS_SEMAINE];
}

/**
 * Comment `quantite_par_semaine` se répartit sur les jours retenus.
 *
 * Un tour de base pour chacun, puis le reste distribué aux premiers jours de
 * la semaine. « 2 nettoyages, lundi et jeudi » donne un chacun ; « 14 passages,
 * tous les jours » en donne deux par jour ; « 3 balades, tous les jours » en
 * met une lundi, une mardi, une mercredi — et cette règle-là se relit.
 */
export function repartitionHebdomadaire({
  quantiteParSemaine,
  jours,
}: {
  quantiteParSemaine: number;
  jours: readonly JourSemaine[];
}): Map<JourSemaine, number> {
  const par = new Map<JourSemaine, number>();
  const n = jours.length;
  if (n === 0) return par;
  const total = Math.max(0, Math.round(Number(quantiteParSemaine) || 0));
  const base = Math.floor(total / n);
  let reste = total - base * n;
  for (const j of jours) {
    const extra = reste > 0 ? 1 : 0;
    reste -= extra;
    const combien = base + extra;
    if (combien > 0) par.set(j, combien);
  }
  return par;
}

/**
 * Tout ce que l'abonnement doit produire sur la fenêtre demandée.
 *
 * Les bornes de l'abonnement l'emportent toujours : rien avant sa date de
 * début, rien après sa date de fin. Un abonnement suspendu ou terminé ne
 * produit rien du tout.
 */
export function tachesAttendues({
  lignes,
  joursPersonnalises,
  debut,
  fin,
  abonnementDebut,
  abonnementFin,
  statut = "actif",
}: {
  lignes: readonly LigneFormule[];
  joursPersonnalises?: JoursPersonnalises | null;
  debut: string;
  fin: string;
  abonnementDebut: string;
  abonnementFin?: string | null;
  statut?: string;
}): TacheAttendue[] {
  if (statut !== "actif") return [];

  const depuis = debut > abonnementDebut ? debut : abonnementDebut;
  const jusqua = abonnementFin && abonnementFin < fin ? abonnementFin : fin;

  const attendues: TacheAttendue[] = [];
  // Le cache évite de recalculer la répartition pour chaque jour de la semaine.
  const cache = new Map<string, Map<JourSemaine, number>>();

  for (const date of datesDe(depuis, jusqua)) {
    const semaine = cleSemaine(date);
    const jour = jourDe(date);
    for (const ligne of lignes) {
      const cle = `${semaine}|${ligne.prestation_id}`;
      let repartition = cache.get(cle);
      if (!repartition) {
        repartition = repartitionHebdomadaire({
          quantiteParSemaine: ligne.quantite_par_semaine,
          jours: joursRetenus({ ligne, semaine, joursPersonnalises }),
        });
        cache.set(cle, repartition);
      }
      const combien = repartition.get(jour) ?? 0;
      for (let rang = 1; rang <= combien; rang += 1) {
        attendues.push({ date, prestation_id: ligne.prestation_id, rang });
      }
    }
  }

  return attendues;
}

export type PlanRegeneration = {
  aCreer: TacheAttendue[];
  /** Les identifiants à retirer : uniquement des tâches encore à faire. */
  aSupprimer: string[];
  /** Ce qui reste en place parce qu'on n'y touche jamais. */
  preservees: string[];
};

const cleTache = (t: TacheAttendue) => `${t.date}|${t.prestation_id}|${t.rang}`;

/**
 * Ce qu'il faut créer et ce qu'il faut retirer pour que la base dise la même
 * chose que la formule.
 *
 * Deux garde-fous, et ce sont eux qui rendent la régénération sûre :
 *
 *   · une tâche déjà FAITE n'est jamais supprimée — elle raconte un travail
 *     réellement accompli, et une formule qui change plus tard ne l'efface pas ;
 *   · une tâche ANNULÉE avec motif n'est jamais ressuscitée — la régénération
 *     la reverrait « manquante » et la recréerait indéfiniment.
 *
 * Relancer deux fois de suite rend un plan vide : c'est la définition même de
 * l'idempotence, et c'est ce que le test vérifie.
 */
export function planRegeneration({
  attendues,
  existantes,
}: {
  attendues: readonly TacheAttendue[];
  existantes: readonly TacheExistante[];
}): PlanRegeneration {
  const parCle = new Map<string, TacheExistante[]>();
  for (const e of existantes) {
    const cle = cleTache(e);
    const liste = parCle.get(cle);
    if (liste) liste.push(e);
    else parCle.set(cle, [e]);
  }

  const aCreer: TacheAttendue[] = [];
  const vues = new Set<string>();
  for (const a of attendues) {
    const cle = cleTache(a);
    vues.add(cle);
    // Une tâche annulée occupe sa place : on ne la recrée pas chaque nuit.
    if (!parCle.has(cle)) aCreer.push(a);
  }

  const aSupprimer: string[] = [];
  const preservees: string[] = [];
  for (const e of existantes) {
    if (vues.has(cleTache(e))) continue;
    if (e.statut === "a_faire") aSupprimer.push(e.id);
    else preservees.push(e.id);
  }

  return { aCreer, aSupprimer, preservees };
}

/** La fenêtre glissante : quatorze jours à partir d'aujourd'hui, inclus. */
export function fenetreGlissante(jour: string, jours = FENETRE_JOURS): {
  debut: string;
  fin: string;
} {
  return { debut: jour.slice(0, 10), fin: decalerJour(jour, jours - 1) };
}
