/**
 * L'identité juridique de l'entreprise, à une date.
 *
 * Raison sociale, forme, IDE, numéro de TVA et IBAN ne sont pas des réglages :
 * ce sont des faits datés. Une facture de novembre porte l'identité de
 * novembre. Un avoir émis en février porte celle de FÉVRIER, même s'il corrige
 * cette facture de novembre — et il mentionne la facture d'origine avec son
 * numéro. C'est le cas normal d'un avoir après un changement d'entité, pas une
 * anomalie à refuser.
 *
 * La sélection reprend celle de `parametres_tva` : la ligne en vigueur est la
 * plus récente dont la date de début est déjà passée. Deux mécanismes
 * différents pour la même idée finiraient par se contredire.
 *
 * Fonction pure : ni base, ni requête.
 */

export type FormeJuridique = "raison_individuelle" | "sarl";

export type EntiteJuridique = {
  id?: string;
  dateDebut: string;
  dateFin: string | null;
  forme: FormeJuridique;
  raisonSociale: string;
  adresse: {
    rue: string | null;
    numero: string | null;
    npa: string | null;
    ville: string | null;
    pays: string;
  };
  ide: string | null;
  numeroTva: string | null;
  iban: string | null;
  qrIban: string | null;
  email: string | null;
  telephone: string | null;
};

/**
 * Ce qu'on rend quand AUCUNE entité n'est enregistrée.
 *
 * Volontairement dépourvue de tout : pas de raison sociale inventée, pas
 * d'IDE approché. Un document produit sur cette base montrera qu'il manque
 * quelque chose, plutôt que d'afficher une identité plausible et fausse.
 */
export const ENTITE_VIDE: EntiteJuridique = {
  dateDebut: "1970-01-01",
  dateFin: null,
  forme: "sarl",
  raisonSociale: "",
  adresse: { rue: null, numero: null, npa: null, ville: null, pays: "CH" },
  ide: null,
  numeroTva: null,
  iban: null,
  qrIban: null,
  email: null,
  telephone: null,
};

export const FORMES: { valeur: FormeJuridique; libelle: string; aide: string }[] = [
  {
    valeur: "sarl",
    libelle: "Société à responsabilité limitée",
    aide: "La raison sociale est libre. Le capital est un capital social.",
  },
  {
    valeur: "raison_individuelle",
    libelle: "Raison individuelle",
    aide:
      "La raison sociale doit contenir le nom de famille du titulaire. Le capital " +
      "devient capital propre, et les retraits passent par le compte privé 2850.",
  },
];

export function formeJuridique(valeur: string | null | undefined): FormeJuridique {
  return valeur === "raison_individuelle" ? "raison_individuelle" : "sarl";
}

export function libelleForme(valeur: string | null | undefined): string {
  return FORMES.find((f) => f.valeur === formeJuridique(valeur))!.libelle;
}

// ── La sélection à une date ───────────────────────────────────────────────

/**
 * L'entité EN VIGUEUR à une date.
 *
 * Même règle que le régime de TVA : la plus récente dont la date de début est
 * déjà passée. La date de fin, quand elle existe, ferme la plage à la veille —
 * une entité terminée ne s'applique plus, même faute de successeur.
 */
export function entiteEnVigueur(
  entites: readonly EntiteJuridique[],
  date: string
): EntiteJuridique | null {
  const jour = date.slice(0, 10);
  const candidates = entites
    .filter((e) => e.dateDebut <= jour && (e.dateFin === null || jour < e.dateFin))
    .sort((a, b) => (a.dateDebut < b.dateDebut ? 1 : -1));
  return candidates[0] ?? null;
}

/**
 * Deux entités se chevauchent-elles ?
 *
 * La base l'interdit déjà par une contrainte d'exclusion. Cette fonction dit la
 * même chose en TypeScript, pour que le test le montre sans ouvrir de session.
 */
export function chevauchements(
  entites: readonly EntiteJuridique[]
): { a: string; b: string }[] {
  const trouves: { a: string; b: string }[] = [];
  const triees = [...entites].sort((x, y) => (x.dateDebut < y.dateDebut ? -1 : 1));
  for (let i = 0; i < triees.length - 1; i += 1) {
    const a = triees[i];
    const b = triees[i + 1];
    if (a.dateFin === null || a.dateFin > b.dateDebut) {
      trouves.push({ a: a.dateDebut, b: b.dateDebut });
    }
  }
  return trouves;
}

// ── Le garde-fou du changement ────────────────────────────────────────────

/**
 * Le message, mot pour mot. Il ne se paraphrase pas : c'est une décision de
 * Sabrina, écrite dans les termes qu'elle a choisis.
 */
export const MESSAGE_DEBUT_EXERCICE =
  "Le changement d'entité doit coïncider avec le début d'un exercice. Choisis le 1er janvier.";

export const POURQUOI_DEBUT_EXERCICE =
  "Un changement d'entité en cours d'exercice oblige à deux clôtures partielles et " +
  "à un bilan intermédiaire. C'est possible, mais c'est un chantier comptable à " +
  "part — pas un simple réglage.";

/**
 * Une date de changement est-elle recevable ?
 *
 * Elle doit tomber le premier jour d'un exercice, et dans le futur : une
 * identité rétroactive réécrirait des pièces déjà émises.
 */
export function refusDateChangement({
  date,
  aujourdhui,
  dateDebutActuelle,
}: {
  date: string;
  aujourdhui: string;
  dateDebutActuelle?: string | null;
}): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return MESSAGE_DEBUT_EXERCICE;
  // Le 1er janvier : le seul premier jour d'exercice de cette maison.
  if (!/^\d{4}-01-01$/.test(date)) return MESSAGE_DEBUT_EXERCICE;
  if (date <= aujourdhui.slice(0, 10)) {
    return (
      "Le changement doit être préparé à l'avance : choisis un 1er janvier à venir. " +
      "Une identité rétroactive réécrirait des pièces déjà émises."
    );
  }
  if (dateDebutActuelle && date <= dateDebutActuelle) {
    return "La nouvelle entité doit commencer après celle qui est en vigueur.";
  }
  return null;
}

/** La veille d'une date : la fin de l'entité précédente. */
export function veille(date: string): string {
  const d = new Date(`${date.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// ── La raison sociale d'une raison individuelle ───────────────────────────

export const MOTIF_NOM_FAMILLE =
  "En raison individuelle, la raison sociale doit contenir le nom de famille du " +
  "titulaire : c'est une exigence du droit des raisons de commerce (art. 945 CO), " +
  "pas une règle de cette application.";

/** Comparaison insensible aux accents, à la casse et aux traits d'union. */
function normaliser(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function refusRaisonSociale({
  forme,
  raisonSociale,
  nomFamille,
}: {
  forme: string | null | undefined;
  raisonSociale: string;
  nomFamille: string | null | undefined;
}): string | null {
  const nom = String(raisonSociale ?? "").trim();
  if (nom === "") return "La raison sociale est obligatoire.";
  if (formeJuridique(forme) !== "raison_individuelle") return null;

  const famille = String(nomFamille ?? "").trim();
  if (famille === "") {
    return (
      "Le nom de famille du titulaire est introuvable : complétez son profil avant " +
      "de passer en raison individuelle."
    );
  }
  const mots = normaliser(nom).split(" ").filter(Boolean);
  return mots.includes(normaliser(famille)) ? null : MOTIF_NOM_FAMILLE;
}

// ── L'IDE ─────────────────────────────────────────────────────────────────

export const FORMAT_IDE = "CHE-###.###.###";

export function ideValide(brut: string | null | undefined): boolean {
  return /^CHE-\d{3}\.\d{3}\.\d{3}$/.test(String(brut ?? "").trim());
}

/**
 * Met un IDE saisi à la volée dans sa forme légale, s'il en a les chiffres.
 * Sinon rend null : un numéro approché sur une facture est pire qu'un numéro
 * absent, parce qu'il a l'air juste.
 */
export function normaliserIde(brut: string | null | undefined): string | null {
  const texte = String(brut ?? "").trim();
  if (texte === "") return null;
  if (ideValide(texte)) return texte;
  const chiffres = texte.replace(/\D/g, "");
  if (chiffres.length !== 9) return null;
  return `CHE-${chiffres.slice(0, 3)}.${chiffres.slice(3, 6)}.${chiffres.slice(6, 9)}`;
}

// ── Ce que la forme change dans l'application ─────────────────────────────

export const COMPTE_PRIVE = "2850";

export const AVERTISSEMENT_SALAIRE_PROPRIETAIRE =
  "En raison individuelle, la propriétaire ne se verse pas de salaire : ses retraits " +
  "passent par le compte privé 2850.";

/**
 * L'étiquette du capital.
 *
 * Une Sàrl a un capital SOCIAL, souscrit et libéré. Une raison individuelle a
 * un capital PROPRE, qui est simplement ce qui reste au titulaire. Ce n'est pas
 * une nuance de vocabulaire : les deux ne se lisent pas de la même façon dans
 * un bilan.
 */
export function libelleCompte(
  numero: string,
  libelle: string,
  forme: string | null | undefined
): string {
  if (formeJuridique(forme) !== "raison_individuelle") return libelle;
  if (numero === "2800") return "Capital propre";
  return libelle;
}

/** Le même renommage, appliqué à un plan comptable entier. */
export function renommerComptes<T extends { numero: string; libelle: string }>(
  comptes: readonly T[],
  forme: string | null | undefined
): T[] {
  return comptes.map((c) => ({ ...c, libelle: libelleCompte(c.numero, c.libelle, forme) }));
}

// ── Ce qu'une pièce imprime ───────────────────────────────────────────────

/** Les lignes d'adresse, dans l'ordre où on les écrit sur une enveloppe. */
export function lignesAdresse(entite: EntiteJuridique): string[] {
  return [
    [entite.adresse.rue, entite.adresse.numero].filter(Boolean).join(" ").trim(),
    [entite.adresse.npa, entite.adresse.ville].filter(Boolean).join(" ").trim(),
  ].filter((l) => l !== "");
}

/**
 * Ce qui manque encore pour qu'une pièce soit complète.
 *
 * Rien n'est deviné : l'écran des Réglages montre cette liste plutôt que de
 * remplir les trous avec des valeurs plausibles.
 */
export function manquantsEntite(entite: EntiteJuridique): string[] {
  const manque: string[] = [];
  if (!entite.raisonSociale.trim()) manque.push("la raison sociale");
  if (lignesAdresse(entite).length === 0) manque.push("l'adresse");
  if (!entite.ide) manque.push(`l'IDE (${FORMAT_IDE})`);
  if (!entite.iban) manque.push("l'IBAN");
  if (!entite.email) manque.push("l'adresse e-mail");
  return manque;
}

/**
 * Le compte à créditer sur un bulletin QR.
 *
 * Le QR-IBAN quand il existe — lui seul accepte une référence QR ; l'IBAN
 * ordinaire sinon.
 */
export function ibanDeVersement(entite: EntiteJuridique): string {
  return (entite.qrIban ?? entite.iban ?? "").trim();
}
