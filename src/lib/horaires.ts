/**
 * Les horaires d'accueil de la pension, réglés dans Réglages → Entreprise.
 *
 * ── POURQUOI UN RÉGLAGE ───────────────────────────────────────────────────
 *
 * Les heures étaient écrites en dur à sept endroits : deux encadrés d'e-mail,
 * trois avertissements du personnel, les créneaux proposés au client, et les
 * bornes de la journée du personnel. Changer l'heure d'ouverture demandait de
 * les retrouver toutes — et la première oubliée aurait dit autre chose que les
 * six autres, sans que rien ne le signale (décision de Sabrina, 29.09.2026).
 *
 * ── LA FORME D'UN RÉGLAGE ─────────────────────────────────────────────────
 *
 * Un ou plusieurs créneaux, séparés par « ; ». Un créneau est « HH:MM-HH:MM »,
 * ou une heure seule « HH:MM » quand il n'y a rien à choisir (l'arrivée d'une
 * journée d'essai est à 10:00, point).
 *
 *   « 07:35-10:00 »              une plage
 *   « 09:00-10:00 ; 17:00-18:00 » deux plages
 *   « 10:00 »                     une heure fixe
 *
 * ── UN RÉGLAGE ILLISIBLE NE FERME PAS LA PENSION ──────────────────────────
 *
 * Manquant, vide ou mal écrit : la valeur de départ s'applique — celle
 * d'avant ce lot. Un e-mail part toujours, et il porte alors les horaires
 * d'hier plutôt qu'un encadré vide. C'est la même règle que pour la signature
 * (APP 58) et le lien d'avis Google.
 */

export type Creneau = {
  debut: string;
  /** Égale `debut` pour une heure fixe. */
  fin: string;
};

export type Horaires = {
  journeeArrivee: string;
  journeeDepart: string;
  sejour: string;
  essaiArrivee: string;
  essaiDepart: string;
};

export const CLES_HORAIRES = {
  journeeArrivee: "horaires_journee_arrivee",
  journeeDepart: "horaires_journee_depart",
  sejour: "horaires_sejour",
  essaiArrivee: "horaires_essai_arrivee",
  essaiDepart: "horaires_essai_depart",
} as const;

/** Les horaires d'avant ce lot, au caractère près. */
export const HORAIRES_DEFAUT: Horaires = {
  journeeArrivee: "07:35-10:00",
  journeeDepart: "17:00-18:00",
  sejour: "09:00-10:00 ; 17:00-18:00",
  essaiArrivee: "10:00",
  essaiDepart: "17:00-18:00",
};

/** Les libellés de l'écran, dans l'ordre d'affichage. */
export const LIBELLES_HORAIRES: { cle: keyof Horaires; libelle: string }[] = [
  { cle: "journeeArrivee", libelle: "Garderie — arrivée" },
  { cle: "journeeDepart", libelle: "Garderie — départ" },
  { cle: "sejour", libelle: "Séjour — arrivée et départ" },
  { cle: "essaiArrivee", libelle: "Journée d'essai — arrivée" },
  { cle: "essaiDepart", libelle: "Journée d'essai — départ" },
];

const HEURE = /^([01]\d|2[0-3]):([0-5]\d)$/;

// ── La lecture ────────────────────────────────────────────────────────────

/**
 * Les créneaux d'un réglage, ou `null` s'il est illisible.
 *
 * `null` et non « liste vide » : une liste vide se confondrait avec un réglage
 * qui dit « aucun créneau », et l'appelant ne saurait pas s'il doit se replier
 * sur la valeur de départ.
 */
export function lireCreneaux(valeur: string | null | undefined): Creneau[] | null {
  const texte = String(valeur ?? "").trim();
  if (texte === "") return null;

  const morceaux = texte.split(";").map((m) => m.trim()).filter((m) => m !== "");
  if (morceaux.length === 0) return null;

  const creneaux: Creneau[] = [];
  for (const m of morceaux) {
    const bornes = m.split("-").map((b) => b.trim());
    if (bornes.length === 1) {
      if (!HEURE.test(bornes[0])) return null;
      creneaux.push({ debut: bornes[0], fin: bornes[0] });
      continue;
    }
    if (bornes.length !== 2) return null;
    const [debut, fin] = bornes;
    if (!HEURE.test(debut) || !HEURE.test(fin)) return null;
    // Début < fin, strictement : « 17:00-17:00 » s'écrit « 17:00 ».
    if (debut >= fin) return null;
    creneaux.push({ debut, fin });
  }
  return creneaux;
}

/** Le refus à afficher, ou `null`. Le vide est refusé : un horaire se dit. */
export function refusHoraire(valeur: string | null | undefined): string | null {
  const texte = String(valeur ?? "").trim();
  if (texte === "") return "Indiquez au moins un créneau.";
  if (lireCreneaux(texte) === null) {
    return "Écrivez des heures au format HH:MM, séparées par « - », "
      + "et plusieurs créneaux par « ; ». Le début doit précéder la fin.";
  }
  return null;
}

/**
 * Les horaires tels qu'ils vivent en base, avec repli sur les valeurs de
 * départ. Une clé absente OU illisible reprend la valeur d'hier : contrairement
 * à la signature, un horaire vide n'a pas de sens — on ne peut pas « effacer »
 * une heure d'ouverture, on la change.
 */
export function horairesDepuisReglages(valeurs: Map<string, string>): Horaires {
  const lire = (cle: string, defaut: string) => {
    const brut = valeurs.get(cle);
    if (brut === undefined) return defaut;
    return lireCreneaux(brut) === null ? defaut : String(brut).trim();
  };
  return {
    journeeArrivee: lire(CLES_HORAIRES.journeeArrivee, HORAIRES_DEFAUT.journeeArrivee),
    journeeDepart: lire(CLES_HORAIRES.journeeDepart, HORAIRES_DEFAUT.journeeDepart),
    sejour: lire(CLES_HORAIRES.sejour, HORAIRES_DEFAUT.sejour),
    essaiArrivee: lire(CLES_HORAIRES.essaiArrivee, HORAIRES_DEFAUT.essaiArrivee),
    essaiDepart: lire(CLES_HORAIRES.essaiDepart, HORAIRES_DEFAUT.essaiDepart),
  };
}

// ── Le formatage ──────────────────────────────────────────────────────────

/** « 07:35 » → « 7h35 » ; « 17:00 » → « 17h00 ». L'heure ne garde pas son zéro. */
export function heureLongue(hhmm: string): string {
  const [h, m] = hhmm.split(":");
  return `${Number(h)}h${m}`;
}

/** La forme abrégée : « 17:00 » → « 17h », « 07:35 » → « 7h35 ». */
export function heureCourte(hhmm: string): string {
  const [h, m] = hhmm.split(":");
  return m === "00" ? `${Number(h)}h` : `${Number(h)}h${m}`;
}

/**
 * « 9h00 – 10h00 ou 17h00 – 18h00 ». Le tiret est un tiret CADRATIN entouré
 * d'espaces : c'est celui des encadrés d'e-mail d'aujourd'hui, et le test
 * compare au caractère près.
 */
export function formatHoraire(valeur: string | null | undefined, defaut = ""): string {
  const creneaux = lireCreneaux(valeur) ?? lireCreneaux(defaut);
  if (creneaux === null) return "";
  return creneaux
    .map((c) => (c.debut === c.fin ? heureLongue(c.debut) : `${heureLongue(c.debut)} – ${heureLongue(c.fin)}`))
    .join(" ou ");
}

/** La première heure et la dernière d'un réglage — les deux bouts de la journée. */
export function bornes(valeur: string | null | undefined, defaut = ""): Creneau | null {
  const creneaux = lireCreneaux(valeur) ?? lireCreneaux(defaut);
  if (creneaux === null || creneaux.length === 0) return null;
  return { debut: creneaux[0].debut, fin: creneaux[creneaux.length - 1].fin };
}

// ── La règle ──────────────────────────────────────────────────────────────

/**
 * Cette heure tombe-t-elle dans l'un des créneaux ? Les bornes SONT dans la
 * plage : arriver à 10:00 pile quand l'accueil va de 7:35 à 10:00 n'est pas
 * hors plage.
 *
 * Un réglage illisible rend `true` : c'est une règle d'avertissement, pas une
 * interdiction, et un réglage abîmé ne doit pas faire pleuvoir des alertes sur
 * des horaires parfaitement normaux.
 */
export function heureDansPlage(
  heure: string | null | undefined,
  valeur: string | null | undefined,
): boolean {
  const h = String(heure ?? "").slice(0, 5);
  if (!HEURE.test(h)) return true;
  const creneaux = lireCreneaux(valeur);
  if (creneaux === null) return true;
  return creneaux.some((c) => h >= c.debut && h <= c.fin);
}

/**
 * Les créneaux proposés au client, de quart d'heure en quart d'heure, bornes
 * comprises. Un réglage d'une seule heure rend cette heure-là.
 *
 * ── L'ALIGNEMENT APRÈS LE PREMIER CRÉNEAU ─────────────────────────────────
 *
 * L'ouverture de la garderie est à 7h35, et la liste proposée aujourd'hui est
 * 07:35, puis 07:45, 08:00, 08:15… : le premier créneau est l'heure
 * d'ouverture, les suivants tombent sur le quart d'heure. Avancer bêtement de
 * quinze minutes aurait donné 07:50, 08:05, 08:20 — une liste que personne
 * n'a jamais vue, et des horaires d'arrivée bancals sur chaque bon d'accueil.
 */
export function creneauxProposes(
  valeur: string | null | undefined,
  defaut = "",
  pasMinutes = 15,
): string[] {
  const creneaux = lireCreneaux(valeur) ?? lireCreneaux(defaut);
  if (creneaux === null) return [];
  const res: string[] = [];
  for (const c of creneaux) {
    const debut = Number(c.debut.slice(0, 2)) * 60 + Number(c.debut.slice(3, 5));
    const fin = Number(c.fin.slice(0, 2)) * 60 + Number(c.fin.slice(3, 5));
    let minute = debut;
    while (minute <= fin) {
      const heure = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
      if (!res.includes(heure)) res.push(heure);
      // Après le premier, on retombe sur le pas : 07:35 → 07:45, puis 08:00.
      minute = minute === debut
        ? Math.floor(minute / pasMinutes) * pasMinutes + pasMinutes
        : minute + pasMinutes;
    }
  }
  return res;
}

/**
 * « 7h35–10h00 ou 17h00–18h00 » — tiret demi-cadratin, SANS espaces.
 *
 * C'est la forme des avertissements du personnel, où la place manque dans une
 * boîte de dialogue. Elle diffère de `formatHoraire` (« 7h35 – 10h00 »), qui
 * est celle des encadrés d'e-mail. Deux formes, parce que les deux existaient
 * avant ce lot et que les tests comparent au caractère près.
 */
export function formatHoraireTiret(valeur: string | null | undefined, defaut = ""): string {
  const creneaux = lireCreneaux(valeur) ?? lireCreneaux(defaut);
  if (creneaux === null) return "";
  return creneaux
    .map((c) => (c.debut === c.fin ? heureLongue(c.debut) : `${heureLongue(c.debut)}–${heureLongue(c.fin)}`))
    .join(" ou ");
}

/** « 17h–18h » : les deux bouts, en forme abrégée. Pour les mentions courtes. */
export function formatHoraireCourt(valeur: string | null | undefined, defaut = ""): string {
  const b = bornes(valeur, defaut);
  if (b === null) return "";
  return b.debut === b.fin ? heureCourte(b.debut) : `${heureCourte(b.debut)}–${heureCourte(b.fin)}`;
}

/**
 * « 9h–10h ou 17h–18h » : CHAQUE créneau en forme abrégée (APP 64).
 *
 * À distinguer de `formatHoraireCourt`, qui ne garde que les deux bouts de la
 * journée (« 9h–18h ») : le libellé du départ d'un séjour doit dire qu'on part
 * le matin OU le soir, pas « entre 9h et 18h ».
 */
export function formatCreneauxCourts(valeur: string | null | undefined, defaut = ""): string {
  const creneaux = lireCreneaux(valeur) ?? lireCreneaux(defaut);
  if (creneaux === null) return "";
  return creneaux
    .map((c) => (c.debut === c.fin ? heureCourte(c.debut) : `${heureCourte(c.debut)}–${heureCourte(c.fin)}`))
    .join(" ou ");
}

/**
 * Le n-ième créneau d'un réglage, réécrit comme un réglage à lui seul, ou "".
 *
 * L'ARRIVÉE d'un séjour ne se fait que le matin, quand le réglage « séjour »
 * porte les deux bouts de la journée (matin ET soir). Le tunnel a donc besoin
 * du premier créneau seul, sans que cela demande un sixième réglage : la
 * pension n'a pas deux horaires de séjour, elle en a un qui contient deux
 * moments.
 */
export function creneauTexte(valeur: string | null | undefined, index: number, defaut = ""): string {
  const creneaux = lireCreneaux(valeur) ?? lireCreneaux(defaut);
  if (creneaux === null || !creneaux[index]) return "";
  const c = creneaux[index];
  return c.debut === c.fin ? c.debut : `${c.debut}-${c.fin}`;
}
