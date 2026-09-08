/**
 * Grille de tailles : déterminer une taille depuis une mesure.
 *
 * Le parti pris tient en une phrase : **une taille est une valeur d'option
 * comme une autre**. Elle n'est pas une question posée au client, elle se
 * calcule ; mais une fois déterminée, elle est le parent d'un groupe de
 * largeur, elle porte un supplément de prix, elle porte un supplément par
 * combinaison — exactement comme un coloris ou une matière. C'est ce qui
 * permet à tout l'existant (dépendances, prix, figement) de fonctionner sans
 * une ligne de plus.
 *
 * Aucune dépendance à la base : c'est ici que vivent les décisions, et c'est
 * ce fichier que les tests couvrent.
 */

import {
  nettoyerChoixInvalides,
  valeurRetenue,
  type ChoixParGroupe,
  type Dependance,
  type OptionGroupe,
  type OptionValeur,
} from "@/src/lib/personnalisationLogique";

const r2 = (n: number) => Math.round(n * 100) / 100;

const nb = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

export type ModeTaille = "seuils" | "plages";

/** Une taille telle qu'elle est saisie : un libellé et ses bornes. */
export type Taille = OptionValeur & {
  borne_min?: number | string | null;
  borne_max?: number | string | null;
};

export type GroupeTaille = OptionGroupe & {
  mode_taille?: ModeTaille | null;
  mesure_groupe_id?: string | null;
  supplement_par_cm?: number | string | null;
  borne_supplement_cm?: number | string | null;
};

/** Les tailles actives d'un groupe, rangées par borne basse. */
export function taillesTriees(groupe: GroupeTaille): Taille[] {
  return [...((groupe.valeurs ?? []) as Taille[])]
    .filter((t) => t.actif)
    .sort((a, b) => (nb(a.borne_min) ?? 0) - (nb(b.borne_min) ?? 0) || a.ordre - b.ordre);
}

// ── Mode « seuils » : l'intervalle se déduit ───────────────────────────────

export type Intervalle = {
  taille: Taille;
  min: number;
  /** Null : la dernière taille, qui n'a pas de fin. */
  max: number | null;
};

/**
 * Les intervalles réellement couverts en mode « seuils ».
 *
 * Une taille couvre [son seuil, seuil suivant[. La borne haute n'est jamais
 * stockée : elle se déduit. C'est ce qui interdit STRUCTURELLEMENT les trous
 * et les chevauchements — on ne peut pas se tromper sur une donnée qui
 * n'existe pas.
 */
export function intervallesSeuils(groupe: GroupeTaille): Intervalle[] {
  const tailles = taillesTriees(groupe);
  return tailles.map((taille, i) => ({
    taille,
    min: nb(taille.borne_min) ?? 0,
    max: i < tailles.length - 1 ? nb(tailles[i + 1].borne_min) : null,
  }));
}

/** « 21 à 26,9 cm », « 65 cm et plus » — ce que Sabrina lit à droite du seuil. */
export function libelleIntervalle(i: Intervalle, unite = "cm"): string {
  const fr = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");
  if (i.max === null) return `${fr(i.min)} ${unite} et plus`;
  // La borne haute est exclue : on affiche le dernier dixième qui reste dedans.
  const dernier = Math.round((i.max - 0.1) * 100) / 100;
  return `${fr(i.min)} à ${fr(dernier)} ${unite}`;
}

// ── Déterminer la taille ───────────────────────────────────────────────────

export type Proposition = {
  taille: Taille;
  /** Ce qui explique le classement, en une ligne, à écrire à l'écran. */
  raison: string;
  /** 0 = pile au centre de la plage, 1 = sur une borne. Absent en mode seuils. */
  ecartAuCentre?: number;
};

export type Determination =
  | { etat: "aucune_mesure" }
  | { etat: "trouvee"; propositions: Proposition[] }
  | { etat: "hors_grille"; message: string };

/**
 * Ce que la mesure désigne.
 *
 * En mode « seuils », une seule taille convient toujours : les intervalles se
 * touchent sans se recouvrir. En mode « plages », plusieurs peuvent convenir,
 * et on ne choisit PAS à la place du client : on les propose toutes, la mieux
 * ajustée en tête.
 */
export function determinerTaille(
  groupe: GroupeTaille,
  mesure: number | null | undefined
): Determination {
  const m = nb(mesure);
  if (m === null) return { etat: "aucune_mesure" };

  const unite = String(groupe.unite ?? "cm").trim() || "cm";
  const tailles = taillesTriees(groupe);
  if (tailles.length === 0) {
    return { etat: "hors_grille", message: "Aucune taille n'est encore définie." };
  }

  if (groupe.mode_taille === "plages") return parPlages(tailles, m, unite);
  return parSeuils(groupe, m, unite);
}

function parSeuils(groupe: GroupeTaille, m: number, unite: string): Determination {
  const intervalles = intervallesSeuils(groupe);
  const premier = intervalles[0];

  // Sous le premier seuil : la grille ne descend pas jusque-là.
  if (m < premier.min) {
    return {
      etat: "hors_grille",
      message: `${fr(m)} ${unite}, c'est en dessous de la plus petite taille (${fr(premier.min)} ${unite}). Nous pouvons le faire sur mesure.`,
    };
  }

  // La dernière n'a pas de fin : au-dessus du dernier seuil, elle s'applique.
  const trouve = intervalles.find((i) => m >= i.min && (i.max === null || m < i.max));
  if (!trouve) {
    return {
      etat: "hors_grille",
      message: `${fr(m)} ${unite} ne tombe dans aucune taille. Nous pouvons le faire sur mesure.`,
    };
  }

  return {
    etat: "trouvee",
    propositions: [{
      taille: trouve.taille,
      raison: `${fr(m)} ${unite} tombe dans ${libelleIntervalle(trouve, unite)}.`,
    }],
  };
}

function parPlages(tailles: Taille[], m: number, unite: string): Determination {
  const conviennent = tailles
    .map((taille) => {
      const min = nb(taille.borne_min);
      const max = nb(taille.borne_max);
      if (min === null || max === null || max < min) return null;
      if (m < min || m > max) return null;

      // Le meilleur ajustement, c'est le plus centré : un collier réglé en
      // bout de course tient mal et s'use plus vite.
      const milieu = (min + max) / 2;
      const demi = (max - min) / 2;
      const ecart = demi === 0 ? 0 : Math.abs(m - milieu) / demi;
      return { taille, min, max, ecart };
    })
    .filter((p): p is { taille: Taille; min: number; max: number; ecart: number } => p !== null)
    .sort((a, b) => a.ecart - b.ecart || a.min - b.min);

  if (conviennent.length === 0) {
    return {
      etat: "hors_grille",
      message: `Aucune taille réglable ne couvre ${fr(m)} ${unite}. Nous pouvons le faire sur mesure.`,
    };
  }

  return {
    etat: "trouvee",
    propositions: conviennent.map((p, rang) => ({
      taille: p.taille,
      ecartAuCentre: r2(p.ecart),
      raison: raisonPlage(p.ecart, rang, p.min, p.max, unite),
    })),
  };
}

function raisonPlage(ecart: number, rang: number, min: number, max: number, unite: string): string {
  const plage = `${fr(min)} à ${fr(max)} ${unite}`;
  if (rang === 0 && ecart <= 0.34) return `Votre chien est au milieu de cette plage (${plage}).`;
  if (rang === 0) return `C'est la plage la mieux ajustée (${plage}).`;
  if (ecart >= 0.85) return `Convient aussi, mais réglé en bout de course (${plage}).`;
  return `Convient aussi (${plage}).`;
}

const fr = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

/** La taille finalement retenue : la recommandée, sauf choix contraire. */
export function tailleRecommandee(d: Determination): Taille | null {
  return d.etat === "trouvee" ? d.propositions[0].taille : null;
}

// ── Continuité de la grille ────────────────────────────────────────────────

export type Trou = { de: number; a: number };

/**
 * Les trous d'une grille en mode « plages ».
 *
 * Les CHEVAUCHEMENTS sont permis et attendus — c'est tout l'intérêt d'une
 * gamme réglable, et les signaler comme des fautes ferait douter Sabrina de
 * quelque chose de correct. Les trous, eux, sont de vraies fautes : un chien
 * s'y perd.
 */
export function trousDeLaGrille(groupe: GroupeTaille): Trou[] {
  if (groupe.mode_taille !== "plages") return [];

  const plages = taillesTriees(groupe)
    .map((t) => ({ min: nb(t.borne_min), max: nb(t.borne_max) }))
    .filter((p): p is { min: number; max: number } =>
      p.min !== null && p.max !== null && p.max >= p.min)
    .sort((a, b) => a.min - b.min);

  const trous: Trou[] = [];
  let couvertJusqua: number | null = null;
  for (const p of plages) {
    if (couvertJusqua !== null && p.min > couvertJusqua) {
      trous.push({ de: r2(couvertJusqua), a: r2(p.min) });
    }
    couvertJusqua = couvertJusqua === null ? p.max : Math.max(couvertJusqua, p.max);
  }
  return trous;
}

export function messageTrou(t: Trou, unite = "cm"): string {
  return `Aucune taille ne couvre ${fr(t.de)} à ${fr(t.a)} ${unite}.`;
}

/**
 * Refus d'une grille incomplète, ou null. Un mode « seuils » ne peut pas être
 * troué ; on vérifie seulement qu'il commence quelque part.
 */
export function refusGrille(groupe: GroupeTaille): string | null {
  const tailles = taillesTriees(groupe);
  if (tailles.length === 0) return "Ajoutez au moins une taille.";

  const unite = String(groupe.unite ?? "cm").trim() || "cm";

  if (groupe.mode_taille === "seuils") {
    const seuils = tailles.map((t) => nb(t.borne_min));
    if (seuils.some((s) => s === null)) return "Chaque taille doit dire à partir de quelle mesure elle commence.";
    const doublons = seuils.filter((s, i) => seuils.indexOf(s) !== i);
    if (doublons.length > 0) {
      return `Deux tailles partent de ${fr(doublons[0]!)} ${unite} : un seuil ne se partage pas.`;
    }
    return null;
  }

  for (const t of tailles) {
    const min = nb(t.borne_min);
    const max = nb(t.borne_max);
    if (min === null || max === null) return `« ${t.libelle} » : indiquez la plage complète, de et à.`;
    if (max < min) return `« ${t.libelle} » : la borne haute est en dessous de la borne basse.`;
  }
  const trous = trousDeLaGrille(groupe);
  return trous.length > 0 ? messageTrou(trous[0], unite) : null;
}

/**
 * Ce que devient la grille si l'on retire une taille, en mode « seuils ».
 * La précédente s'étend jusqu'à la suivante : il faut le dire AVANT de valider.
 */
export function consequenceSuppression(
  groupe: GroupeTaille,
  tailleId: string
): string | null {
  if (groupe.mode_taille !== "seuils") return null;

  const intervalles = intervallesSeuils(groupe);
  const i = intervalles.findIndex((x) => x.taille.id === tailleId);
  if (i === -1) return null;

  const unite = String(groupe.unite ?? "cm").trim() || "cm";
  const partant = intervalles[i];
  const couverture = libelleIntervalle(partant, unite);

  if (i === 0) {
    const suivant = intervalles[1];
    return suivant
      ? `« ${partant.taille.libelle} » disparaîtra : les chiens de ${couverture} passeront en « ${suivant.taille.libelle} », qui partira de ${fr(partant.min)} ${unite}.`
      : `« ${partant.taille.libelle} » disparaîtra : la grille n'aura plus aucune taille.`;
  }
  const precedent = intervalles[i - 1];
  return `« ${partant.taille.libelle} » disparaîtra : les chiens de ${couverture} passeront en « ${precedent.taille.libelle} ».`;
}

// ── Prix ───────────────────────────────────────────────────────────────────

/**
 * Supplément au centimètre au-delà d'une borne.
 *
 * Prévu pour les laisses — facturer 3 m sans créer une taille par longueur —
 * et laissé à null sur les colliers. Il s'ajoute au supplément de la taille :
 * ce sont deux choses différentes, l'une tient à la gamme, l'autre à la
 * matière consommée en plus.
 */
export function supplementAuCentimetre(
  groupe: GroupeTaille,
  mesure: number | null | undefined
): number {
  const m = nb(mesure);
  const parCm = nb(groupe.supplement_par_cm);
  const borne = nb(groupe.borne_supplement_cm);
  if (m === null || parCm === null || parCm === 0 || borne === null) return 0;
  if (m <= borne) return 0;
  return r2((m - borne) * parCm);
}

// ── Ordre des questions ────────────────────────────────────────────────────

/**
 * Refus d'un ordre qui rendrait une grille de tailles incalculable.
 *
 * La mesure qui SERT AU CALCUL passe avant la taille, la taille avant ce qui
 * en dépend. Les autres mesures — celles qui ne commandent rien — restent où
 * elles sont : on ne les remonte pas au début d'un parcours pour rien.
 */
export function refusOrdreTailles(groupes: GroupeTaille[]): string | null {
  const parId = new Map(groupes.map((g) => [g.id, g]));

  for (const g of groupes) {
    if (g.type !== "taille" || !g.mesure_groupe_id) continue;
    const mesure = parId.get(g.mesure_groupe_id);
    if (!mesure) {
      return `« ${g.nom} » se déduit d'une mesure qui n'est plus là. Rattachez-la, ou changez le type du groupe.`;
    }
    if (mesure.ordre >= g.ordre) {
      return `« ${g.nom} » se déduit de « ${mesure.nom} » : la mesure doit être posée avant.`;
    }
  }
  return null;
}

/** Les mesures utilisées par une grille : celles qu'on ne peut pas descendre. */
export function mesuresQuiCommandent(groupes: GroupeTaille[]): Set<string> {
  const ids = new Set<string>();
  for (const g of groupes) {
    if (g.type === "taille" && g.mesure_groupe_id) ids.add(g.mesure_groupe_id);
  }
  return ids;
}

// ── Recalcul après changement de mesure ────────────────────────────────────

export type RecalculTailles = {
  choix: ChoixParGroupe;
  /** Ce qui a changé, en toutes lettres : jamais un choix effacé en silence. */
  messages: string[];
};

/**
 * Applique les grilles de tailles aux choix courants, puis nettoie ce qui est
 * devenu impossible.
 *
 * Deux chemins mènent à la même taille, et le client choisit lequel :
 *   • il saisit la mesure → la taille se DÉDUIT et s'affiche en clair ;
 *   • il choisit la taille directement → la mesure reste vide, c'est valable.
 *
 * Une taille choisie à la main n'est jamais écrasée par un recalcul : c'est
 * une décision du client, pas une valeur par défaut. Une taille déduite, elle,
 * suit sa mesure — et si la nouvelle taille ne propose plus la largeur ou le
 * coloris retenus, ceux-ci sont effacés avec un message qui nomme ce qui a
 * changé. C'est la règle d'APP 12d, appliquée ici.
 */
export function recalculerTailles(
  groupes: GroupeTaille[],
  choix: ChoixParGroupe,
  dependances: Dependance[] = []
): RecalculTailles {
  let courant: ChoixParGroupe = { ...choix };
  const messages: string[] = [];

  for (const g of [...groupes].sort((a, b) => a.ordre - b.ordre)) {
    if (g.type !== "taille" || !g.mesure_groupe_id) continue;

    // Une taille posée à la main reste posée à la main.
    if (courant[g.id]?.taille_choisie_directement === true) continue;

    const mesure = courant[g.mesure_groupe_id]?.nombre ?? null;
    const determination = determinerTaille(g, mesure);
    const avant = valeurRetenue(g, courant)?.id ?? null;

    const apres = determination.etat === "trouvee"
      ? determination.propositions[0].taille
      : null;

    if ((apres?.id ?? null) === avant) continue;

    courant = { ...courant, [g.id]: { ...courant[g.id], valeur_id: apres?.id ?? null } };

    if (apres && mesure !== null && mesure !== undefined) {
      const unite = String(g.unite ?? "cm").trim() || "cm";
      messages.push(`${g.nom} : ${fr(Number(mesure))} ${unite} → ${apres.libelle}.`);
    } else if (!apres && avant) {
      messages.push(
        determination.etat === "hors_grille"
          ? `${g.nom} : ${determination.message}`
          : `${g.nom} : la taille a été effacée, faute de mesure.`
      );
    }
  }

  // La cascade fait le reste : une largeur ou un coloris qui n'existe plus
  // dans la nouvelle taille est effacé, et il le dit.
  const nettoye = nettoyerChoixInvalides(groupes, courant, dependances);
  return { choix: nettoye.choix, messages: [...messages, ...nettoye.messages] };
}

/** La taille retenue d'un groupe, quelle que soit la voie empruntée. */
export function tailleRetenue(
  groupe: GroupeTaille,
  choix: ChoixParGroupe
): Taille | null {
  return (valeurRetenue(groupe, choix) as Taille | null) ?? null;
}

/** « Tour de cou 38 cm → taille M » : ce que le client doit lire. */
export function libelleDeduction(
  groupe: GroupeTaille,
  mesureGroupe: { nom: string; unite?: string | null } | null,
  mesure: number | null | undefined,
  taille: Taille | null
): string | null {
  const m = nb(mesure);
  if (m === null || !taille || !mesureGroupe) return null;
  const unite = String(mesureGroupe.unite ?? "cm").trim() || "cm";
  return `${mesureGroupe.nom} ${fr(m)} ${unite} → taille ${taille.libelle}`;
}
