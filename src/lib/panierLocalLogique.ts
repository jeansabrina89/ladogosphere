/**
 * Le panier d'un visiteur sans compte.
 *
 * Il vit dans SON navigateur, jamais en base : aucune ligne de commande,
 * aucune fiche client, aucune réservation de stock. La règle d'APP 13 ne
 * bouge pas — le stock se réserve à la COMMANDE, et un panier n'est pas une
 * commande. Quelqu'un qui range trois colliers dans son panier et ferme
 * l'onglet ne doit avoir rien retenu à personne.
 *
 * Fonction pure : ni base, ni navigateur. Le stockage est ailleurs ; ici ne
 * vivent que les règles, et ce sont elles que les tests couvrent.
 */

/** Une ligne telle que le navigateur la garde : le strict minimum. */
export type LigneLocale = {
  article_id: string;
  quantite: number;
  /**
   * Les choix d'un article sur mesure, figés au moment de la configuration.
   * Une configuration est unique : elle ne se cumule jamais avec une autre.
   */
  configuration?: unknown[] | null;
};

export type PanierLocal = { lignes: LigneLocale[] };

export const PANIER_VIDE: PanierLocal = { lignes: [] };

/** La clé du navigateur. Une seule, nommée une fois. */
export const CLE_PANIER_LOCAL = "boutique.panier.visiteur";

// ── Lecture d'un panier venu du navigateur ─────────────────────────────────

const entier = (v: unknown): number => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Un identifiant d'article, et rien d'autre. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Ce qui sort du navigateur n'est pas de confiance : c'est du texte que
 * n'importe qui peut réécrire. On ne garde que ce qui a une forme — un
 * identifiant qui n'est pas un UUID ne rentre pas — et le prix n'est JAMAIS lu
 * d'ici : il se relit en base à la validation.
 */
export function lirePanierLocal(brut: unknown): PanierLocal {
  const source = typeof brut === "string" ? sansErreur(brut) : brut;
  const lignes = (source as PanierLocal | null)?.lignes;
  if (!Array.isArray(lignes)) return PANIER_VIDE;

  const propres: LigneLocale[] = [];
  for (const l of lignes) {
    const id = String((l as LigneLocale)?.article_id ?? "").trim();
    const q = entier((l as LigneLocale)?.quantite);
    if (!UUID.test(id) || q === 0) continue;
    const config = (l as LigneLocale)?.configuration;
    propres.push({
      article_id: id,
      quantite: q,
      configuration: Array.isArray(config) && config.length > 0 ? config : null,
    });
  }
  return { lignes: propres };
}

function sansErreur(texte: string): unknown {
  try {
    return JSON.parse(texte);
  } catch {
    return null;
  }
}

/**
 * Ajouter au panier du navigateur.
 *
 * Un article ordinaire s'additionne à lui-même ; un article configuré s'ajoute
 * toujours comme une ligne de plus — deux colliers sur mesure ne sont pas le
 * même objet, même s'ils partent du même article.
 */
export function ajouterLocalement(
  panier: PanierLocal,
  ligne: LigneLocale
): PanierLocal {
  const q = entier(ligne.quantite) || 1;

  if (ligne.configuration && ligne.configuration.length > 0) {
    return { lignes: [...panier.lignes, { ...ligne, quantite: 1 }] };
  }

  const lignes = panier.lignes.map((l) => ({ ...l }));
  const existante = lignes.find((l) => l.article_id === ligne.article_id && !l.configuration);
  if (existante) existante.quantite += q;
  else lignes.push({ article_id: ligne.article_id, quantite: q, configuration: null });

  return { lignes };
}

export function retirerLocalement(panier: PanierLocal, index: number): PanierLocal {
  return { lignes: panier.lignes.filter((_, i) => i !== index) };
}

export function changerQuantiteLocale(
  panier: PanierLocal,
  index: number,
  quantite: number
): PanierLocal {
  const q = entier(quantite);
  if (q === 0) return retirerLocalement(panier, index);
  return {
    lignes: panier.lignes.map((l, i) => (i === index ? { ...l, quantite: q } : l)),
  };
}

export function nombreArticlesLocal(panier: PanierLocal): number {
  return panier.lignes.reduce((s, l) => s + entier(l.quantite), 0);
}

// ── La fusion, à la connexion ──────────────────────────────────────────────

export type LigneCompte = {
  /** L'identifiant de la ligne déjà en base, quand elle existe. */
  id?: string | null;
  article_id: string;
  quantite: number;
  configuration?: unknown[] | null;
};

export type FusionPanier = {
  /** Les lignes du navigateur à créer en base. */
  aCreer: LigneLocale[];
  /** Les lignes du compte dont la quantité doit monter. */
  aMonter: { id: string; quantite: number }[];
  /** Les articles du navigateur qui n'existent plus, ou plus en vente. */
  ecartes: string[];
  /** Combien de lignes du navigateur ont rejoint le compte. */
  reprises: number;
};

/**
 * Fusionner le panier du navigateur avec celui du compte.
 *
 * La règle qui compte : un même article présent des deux côtés prend la
 * quantité LA PLUS ÉLEVÉE, jamais la somme. Personne ne veut se retrouver
 * avec deux colliers parce qu'il s'est connecté entre-temps — c'est le même
 * panier vu deux fois, pas deux paniers.
 *
 * Une configuration sur mesure, elle, s'ajoute toujours : deux configurations
 * ne se confondent pas, et on ne sait pas dire qu'elles sont « le même ».
 *
 * Un article qui n'est plus vendable est écarté et nommé : on ne le glisse pas
 * en silence, et on ne bloque pas la fusion pour autant.
 */
export function fusionnerPaniers(
  local: PanierLocal,
  compte: LigneCompte[],
  vendables: Set<string>
): FusionPanier {
  const fusion: FusionPanier = { aCreer: [], aMonter: [], ecartes: [], reprises: 0 };

  for (const ligne of local.lignes) {
    if (!vendables.has(ligne.article_id)) {
      if (!fusion.ecartes.includes(ligne.article_id)) fusion.ecartes.push(ligne.article_id);
      continue;
    }

    // Une configuration ne se confond avec rien : elle rejoint le panier telle
    // quelle, en plus de ce qui s'y trouve déjà.
    if (ligne.configuration && ligne.configuration.length > 0) {
      fusion.aCreer.push(ligne);
      fusion.reprises += 1;
      continue;
    }

    const deja = compte.find((c) => c.article_id === ligne.article_id && !c.configuration);
    if (!deja) {
      fusion.aCreer.push(ligne);
      fusion.reprises += 1;
      continue;
    }

    // La plus élevée des deux, jamais la somme.
    const voulue = Math.max(entier(deja.quantite), entier(ligne.quantite));
    if (voulue > entier(deja.quantite) && deja.id) {
      fusion.aMonter.push({ id: deja.id, quantite: voulue });
      fusion.reprises += 1;
    }
  }

  return fusion;
}

/** La ligne à dire à l'écran après une fusion. Une seule, et seulement s'il y a lieu. */
export function messageFusion(fusion: FusionPanier, nomsEcartes: string[] = []): string | null {
  const bouts: string[] = [];

  if (fusion.reprises === 1) bouts.push("1 article de votre panier a rejoint votre compte.");
  else if (fusion.reprises > 1) {
    bouts.push(`${fusion.reprises} articles de votre panier ont rejoint votre compte.`);
  }

  if (nomsEcartes.length > 0) {
    bouts.push(
      nomsEcartes.length === 1
        ? `« ${nomsEcartes[0]} » n'est plus proposé : il a été retiré.`
        : `${nomsEcartes.length} articles ne sont plus proposés : ils ont été retirés.`
    );
  }

  return bouts.length > 0 ? bouts.join(" ") : null;
}

// ── Le recalcul, à la validation ───────────────────────────────────────────

export type LigneAValider = {
  id: string;
  article_id: string;
  libelle: string;
  quantite: number;
  /** Le prix tel qu'il a été mis au panier — jamais celui qu'on facture. */
  prix_unitaire: number;
  configuration?: unknown[] | null;
};

/** La remise retenue sur une ligne, telle qu'elle se fige à la validation. */
export type RemiseAFiger = {
  prix_base: number;
  remise_pourcentage: number;
  remise_origine: string;
  remise_libelle: string;
};

export type ArticleAJour = {
  id: string;
  nom: string;
  /**
   * Le prix APPLICABLE aujourd'hui — remise de ligne comprise. Il vient de
   * `prixApplicable`, jamais d'un calcul refait ici.
   */
  prix_vente: number;
  /** Faux quand l'article a été retiré de la vente entre-temps. */
  disponible: boolean;
  /** La remise qui explique ce prix. Null : le prix de base s'applique. */
  remise?: RemiseAFiger | null;
};

export type Recalcul = {
  /** Les lignes qui restent, à leur prix D'AUJOURD'HUI. */
  lignes: (LigneAValider & { prix_actuel: number; remise: RemiseAFiger | null })[];
  /** Ce qui a changé de prix, avec l'ancien et le nouveau. */
  prixChanges: { libelle: string; avant: number; apres: number }[];
  /** Ce qui est sorti du panier faute d'être encore proposé. */
  retires: string[];
  /** Vrai quand il faut prévenir avant de laisser valider. */
  aSignaler: boolean;
};

/**
 * Relire les prix au moment de valider.
 *
 * Un panier peut dormir trois semaines. On ne facture JAMAIS le prix qu'il
 * porte : on relit celui de la base, et si l'écart existe on le montre avant
 * de laisser valider. Un article devenu indisponible ne bloque pas la
 * commande — il en sort, on le dit, le reste passe.
 *
 * Un article sur mesure garde le prix figé de sa configuration : son prix
 * dépend des choix faits, pas du seul tarif de base.
 */
export function recalculerPanier(
  lignes: LigneAValider[],
  articles: ArticleAJour[]
): Recalcul {
  const parId = new Map(articles.map((a) => [a.id, a]));
  const res: Recalcul = { lignes: [], prixChanges: [], retires: [], aSignaler: false };

  for (const l of lignes) {
    const a = parId.get(l.article_id);
    if (!a || !a.disponible) {
      res.retires.push(l.libelle);
      continue;
    }

    const surMesure = !!(l.configuration && l.configuration.length > 0);
    const actuel = surMesure ? arrondi(l.prix_unitaire) : arrondi(a.prix_vente);

    if (!surMesure && actuel !== arrondi(l.prix_unitaire)) {
      res.prixChanges.push({ libelle: l.libelle, avant: arrondi(l.prix_unitaire), apres: actuel });
    }
    // Un sur-mesure garde son prix figé : aucune rubrique ne s'y applique.
    res.lignes.push({ ...l, prix_actuel: actuel, remise: surMesure ? null : a.remise ?? null });
  }

  res.aSignaler = res.prixChanges.length > 0 || res.retires.length > 0;
  return res;
}

const arrondi = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** Ce qu'on dit avant de laisser valider, quand quelque chose a bougé. */
export function messageRecalcul(r: Recalcul): string | null {
  if (!r.aSignaler) return null;
  const bouts: string[] = [];

  for (const c of r.prixChanges) {
    bouts.push(
      `« ${c.libelle} » est passé de ${c.avant.toFixed(2)} à ${c.apres.toFixed(2)} CHF.`
    );
  }
  for (const nom of r.retires) {
    bouts.push(`« ${nom} » n'est plus proposé : il a été retiré de votre panier.`);
  }

  return bouts.join(" ");
}
