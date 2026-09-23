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
export type ChoixLocal = {
  valeur_id?: string | null;
  texte?: string | null;
  nombre?: number | null;
  booleen?: boolean;
  alerte_acceptee?: boolean;
  taille_choisie_directement?: boolean;
};

export type LigneLocale = {
  article_id: string;
  quantite: number;
  /**
   * Article sur mesure : le choix retenu, PAR IDENTIFIANTS. C'est la seule
   * chose que le serveur relit ; il en refait le prix et les libellés depuis
   * le catalogue.
   */
  choix?: Record<string, ChoixLocal> | null;
  /**
   * Les libellés figés au moment de la configuration. Ils ne servent QU'À
   * L'AFFICHAGE du panier du visiteur : le serveur ne les lit jamais.
   */
  apercu?: unknown[] | null;
  /**
   * Ancien format : les choix figés, sans identifiants. Une telle ligne ne
   * peut plus être revalidée — elle se reconfigure.
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

/** Une ligne sur mesure : elle porte un choix, ou des libellés figés. */
export function estSurMesure(ligne: { choix?: unknown; configuration?: unknown[] | null }): boolean {
  return !!ligne.choix || !!(Array.isArray(ligne.configuration) && ligne.configuration.length > 0);
}

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
    const choix = lireChoixLocal((l as LigneLocale)?.choix);
    const apercu = (l as LigneLocale)?.apercu;
    propres.push({
      ...(choix ? { choix } : {}),
      ...(Array.isArray(apercu) && apercu.length > 0 ? { apercu } : {}),
      article_id: id,
      quantite: q,
      configuration: Array.isArray(config) && config.length > 0 ? config : null,
    });
  }
  return { lignes: propres };
}

/**
 * Le choix d'un article sur mesure, tel qu'il sort du navigateur : des
 * identifiants, et rien d'autre. Une clé qui n'est pas un UUID, une valeur
 * qui n'en est pas un : la ligne perd son choix et sera refusée à la fusion,
 * plutôt que d'entrer à moitié.
 */
export function lireChoixLocal(brut: unknown): Record<string, ChoixLocal> | null {
  if (!brut || typeof brut !== "object" || Array.isArray(brut)) return null;
  const propre: Record<string, ChoixLocal> = {};
  for (const [groupe, valeur] of Object.entries(brut as Record<string, unknown>)) {
    if (!UUID.test(groupe) || !valeur || typeof valeur !== "object") continue;
    const c = valeur as ChoixLocal & { booleen?: boolean; alerte_acceptee?: boolean; taille_choisie_directement?: boolean };
    const id = typeof c.valeur_id === "string" && UUID.test(c.valeur_id) ? c.valeur_id : null;
    const texte = typeof c.texte === "string" ? c.texte : null;
    const nombre = typeof c.nombre === "number" && Number.isFinite(c.nombre) ? c.nombre : null;
    const booleen = c.booleen === true;
    if (!id && texte === null && nombre === null && !booleen) continue;
    propre[groupe] = {
      ...(id ? { valeur_id: id } : {}),
      ...(texte !== null ? { texte } : {}),
      ...(nombre !== null ? { nombre } : {}),
      ...(booleen ? { booleen: true } : {}),
      ...(c.alerte_acceptee === true ? { alerte_acceptee: true } : {}),
      ...(c.taille_choisie_directement === true ? { taille_choisie_directement: true } : {}),
    } as ChoixLocal;
  }
  return Object.keys(propre).length > 0 ? propre : null;
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

  if (estSurMesure(ligne)) {
    return { lignes: [...panier.lignes, { ...ligne, quantite: 1 }] };
  }

  const lignes = panier.lignes.map((l) => ({ ...l }));
  const existante = lignes.find((l) => l.article_id === ligne.article_id && !estSurMesure(l));
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
    if (estSurMesure(ligne)) {
      fusion.aCreer.push(ligne);
      fusion.reprises += 1;
      continue;
    }

    const deja = compte.find((c) => c.article_id === ligne.article_id && !estSurMesure(c));
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

// La revalidation d'une ligne contre le catalogue vit désormais dans
// src/lib/panier/revaliderLigne.ts : une seule fonction décide du prix, du
// stock et des options, à la mise au panier, à la fusion et à la validation.
