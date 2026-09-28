/**
 * L'écran « Journal des gestes » — tout ce qui se décide sans la base.
 *
 * Le module de lecture (`journalGestes.ts`) interroge Postgres ; celui-ci dit
 * ce que les lignes DEVIENNENT à l'écran : dans quelle famille elles se
 * rangent, ce que les filtres de l'URL veulent dire, quels champs ne se
 * montrent jamais, et comment un « avant / après » se lit sans JSON.
 *
 * Aucune requête ici, donc tout est éprouvable sans base.
 */

// ── Les familles ───────────────────────────────────────────────────────────

/**
 * Le filtre « type » regroupe par ENTITÉ, pas par événement.
 *
 * Une patronne qui cherche « ce qui s'est passé sur les factures » ne pense pas
 * en `emission` / `envoi` / `pdf` : elle pense « les factures ». Les familles
 * sont donc des paquets d'entités, nommés comme elle les nomme.
 *
 * ── POURQUOI UNE FAMILLE « AUTRE » ────────────────────────────────────────
 *
 * `entite` est une colonne texte : la base n'impose aucune liste, et quatre
 * valeurs écrites en base aujourd'hui ne figurent PAS dans le type
 * `EntiteJournal` — `chiens` et `clients` au pluriel, `commande`,
 * `commande_en_ligne` (relevé le 28.09.2026). Une famille fourre-tout est donc
 * nécessaire, sinon ces lignes deviendraient invisibles au moindre filtre —
 * et c'est exactement le genre de trou qu'un journal ne doit pas avoir.
 */
export const FAMILLES = [
  {
    valeur: "factures",
    libelle: "Factures et avoirs",
    entites: ["facture", "avoir", "paiement"],
  },
  {
    valeur: "ventes",
    libelle: "Ventes et caisse",
    entites: ["vente"],
  },
  {
    valeur: "commandes",
    libelle: "Commandes en ligne",
    entites: ["commande", "commande_en_ligne"],
  },
  {
    valeur: "reservations",
    libelle: "Réservations",
    entites: ["reservation", "abonnement", "chien", "chiens", "client", "clients", "campagne"],
  },
  {
    valeur: "boutique",
    libelle: "Articles et boutique",
    entites: ["article", "alerte_stock", "promotion", "remise_membre"],
  },
  {
    valeur: "depenses",
    libelle: "Dépenses",
    entites: ["depense", "ecriture"],
  },
  {
    valeur: "reglages",
    libelle: "Réglages",
    entites: ["parametre", "parametres_tva", "decompte_tva", "entite_juridique"],
  },
  {
    valeur: "acces",
    libelle: "Accès refusés",
    entites: ["acces"],
  },
] as const;

export type Famille = (typeof FAMILLES)[number]["valeur"];

/** Les entités d'une famille, ou toutes si la valeur ne veut rien dire. */
export function entitesDeLaFamille(famille: string | null | undefined): string[] | null {
  const trouvee = FAMILLES.find((f) => f.valeur === famille);
  return trouvee ? [...trouvee.entites] : null;
}

/**
 * Les entités qu'AUCUNE famille ne réclame.
 *
 * Elles se rangent dans « Autre » : mieux vaut une ligne mal rangée qu'une
 * ligne perdue. Un test compare cette liste à ce que la base contient.
 */
export function entitesConnues(): string[] {
  return FAMILLES.flatMap((f) => [...f.entites]);
}

// ── Les filtres, lus dans l'URL ────────────────────────────────────────────

export const PAR_PAGE = 50;

export type FiltresJournal = {
  /** Page 1 = la plus récente. */
  page: number;
  /** Bornes INCLUSIVES, en ISO court (« 2026-09-01 »). */
  du: string | null;
  au: string | null;
  /** L'identifiant du compte auteur, ou null pour tout le monde. */
  personne: string | null;
  famille: Famille | null;
};

const FORME_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Une date qui EXISTE, pas seulement une qui en a la forme.
 *
 * `2026-13-45` passe l'expression régulière — quatre chiffres, deux, deux — et
 * partirait telle quelle dans un `gte('created_at', '2026-13-45T00:00:00')`,
 * que Postgres refuserait par une erreur. Le 30 février aussi.
 *
 * Le repassage par `toISOString` est ce qui tranche : JavaScript reporte un
 * jour hors bornes sur le mois suivant, donc une date inventée ne se réécrit
 * jamais à l'identique.
 */
function dateValide(v: string): boolean {
  if (!FORME_DATE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}
const EST_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Les filtres vivent dans l'adresse : un lien se partage, le retour arrière
 * refait le chemin, et un rechargement ne perd rien.
 *
 * Rien n'est cru sur parole. Une date mal formée, un identifiant qui n'est pas
 * un UUID, une famille inventée : tout retombe sur « aucun filtre ». C'est une
 * lecture seule, mais une chaîne libre qui partirait dans une requête serait
 * une porte ouverte pour rien.
 */
export function filtresDepuisParams(
  params: Record<string, string | string[] | undefined>,
): FiltresJournal {
  const lire = (cle: string): string => {
    const v = params[cle];
    return (Array.isArray(v) ? v[0] : v ?? "").trim();
  };

  const page = Math.max(1, Math.trunc(Number(lire("page"))) || 1);
  const du = dateValide(lire("du")) ? lire("du") : null;
  const au = dateValide(lire("au")) ? lire("au") : null;
  const personne = EST_UUID.test(lire("personne")) ? lire("personne") : null;
  const famille = FAMILLES.find((f) => f.valeur === lire("type"))?.valeur ?? null;

  // Des bornes à l'envers ne rendraient RIEN, sans dire pourquoi : on les
  // remet à l'endroit plutôt que d'afficher une page vide inexplicable.
  if (du && au && du > au) return { page, du: au, au: du, personne, famille };
  return { page, du, au, personne, famille };
}

/** L'adresse d'une page ou d'un filtre, en gardant le reste. */
export function versParamsJournal(f: Partial<FiltresJournal>): URLSearchParams {
  const p = new URLSearchParams();
  if (f.du) p.set("du", f.du);
  if (f.au) p.set("au", f.au);
  if (f.personne) p.set("personne", f.personne);
  if (f.famille) p.set("type", f.famille);
  // La page 1 ne s'écrit pas : l'adresse d'arrivée doit rester courte.
  if (f.page && f.page > 1) p.set("page", String(f.page));
  return p;
}

export function nombreDePages(total: number): number {
  return Math.max(1, Math.ceil(total / PAR_PAGE));
}

// ── Les champs qu'on ne montre jamais ──────────────────────────────────────

/**
 * Vérifié en base le 28.09.2026 : sur les 119 clés distinctes présentes dans
 * `avant` et `apres`, AUCUNE n'est un secret. Le masque est donc posé par
 * PRINCIPE, pas en réaction.
 *
 * C'est le bon moment pour le poser : le jour où un mot de passe ou un jeton
 * entrera dans une trace — par un geste qu'on n'a pas encore écrit — l'écran ne
 * l'affichera pas, et personne n'aura à y penser ce jour-là.
 *
 * `sha256` n'y est PAS : c'est l'empreinte d'un PDF de facture, elle sert à
 * prouver qu'un document n'a pas bougé. La cacher retirerait la seule chose qui
 * rend la trace vérifiable.
 */
const MOTS_SENSIBLES =
  /(mot_de_passe|motdepasse|password|passwd|pwd|token|jeton|secret|api[_-]?key|apikey|cle_api|access_key|private|iban|bic|swift|cvv|cvc|numero_carte|card_number)/i;

export function champSensible(champ: string): boolean {
  return MOTS_SENSIBLES.test(champ);
}

export const MASQUE = "—— masqué ——";

// ── « Avant / après », en français ─────────────────────────────────────────

export type Difference = {
  champ: string;
  /** Déjà rendues lisibles : jamais du JSON brut à l'écran. */
  avant: string | null;
  apres: string | null;
  sensible: boolean;
};

/**
 * Une valeur JSON, écrite comme on la lit.
 *
 * Un objet ou une liste ne se déplie PAS en profondeur : on en dit la taille.
 * Déplier trois niveaux rendrait la ligne illisible, et ce n'est pas ce qu'on
 * vient chercher — on vient voir ce qui a changé, pas relire la donnée.
 */
export function valeurLisible(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v ? "oui" : "non";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return v === "" ? null : v;
  if (Array.isArray(v)) {
    if (v.length === 0) return "(vide)";
    // Une liste de valeurs simples se lit telle quelle ; une liste d'objets se
    // compte, parce que l'étaler noierait la ligne.
    const simples = v.every((x) => typeof x !== "object" || x === null);
    return simples ? v.map((x) => valeurLisible(x) ?? "—").join(", ") : `${v.length} élément(s)`;
  }
  if (typeof v === "object") {
    const cles = Object.keys(v as Record<string, unknown>);
    return cles.length === 0 ? "(vide)" : `${cles.length} champ(s)`;
  }
  return String(v);
}

/**
 * Ce qui a changé, champ par champ.
 *
 * L'UNION des clés des deux côtés, pas seulement celles d'« après » : un champ
 * qui DISPARAÎT est un changement, et c'est même souvent celui qu'on cherche.
 *
 * Les champs identiques des deux côtés sont écartés : une liste de vingt lignes
 * dont deux ont bougé cache les deux qui comptent.
 */
export function differences(
  avant: Record<string, unknown> | null,
  apres: Record<string, unknown> | null,
): Difference[] {
  const gauche = avant ?? {};
  const droite = apres ?? {};
  const champs = [...new Set([...Object.keys(gauche), ...Object.keys(droite)])].sort();

  const lignes: Difference[] = [];
  for (const champ of champs) {
    const sensible = champSensible(champ);
    const a = sensible ? MASQUE : valeurLisible(gauche[champ]);
    const b = sensible ? MASQUE : valeurLisible(droite[champ]);
    // Rien n'a bougé : la ligne n'apprendrait rien.
    if (!sensible && a === b) continue;
    lignes.push({ champ, avant: a, apres: b, sensible });
  }
  return lignes;
}

// ── Ce que la ligne concerne ───────────────────────────────────────────────

/**
 * Le nom de l'objet touché, tiré de la TRACE quand l'objet n'existe plus.
 *
 * C'est le cas d'un article supprimé (APP 32) : sa fiche a disparu, mais la
 * trace porte sa référence et son nom. Sans ce repli, le journal dirait
 * « Article supprimé » sans dire lequel — c'est-à-dire rien.
 *
 * L'ordre des clés essayées va du plus parlant au plus technique.
 */
const CLES_NOM = ["reference", "numero", "nom", "libelle", "titre", "email"] as const;

export function nomDepuisTrace(
  avant: Record<string, unknown> | null,
  apres: Record<string, unknown> | null,
): string | null {
  const morceaux: string[] = [];
  for (const source of [avant, apres]) {
    if (!source) continue;
    for (const cle of CLES_NOM) {
      const v = source[cle];
      if (typeof v === "string" && v.trim() !== "" && !morceaux.includes(v.trim())) {
        morceaux.push(v.trim());
      }
    }
    if (morceaux.length > 0) break;
  }
  return morceaux.length > 0 ? morceaux.slice(0, 2).join(" ") : null;
}
