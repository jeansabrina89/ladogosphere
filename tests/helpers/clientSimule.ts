/**
 * APP 70 — un client Supabase SIMULÉ, qui chronomètre.
 *
 * Il répond à tout ce qu'un écran demande (`from().select().eq()…`, `rpc`,
 * `auth.getUser`, `storage`) avec une latence fixe, et note pour chaque requête
 * quand elle est PARTIE et quand elle est REVENUE. On en tire :
 *
 *   · le nombre de lectures ;
 *   · le nombre de VAGUES : des requêtes qui se chevauchent comptent pour une,
 *     la suivante commence quand toutes les précédentes sont finies. Trois
 *     lectures en Promise.all font une vague, trois await successifs trois.
 *
 * Une requête Supabase ne part qu'au `then` : c'est ce qui permet à ce client
 * de voir exactement ce que voit la base.
 */

export type Appel = {
  cible: string;
  operation: string;
  filtres: string[];
  debut: number;
  fin: number;
};

export type Resolveur = (q: { table: string; operation: string; unique: boolean; filtres: string[] }) => unknown;

export type OptionsClient = {
  latence?: number;
  utilisateur?: { id: string; email: string } | null;
  /** Les données servies. Par défaut : une liste vide, ou une ligne générique. */
  donnees?: Resolveur;
};

const METHODES_CHAINE = [
  "select", "eq", "neq", "in", "is", "not", "or", "gt", "gte", "lt", "lte", "like", "ilike",
  "order", "limit", "range", "match", "filter", "contains", "containedBy", "overlaps",
  "textSearch", "returns", "csv", "abortSignal", "throwOnError",
];

export function creerClientSimule(options: OptionsClient = {}) {
  const latence = options.latence ?? 15;
  const appels: Appel[] = [];
  const utilisateur = options.utilisateur === undefined
    ? { id: "u-admin", email: "admin@exemple.ch" }
    : options.utilisateur;

  const attendre = () => new Promise((r) => setTimeout(r, latence));

  async function chrono<T>(cible: string, operation: string, filtres: string[], valeur: () => T): Promise<T> {
    const debut = performance.now();
    await attendre();
    const fin = performance.now();
    appels.push({ cible, operation, filtres, debut, fin });
    return valeur();
  }

  function requete(table: string, prefixe = "") {
    let operation = "select";
    let unique = false;
    const filtres: string[] = [];
    const chaine: Record<string, unknown> = {};
    for (const m of METHODES_CHAINE) {
      chaine[m] = (...args: unknown[]) => {
        if (m !== "select" && m !== "order" && m !== "limit" && m !== "returns") {
          filtres.push(`${m}:${String(args[0])}`);
        }
        return chaine;
      };
    }
    for (const m of ["insert", "update", "upsert", "delete"]) {
      chaine[m] = () => { operation = m; return chaine; };
    }
    chaine.single = () => { unique = true; return chaine; };
    chaine.maybeSingle = () => { unique = true; return chaine; };
    chaine.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) =>
      chrono(prefixe + table, operation, filtres, () => {
        const data = options.donnees?.({ table, operation, unique, filtres }) ?? (unique ? null : []);
        return { data, error: null, count: Array.isArray(data) ? data.length : 0 };
      }).then(ok, ko);
    return chaine;
  }

  const client = {
    from: (table: string) => requete(table),
    rpc: (fonction: string) => requete(fonction, "rpc:"),
    schema: () => client,
    auth: {
      getUser: () => chrono("auth:user", "auth", [], () => ({ data: { user: utilisateur }, error: null })),
      getClaims: () => chrono("auth:claims", "auth", [], () => ({ data: utilisateur ? { claims: { sub: utilisateur.id } } : null, error: null })),
      getSession: async () => ({ data: { session: null }, error: null }),
    },
    storage: {
      from: () => ({
        createSignedUrl: () => chrono("storage", "url", [], () => ({ data: { signedUrl: "https://x" }, error: null })),
        createSignedUrls: () => chrono("storage", "url", [], () => ({ data: [], error: null })),
        getPublicUrl: () => ({ data: { publicUrl: "https://x" } }),
        list: () => chrono("storage", "list", [], () => ({ data: [], error: null })),
        download: () => chrono("storage", "download", [], () => ({ data: null, error: null })),
      }),
    },
  };

  return { client, appels, remettreAZero: () => { appels.length = 0; } };
}

/**
 * La PROFONDEUR de chaque lecture : 1 + la plus grande profondeur des lectures
 * déjà REVENUES quand elle est partie.
 *
 * Une lecture qui attend la réponse d'une autre part après elle : elle est un
 * cran plus profond. Des lectures lancées dans le même Promise.all partent
 * toutes dans le même tour de boucle, avant qu'aucune ne revienne : elles ont
 * la même profondeur.
 *
 * C'est l'ORDRE des événements qui compte, pas leur durée : une machine
 * chargée étire les minuteries, elle ne fait pas revenir une lecture avant
 * qu'une autre soit partie. (Une première version divisait le temps écoulé
 * par la latence : sous la charge de la suite complète, elle comptait une
 * étape de trop.)
 */
export function profondeurs(appels: Pick<Appel, "debut" | "fin">[]): number[] {
  const ordre = appels.map((_, i) => i).sort((a, b) => appels[a].debut - appels[b].debut);
  const prof = new Array<number>(appels.length).fill(0);
  for (const i of ordre) {
    let max = 0;
    for (const j of ordre) {
      if (j === i || prof[j] === 0) continue;
      if (appels[j].fin <= appels[i].debut) max = Math.max(max, prof[j]);
    }
    prof[i] = max + 1;
  }
  return prof;
}

/**
 * Les lectures EN SÉRIE : la longueur du chemin critique, c'est-à-dire le
 * nombre d'allers-retours jusqu'à la base que l'écran paie l'un après l'autre.
 *
 * (Les « vagues » ci-dessous le sous-estiment : deux chaînes indépendantes qui
 * se chevauchent n'en font qu'une, alors que chacune attend ses maillons.)
 */
export function enSerie(appels: Pick<Appel, "debut" | "fin">[]): number {
  return appels.length === 0 ? 0 : Math.max(...profondeurs(appels));
}

/** Le nombre de vagues : des requêtes qui se chevauchent comptent pour une. */
export function vagues(appels: Pick<Appel, "debut" | "fin">[]): number {
  const tries = [...appels].sort((a, b) => a.debut - b.debut);
  let n = 0;
  let finVague = -Infinity;
  for (const a of tries) {
    if (a.debut >= finVague) { n++; finVague = a.fin; }
    else finVague = Math.max(finVague, a.fin);
  }
  return n;
}

/**
 * Les lectures rangées par ÉTAPE (leur profondeur) : deux lectures de la même
 * étape sont parties ensemble ; une lecture à l'étape 4 a attendu trois
 * réponses, l'une après l'autre.
 */
export function detailVagues(appels: Appel[]): string[][] {
  const prof = profondeurs(appels);
  const etapes: string[][] = [];
  appels
    .map((a, i) => ({ a, k: prof[i] - 1 }))
    .sort((x, y) => x.a.debut - y.a.debut)
    .forEach(({ a, k }) => (etapes[k] ??= []).push(a.cible));
  return etapes.map((e) => e ?? []);
}

// ── Un rendu serveur minimal ───────────────────────────────────────────────

type Element = { type?: unknown; props?: Record<string, unknown> } | null | undefined | string | number | boolean;

/**
 * Exécute un arbre de composants SERVEUR comme React le fait : les composants
 * asynchrones frères partent ENSEMBLE. Un composant client (hooks) lève une
 * erreur hors de React : on l'ignore — il ne lit pas la base côté serveur.
 */
export async function rendre(noeud: unknown): Promise<void> {
  const n = (await noeud) as Element | Element[];
  if (Array.isArray(n)) { await Promise.all(n.map(rendre)); return; }
  if (!n || typeof n !== "object") return;
  const { type, props } = n as { type?: unknown; props?: Record<string, unknown> };
  if (typeof type === "function") {
    let sortie: unknown;
    try {
      sortie = (type as (p: unknown) => unknown)(props ?? {});
    } catch {
      return;
    }
    try {
      await rendre(sortie);
    } catch (e) {
      if (estSortieNext(e)) throw e;
    }
    return;
  }
  if (props && "children" in props) await rendre(props.children as Element);
}

/** redirect() et notFound() lèvent : ce n'est pas une panne, c'est une sortie. */
export function estSortieNext(e: unknown): boolean {
  return e instanceof Error && /^NEXT_(REDIRECT|NOT_FOUND|HTTP)/.test(e.message);
}
