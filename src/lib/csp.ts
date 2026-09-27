/**
 * La Content-Security-Policy, en OBSERVATION d'abord (C-09, APP 29).
 *
 * ── POURQUOI REPORT-ONLY, ET NON BLOQUANTE ────────────────────────────────
 *
 * Une CSP posée à l'aveugle casse des écrans, et elle les casse en silence : le
 * navigateur refuse une ressource, la page s'affiche à moitié, et personne ne
 * voit d'erreur. On ne l'apprend que par une cliente qui téléphone.
 *
 * `Content-Security-Policy-Report-Only` fait exactement le même calcul, envoie
 * un rapport à chaque violation, et **ne bloque rien**. Deux semaines
 * d'observation disent ce que la politique aurait cassé ; on corrige, puis on
 * l'arme dans un lot à part. Le plan est écrit dans `docs/SECURITE.md`.
 *
 * ── CHAQUE SOURCE EST ICI PARCE QU'ON A VÉRIFIÉ QU'ELLE SERT ──────────────
 *
 * Aucune n'est reprise d'une liste toute faite. Ce qui n'a pas été trouvé dans
 * le dépôt n'y figure pas — et si un rapport nous dit qu'il manque quelque chose,
 * c'est précisément le travail de ces deux semaines.
 */

/** L'origine du projet Supabase, telle que le navigateur la joint. */
function origineSupabase(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * L'adresse où Sentry reçoit les rapports de violation, déduite du DSN.
 *
 * Un DSN a la forme `https://<clé>@<hôte>/<projet>`. L'endpoint de rapports est
 * `https://<hôte>/api/<projet>/security/?sentry_key=<clé>` — c'est une route que
 * Sentry expose exprès pour cela, et elle accepte le format que les navigateurs
 * envoient sans qu'on ait rien à transformer.
 *
 * Rend `null` si le DSN est absent ou illisible : la politique est alors servie
 * SANS `report-uri`. Elle reste utile — les violations paraissent dans la console
 * du navigateur — mais plus rien ne les collecte. C'est le cas en local, et c'est
 * voulu : on n'envoie pas à Sentry ce qu'on casse en développant.
 */
export function endpointRapportsCsp(dsn: string | undefined): string | null {
  if (!dsn) return null;
  try {
    const u = new URL(dsn);
    const projet = u.pathname.replace(/^\//, "");
    if (!u.username || !projet) return null;
    return `${u.protocol}//${u.host}/api/${projet}/security/?sentry_key=${u.username}`;
  } catch {
    return null;
  }
}

/**
 * La politique, construite depuis l'environnement.
 *
 * Elle est assemblée AU BUILD (`next.config.ts` la lit une fois) : l'origine
 * Supabase et le DSN sont des variables `NEXT_PUBLIC_*`, connues à ce
 * moment-là. Les mettre en dur serait les faire diverger du jour où le projet
 * change.
 */
export function politiqueCsp(env: {
  supabaseUrl?: string;
  sentryDsn?: string;
}): string {
  const supabase = origineSupabase(env.supabaseUrl);
  const rapports = endpointRapportsCsp(env.sentryDsn);

  /** Le temps réel de Supabase parle en WebSocket, donc en `wss:`. */
  const supabaseWs = supabase ? supabase.replace(/^https:/, "wss:") : null;

  const directives: string[] = [
    /*
     * Tout ce qui n'est pas nommé plus bas vient de NOUS. C'est le socle : une
     * directive oubliée retombe ici, donc du bon côté.
     */
    "default-src 'self'",

    /*
     * `'unsafe-inline'` pour les SCRIPTS, et c'est une dette, pas un choix.
     *
     * Next injecte des scripts inline pour l'hydratation et le chargement de ses
     * fragments. S'en passer demande des nonces, donc de faire passer un jeton
     * du serveur à chaque balise — un chantier en soi, et qui n'a pas sa place
     * dans un lot d'observation.
     *
     * Écrit ici pour qu'on sache que c'est le premier point à reprendre au lot
     * bloquant : `'unsafe-inline'` sur les scripts est la moitié de ce qu'une CSP
     * protège.
     */
    "script-src 'self' 'unsafe-inline'",

    /*
     * `'unsafe-inline'` pour les STYLES, et là c'est un fait du dépôt.
     *
     * Les écrans sont habillés par des `style={{ … }}` inline — des centaines.
     * Ce n'est pas une négligence à corriger avant d'armer la CSP : c'est la
     * façon dont cette application est écrite, et la changer serait un autre
     * projet.
     */
    "style-src 'self' 'unsafe-inline'",

    /*
     * Les IMAGES viennent de trois endroits, et de trois seulement :
     *
     *   'self'     — les fichiers du dépôt (logo, illustrations) ;
     *   data:      — les images encodées dans le HTML, dont les QR de facture ;
     *   blob:      — l'aperçu d'une photo AVANT téléversement, que le navigateur
     *                fabrique localement (fiche chien, article, justificatif) ;
     *   Supabase   — le bucket public `boutique-photos` ET les URL signées du
     *                bucket privé `chiens-photos` (lot 24). Les deux sont servis
     *                par la même origine.
     */
    supabase
      ? `img-src 'self' data: blob: ${supabase}`
      : "img-src 'self' data: blob:",

    /*
     * Les POLICES viennent de NOUS, et c'est contre-intuitif.
     *
     * `app/layout.tsx` utilise `next/font/google` (Nunito Sans). Next télécharge
     * la police AU BUILD et la sert depuis notre domaine — rien ne part vers
     * fonts.gstatic.com au moment où la page s'affiche. Ajouter Google ici
     * autoriserait une origine dont on n'a pas besoin.
     */
    "font-src 'self'",

    /*
     * Les REQUÊTES sortantes du navigateur :
     *
     *   'self'      — nos routes API et nos actions serveur ;
     *   Supabase    — REST, Auth et Storage, en https ;
     *   Supabase ws — le temps réel, s'il est utilisé un jour : l'autoriser
     *                 maintenant coûte une ligne, le découvrir en panne coûte
     *                 une soirée ;
     *   Sentry      — les erreurs et les traces partent directement au DSN
     *                 (aucun tunnel n'est configuré). Sans cette ligne, on
     *                 perdrait la remontée d'erreurs le jour où la CSP bloque.
     */
    [
      "connect-src 'self'",
      supabase,
      supabaseWs,
      "https://*.sentry.io",
      "https://*.ingest.sentry.io",
    ].filter(Boolean).join(" "),

    /*
     * Ce qui est INTERDIT, et qu'on a vérifié ne pas utiliser (lot 23) : le
     * dépôt ne contient aucun `<iframe>`, `<embed>` ni `<object>`. Les PDF de
     * facture sont servis par une redirection vers une URL signée, jamais
     * encadrés.
     */
    "frame-src 'none'",
    "object-src 'none'",

    /*
     * `frame-ancestors 'none'` double `X-Frame-Options: DENY` : c'est la forme
     * moderne, et la seule que les navigateurs récents lisent vraiment. Les deux
     * cohabitent sans se gêner.
     */
    "frame-ancestors 'none'",

    /*
     * `base-uri` empêche d'injecter une balise `<base>` qui réécrirait la cible
     * de toutes les URL relatives de la page — un détournement discret, et qui
     * ne demande qu'une balise.
     */
    "base-uri 'self'",

    /*
     * `form-action 'self'` : nos formulaires ne postent que chez nous. C'est ce
     * qui empêche un script injecté de renvoyer un mot de passe ailleurs.
     */
    "form-action 'self'",

    /*
     * `upgrade-insecure-requests` : si une ressource est appelée en http, le
     * navigateur la demande en https au lieu de la bloquer. HSTS le fait déjà
     * pour notre domaine ; ceci couvre le reste.
     */
    "upgrade-insecure-requests",
  ];

  if (rapports) directives.push(`report-uri ${rapports}`);

  return directives.join("; ");
}
