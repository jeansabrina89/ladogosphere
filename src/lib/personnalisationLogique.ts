/**
 * Règles pures des articles personnalisables : prix, délai, choix obligatoires
 * et figement de la commande. Aucune dépendance à la base — c'est ici que
 * vivent les décisions, et c'est ce fichier que les tests couvrent.
 *
 * TVA : pas calculée. Le taux est porté par l'article, il servira en APP 13.
 */

export type TypeGroupe = "liste" | "couleur" | "texte" | "booleen";

export const TYPES_GROUPE: { valeur: TypeGroupe; libelle: string; aide: string }[] = [
  { valeur: "liste",   libelle: "Liste",   aide: "Un choix parmi plusieurs, en boutons." },
  { valeur: "couleur", libelle: "Couleur", aide: "Une grille de vignettes photo ou de pastilles." },
  { valeur: "texte",   libelle: "Texte",   aide: "Un texte à graver ou à broder." },
  { valeur: "booleen", libelle: "Oui / non", aide: "Un interrupteur, par exemple « Avec puce NFC »." },
];

export function libelleTypeGroupe(type: string | null | undefined): string {
  return TYPES_GROUPE.find((t) => t.valeur === type)?.libelle ?? "—";
}

export type OptionValeur = {
  id: string;
  libelle: string;
  image_path: string | null;
  code_couleur: string | null;
  supplement_prix: number | string;
  supplement_delai_jours: number | string;
  composant_article_id: string | null;
  composant_quantite: number | string | null;
  actif: boolean;
  ordre: number;
  defaut: boolean;
};

export type OptionGroupe = {
  id: string;
  nom: string;
  type: TypeGroupe;
  obligatoire: boolean;
  ordre: number;
  aide: string | null;
  max_caracteres: number | null;
  /** Groupe parent : ce groupe ne s'active qu'une fois celui-là choisi. */
  depend_de_groupe_id?: string | null;
  valeurs: OptionValeur[];
};

/** Ce que la personne a choisi, groupe par groupe. */
export type Choix = {
  valeur_id?: string | null;
  texte?: string | null;
  booleen?: boolean;
};

export type ChoixParGroupe = Record<string, Choix>;

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Les valeurs proposées : une valeur désactivée reste en base, pas à l'écran. */
export function valeursActives(groupe: OptionGroupe): OptionValeur[] {
  return [...(groupe.valeurs ?? [])]
    .filter((v) => v.actif)
    .sort((a, b) => a.ordre - b.ordre || a.libelle.localeCompare(b.libelle, "fr"));
}

/** La valeur retenue d'un groupe, ou null. */
export function valeurRetenue(groupe: OptionGroupe, choix: ChoixParGroupe): OptionValeur | null {
  const c = choix[groupe.id];
  if (!c) return null;

  if (groupe.type === "booleen") {
    return c.booleen ? valeursActives(groupe)[0] ?? null : null;
  }
  if (!c.valeur_id) return null;
  return valeursActives(groupe).find((v) => v.id === c.valeur_id) ?? null;
}

/** Choix de départ : les valeurs marquées par défaut, et rien d'autre. */
export function choixParDefaut(groupes: OptionGroupe[]): ChoixParGroupe {
  const choix: ChoixParGroupe = {};
  for (const g of groupes) {
    if (g.type === "booleen") {
      choix[g.id] = { booleen: valeursActives(g).some((v) => v.defaut) };
      continue;
    }
    if (g.type === "texte") {
      choix[g.id] = { texte: "" };
      continue;
    }
    const defaut = valeursActives(g).find((v) => v.defaut);
    if (defaut) choix[g.id] = { valeur_id: defaut.id };
  }
  return choix;
}

// ── Prix et délai ───────────────────────────────────────────────────────────

export type Detail = { groupe: string; libelle: string; supplement: number };

/**
 * Détail du prix : le prix de base, puis un supplément par choix retenu.
 * C'est ce détail qui s'affiche — un total sans explication ne se vérifie pas.
 */
export function detailPrix(groupes: OptionGroupe[], choix: ChoixParGroupe): Detail[] {
  const details: Detail[] = [];
  for (const g of [...groupes].sort((a, b) => a.ordre - b.ordre)) {
    const v = valeurRetenue(g, choix);
    if (!v) continue;
    const supplement = r2(Number(v.supplement_prix ?? 0));
    if (supplement === 0) continue;
    details.push({ groupe: g.nom, libelle: v.libelle, supplement });
  }
  return details;
}

export function prixTotal(
  prixBase: number | string | null | undefined,
  groupes: OptionGroupe[],
  choix: ChoixParGroupe
): number {
  const base = r2(Number(prixBase ?? 0));
  return r2(detailPrix(groupes, choix).reduce((s, d) => s + d.supplement, base));
}

/** Délai annoncé : celui de l'article, allongé par les choix qui le demandent. */
export function delaiTotal(
  delaiBase: number | string | null | undefined,
  groupes: OptionGroupe[],
  choix: ChoixParGroupe
): number {
  let jours = Math.max(Math.round(Number(delaiBase ?? 0)), 0);
  for (const g of groupes) {
    const v = valeurRetenue(g, choix);
    if (!v) continue;
    jours += Math.max(Math.round(Number(v.supplement_delai_jours ?? 0)), 0);
  }
  return jours;
}

export function libelleDelai(jours: number): string {
  if (jours <= 0) return "Disponible tout de suite";
  if (jours === 1) return "Environ 1 jour ouvrable";
  return `Environ ${jours} jours ouvrables`;
}

/**
 * Date promise : le délai est compté en jours ouvrables, samedi et dimanche
 * exclus. Les jours fériés ne sont pas déduits — ils le seront le jour où la
 * fabrication sera planifiée.
 */
export function datePromise(departISO: string, joursOuvrables: number): string {
  const d = new Date(`${departISO.slice(0, 10)}T12:00:00`);
  let restants = Math.max(Math.round(joursOuvrables), 0);
  while (restants > 0) {
    d.setDate(d.getDate() + 1);
    const jour = d.getDay();
    if (jour !== 0 && jour !== 6) restants -= 1;
  }
  return d.toISOString().slice(0, 10);
}

// ── Validation ──────────────────────────────────────────────────────────────

/**
 * Les groupes obligatoires laissés sans réponse. Un « oui / non » est toujours
 * répondu — même par non — il n'y manque donc jamais rien.
 */
export function groupesManquants(groupes: OptionGroupe[], choix: ChoixParGroupe): string[] {
  const manquants: string[] = [];
  for (const g of [...groupes].sort((a, b) => a.ordre - b.ordre)) {
    if (!g.obligatoire) continue;
    if (g.type === "booleen") continue;

    if (g.type === "texte") {
      if (!String(choix[g.id]?.texte ?? "").trim()) manquants.push(g.nom);
      continue;
    }
    if (!valeurRetenue(g, choix)) manquants.push(g.nom);
  }
  return manquants;
}

export function messageManquants(manquants: string[]): string | null {
  if (manquants.length === 0) return null;
  if (manquants.length === 1) return `Il reste à choisir : ${manquants[0]}.`;
  return `Il reste à choisir : ${manquants.join(", ")}.`;
}

/** Refus de la configuration, ou null si elle peut partir en commande. */
export function refusConfiguration(groupes: OptionGroupe[], choix: ChoixParGroupe): string | null {
  const manquants = groupesManquants(groupes, choix);
  if (manquants.length > 0) return messageManquants(manquants);

  for (const g of groupes) {
    if (g.type !== "texte") continue;
    const texte = String(choix[g.id]?.texte ?? "");
    const max = g.max_caracteres ?? 0;
    if (max > 0 && texte.length > max) {
      return `« ${g.nom} » dépasse ${max} caractères.`;
    }
  }
  return null;
}

/**
 * Texte borné à sa longueur maximale. C'est du texte, pas du HTML : il n'est
 * ni nettoyé ni interprété, seulement coupé — React l'échappe à l'affichage.
 */
export function bornerTexte(texte: string | null | undefined, max: number | null | undefined): string {
  const t = String(texte ?? "");
  const limite = Number(max ?? 0);
  if (!Number.isFinite(limite) || limite <= 0) return t;
  return t.length <= limite ? t : t.slice(0, limite);
}

export function caracteresRestants(texte: string, max: number | null | undefined): number | null {
  const limite = Number(max ?? 0);
  if (!Number.isFinite(limite) || limite <= 0) return null;
  return limite - String(texte ?? "").length;
}

// ── Figement ────────────────────────────────────────────────────────────────

export type ChoixFige = {
  groupe_nom: string;
  valeur_libelle: string;
  valeur_texte: string | null;
  code_couleur: string | null;
  supplement_prix: number;
  ordre: number;
  composant_article_id: string | null;
  composant_quantite: number | null;
};

/**
 * Les choix, copiés tels qu'ils sont AUJOURD'HUI : libellés, couleurs,
 * suppléments et fourniture consommée. Modifier le catalogue d'options plus
 * tard ne changera ni le récapitulatif de cette commande, ni son prix, ni ce
 * qu'elle décomptera à la fabrication.
 */
export function figerChoix(groupes: OptionGroupe[], choix: ChoixParGroupe): ChoixFige[] {
  const figes: ChoixFige[] = [];
  let ordre = 0;

  for (const g of [...groupes].sort((a, b) => a.ordre - b.ordre)) {
    ordre += 1;

    if (g.type === "texte") {
      const texte = bornerTexte(choix[g.id]?.texte, g.max_caracteres).trim();
      if (!texte) continue;
      figes.push({
        groupe_nom: g.nom,
        valeur_libelle: texte,
        valeur_texte: texte,
        code_couleur: null,
        supplement_prix: 0,
        ordre,
        composant_article_id: null,
        composant_quantite: null,
      });
      continue;
    }

    const v = valeurRetenue(g, choix);
    if (!v) continue;

    figes.push({
      groupe_nom: g.nom,
      valeur_libelle: g.type === "booleen" ? v.libelle || "Oui" : v.libelle,
      valeur_texte: null,
      code_couleur: v.code_couleur,
      supplement_prix: r2(Number(v.supplement_prix ?? 0)),
      ordre,
      composant_article_id: v.composant_article_id,
      composant_quantite:
        v.composant_article_id && Number(v.composant_quantite ?? 0) > 0
          ? Number(v.composant_quantite)
          : null,
    });
  }

  return figes;
}

/** Fournitures à décompter au passage en fabrication, regroupées par article. */
export function composantsAConsommer(
  choix: { composant_article_id: string | null; composant_quantite: number | string | null }[]
): { article_id: string; quantite: number }[] {
  const parArticle = new Map<string, number>();
  for (const c of choix) {
    const q = Number(c.composant_quantite ?? 0);
    if (!c.composant_article_id || !Number.isFinite(q) || q <= 0) continue;
    parArticle.set(c.composant_article_id, (parArticle.get(c.composant_article_id) ?? 0) + q);
  }
  return [...parArticle].map(([article_id, quantite]) => ({
    article_id,
    quantite: Math.round(quantite * 1000) / 1000,
  }));
}

// ── Suivi de fabrication ────────────────────────────────────────────────────

export type StatutCommande = "a_faire" | "en_cours" | "prete" | "remise" | "annulee";

export const STATUTS_COMMANDE: {
  valeur: StatutCommande;
  libelle: string;
  titre: string;
  couleur: string;
  fond: string;
}[] = [
  { valeur: "a_faire",  libelle: "À faire",  titre: "À faire",  couleur: "#6E5410", fond: "#F4EAC9" },
  { valeur: "en_cours", libelle: "En cours", titre: "En cours", couleur: "#2A3B6B", fond: "#E4E7F1" },
  { valeur: "prete",    libelle: "Prête",    titre: "Prêtes",   couleur: "#1F6E5B", fond: "#DBEFEA" },
  { valeur: "remise",   libelle: "Remise",   titre: "Remises",  couleur: "rgba(27,43,94,0.6)", fond: "#EDE8DF" },
  { valeur: "annulee",  libelle: "Annulée",  titre: "Annulées", couleur: "#A8453A", fond: "#FBE2DE" },
];

export function libelleStatutCommande(statut: string | null | undefined): string {
  return STATUTS_COMMANDE.find((s) => s.valeur === statut)?.libelle ?? "—";
}

/** Le statut qui suit, quand il y en a un — le bouton « une seule touche ». */
export function statutSuivant(statut: string): StatutCommande | null {
  if (statut === "a_faire") return "en_cours";
  if (statut === "en_cours") return "prete";
  if (statut === "prete") return "remise";
  return null;
}

/** En retard : promise pour hier ou avant, et pas encore remise. */
export function estEnRetard(
  datePromise: string | null | undefined,
  statut: string,
  aujourdhuiISO: string
): boolean {
  if (!datePromise) return false;
  if (statut === "remise" || statut === "annulee") return false;
  return datePromise.slice(0, 10) < aujourdhuiISO.slice(0, 10);
}

// ── Saisie en série des coloris ─────────────────────────────────────────────

/**
 * Libellé tiré d'un nom de fichier : « bleu-nuit.jpg » → « Bleu nuit ».
 * Sabrina dépose vingt photos d'un coup ; elle corrigera ensuite les rares
 * noms qui ne tombent pas juste.
 */
export function libelleDepuisNomFichier(nom: string): string {
  const sansExtension = String(nom ?? "").replace(/\.[^.]+$/, "");
  const mots = sansExtension
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!mots) return "Sans nom";
  return mots.charAt(0).toUpperCase() + mots.slice(1);
}

/** Un hexadécimal utilisable, ou null. Le « # » est facultatif à la saisie. */
export function normaliserCouleur(code: string | null | undefined): string | null {
  const brut = String(code ?? "").trim();
  if (!brut) return null;
  const avec = brut.startsWith("#") ? brut : `#${brut}`;
  return /^#[0-9a-fA-F]{6}$/.test(avec) ? avec.toLowerCase() : null;
}

// ── Dépendances entre options ───────────────────────────────────────────────

/**
 * Une valeur conditionnée par une autre. Une valeur SANS aucune ligne est
 * toujours disponible ; avec des lignes, elle exige qu'AU MOINS UNE de ses
 * valeurs requises soit choisie — un OU, pas un ET : un coloris peut exister
 * en 19 et en 25 mm.
 */
export type Dependance = { valeur_id: string; valeur_requise_id: string };

/** Toutes les valeurs de tous les groupes, par identifiant. */
export function indexerValeurs(groupes: OptionGroupe[]): Map<string, OptionValeur> {
  const index = new Map<string, OptionValeur>();
  for (const g of groupes) for (const v of g.valeurs ?? []) index.set(v.id, v);
  return index;
}

/** Les identifiants des valeurs actuellement retenues, tous groupes confondus. */
export function valeursChoisies(groupes: OptionGroupe[], choix: ChoixParGroupe): Set<string> {
  const ids = new Set<string>();
  for (const g of groupes) {
    const v = valeurRetenue(g, choix);
    if (v) ids.add(v.id);
  }
  return ids;
}

/** « 19 mm », « 19 et 22 mm », « 19, 22 et 25 mm ». */
export function enumererFr(libelles: string[]): string {
  if (libelles.length === 0) return "";
  if (libelles.length === 1) return libelles[0];
  return `${libelles.slice(0, -1).join(", ")} et ${libelles[libelles.length - 1]}`;
}

export type EtatValeur = {
  valeur: OptionValeur;
  disponible: boolean;
  /**
   * Pourquoi elle ne l'est pas, en toutes lettres. C'est un texte lu en
   * permanence, jamais une bulle au survol : sur un téléphone il n'y a pas
   * de survol.
   */
  raison: string | null;
  /** Ce qu'il faudrait choisir pour la rendre disponible. */
  requises: OptionValeur[];
};

export type EtatGroupe = {
  groupe: OptionGroupe;
  /** Le groupe parent, quand il y en a un. */
  parent: OptionGroupe | null;
  /** Un groupe conditionné reste VISIBLE ; il n'est actif qu'une fois son parent choisi. */
  actif: boolean;
  raisonInactif: string | null;
  valeurs: EtatValeur[];
};

/**
 * L'état de chaque groupe et de chaque valeur, pour les choix courants.
 *
 * Rien n'est masqué : un groupe pas encore ouvert reste visible et inactif,
 * une valeur indisponible reste affichée avec sa raison. Le client doit voir
 * dès l'abord tout ce qu'il aura à décider, et apprendre qu'un coloris existe
 * dans une autre largeur plutôt que de renoncer.
 */
export function etatDesGroupes(
  groupes: OptionGroupe[],
  choix: ChoixParGroupe,
  dependances: Dependance[] = []
): EtatGroupe[] {
  const ordonnes = [...groupes].sort((a, b) => a.ordre - b.ordre);
  const parId = new Map(ordonnes.map((g) => [g.id, g]));
  const valeurs = indexerValeurs(ordonnes);
  const choisies = valeursChoisies(ordonnes, choix);

  const requisesDe = new Map<string, string[]>();
  for (const d of dependances) {
    const liste = requisesDe.get(d.valeur_id) ?? [];
    liste.push(d.valeur_requise_id);
    requisesDe.set(d.valeur_id, liste);
  }

  return ordonnes.map((g) => {
    const parent = g.depend_de_groupe_id ? parId.get(g.depend_de_groupe_id) ?? null : null;
    const actif = !parent || valeurRetenue(parent, choix) !== null;

    return {
      groupe: g,
      parent,
      actif,
      raisonInactif: actif ? null : `Choisissez d'abord « ${parent!.nom} ».`,
      valeurs: valeursActives(g).map((v) => {
        const ids = requisesDe.get(v.id) ?? [];
        if (ids.length === 0) {
          return { valeur: v, disponible: true, raison: null, requises: [] };
        }

        const requises = ids
          .map((id) => valeurs.get(id))
          .filter((r): r is OptionValeur => r !== undefined);
        const disponible = ids.some((id) => choisies.has(id));

        return {
          valeur: v,
          disponible,
          raison: disponible
            ? null
            : `Disponible en ${enumererFr(requises.map((r) => r.libelle))} seulement`,
          requises,
        };
      }),
    };
  });
}

/** Une valeur donnée est-elle disponible pour les choix courants ? */
export function valeurDisponible(
  valeurId: string,
  groupes: OptionGroupe[],
  choix: ChoixParGroupe,
  dependances: Dependance[] = []
): boolean {
  for (const etat of etatDesGroupes(groupes, choix, dependances)) {
    const v = etat.valeurs.find((e) => e.valeur.id === valeurId);
    if (v) return etat.actif && v.disponible;
  }
  return false;
}

export type Nettoyage = { choix: ChoixParGroupe; messages: string[] };

/**
 * Efface les choix devenus impossibles, et dit lesquels et pourquoi.
 *
 * Jamais un choix invalide qui subsiste en silence : si la largeur change et
 * que le coloris retenu n'existe pas dans la nouvelle, il saute — avec le
 * message qui l'explique.
 */
export function nettoyerChoixInvalides(
  groupes: OptionGroupe[],
  choix: ChoixParGroupe,
  dependances: Dependance[] = []
): Nettoyage {
  const ordonnes = [...groupes].sort((a, b) => a.ordre - b.ordre);
  let courant: ChoixParGroupe = { ...choix };
  const messages: string[] = [];

  // Les groupes sont parcourus dans l'ordre : un parent est toujours traité
  // avant son enfant, un seul passage suffit donc à propager la cascade.
  for (const g of ordonnes) {
    const etats = etatDesGroupes(ordonnes, courant, dependances);
    const etat = etats.find((e) => e.groupe.id === g.id)!;
    const retenue = valeurRetenue(g, courant);
    if (!retenue) continue;

    const surValeur = etat.valeurs.find((e) => e.valeur.id === retenue.id);
    const impossible = !etat.actif || (surValeur ? !surValeur.disponible : true);
    if (!impossible) continue;

    const contexte = etat.parent ? valeurRetenue(etat.parent, courant) : null;
    messages.push(
      contexte
        ? `${g.nom} : « ${retenue.libelle} » n'existe pas en ${contexte.libelle}. Choisissez-en un autre.`
        : `${g.nom} : « ${retenue.libelle} » n'est plus disponible. Choisissez-en un autre.`
    );

    courant = { ...courant };
    if (g.type === "booleen") courant[g.id] = { ...courant[g.id], booleen: false };
    else courant[g.id] = { ...courant[g.id], valeur_id: null };
  }

  return { choix: courant, messages };
}

/**
 * Refus d'une configuration, dépendances comprises. La même fonction sert au
 * navigateur et au serveur : c'est le serveur qui a le dernier mot, mais les
 * deux disent la même chose.
 */
export function refusConfigurationAvecDependances(
  groupes: OptionGroupe[],
  choix: ChoixParGroupe,
  dependances: Dependance[] = []
): string | null {
  const etats = etatDesGroupes(groupes, choix, dependances);

  // Un groupe inactif n'a rien à répondre : sa question n'est pas posée.
  const actifs = etats.filter((e) => e.actif).map((e) => e.groupe);
  const refus = refusConfiguration(actifs, choix);
  if (refus) return refus;

  for (const etat of etats) {
    const retenue = valeurRetenue(etat.groupe, choix);
    if (!retenue) continue;

    if (!etat.actif) {
      return `${etat.groupe.nom} : ${etat.raisonInactif}`;
    }
    const surValeur = etat.valeurs.find((e) => e.valeur.id === retenue.id);
    if (surValeur && !surValeur.disponible) {
      return `${etat.groupe.nom} : « ${retenue.libelle} » n'est pas disponible avec ce choix. ${surValeur.raison}.`;
    }
  }
  return null;
}
