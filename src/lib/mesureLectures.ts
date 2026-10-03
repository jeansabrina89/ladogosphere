import { appendFileSync } from "node:fs";

/**
 * APP 70 — compter les lectures Supabase d'un écran, EN LOCAL SEULEMENT.
 *
 * `scripts/mesure-pages.mjs` lance l'app avec `MESURE_LECTURES=1` et
 * `MESURE_FICHIER=<chemin>` : chaque requête vers Supabase y laisse une ligne
 * (début, fin, méthode, table), et le script attribue les lignes à l'écran
 * qu'il était en train de charger.
 *
 * ── JAMAIS EN PRODUCTION ──────────────────────────────────────────────────
 *
 * Trois verrous, et il faut les trois pour mesurer :
 *   · la variable `MESURE_LECTURES=1`, que rien ne pose en dehors du script ;
 *   · un fichier de sortie explicite ;
 *   · l'absence de `VERCEL` : sur Vercel, la variable existe toujours, et la
 *     mesure est alors coupée même si quelqu'un posait les deux autres.
 *
 * Rien de la requête n'est écrit : ni les valeurs des filtres (un identifiant,
 * un e-mail), ni le corps, ni la réponse. Seulement la table et la méthode.
 */

export function mesureActive(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.MESURE_LECTURES === "1" && !!env.MESURE_FICHIER && !env.VERCEL;
}

/** « /rest/v1/reservations?select=…&id=eq.… » → « reservations ». */
export function cibleDeLaRequete(url: string): string {
  try {
    const u = new URL(url);
    const morceaux = u.pathname.split("/").filter(Boolean);
    // /rest/v1/<table>, /rest/v1/rpc/<fonction>, /auth/v1/<route>, /storage/v1/…
    if (morceaux[0] === "rest" && morceaux[2] === "rpc") return `rpc:${morceaux[3] ?? "?"}`;
    if (morceaux[0] === "rest") return morceaux[2] ?? "?";
    return `${morceaux[0] ?? "?"}:${morceaux[2] ?? "?"}`;
  } catch {
    return "?";
  }
}

/**
 * Les options à donner à `createClient` / `createServerClient` : un `fetch`
 * qui chronomètre, ou rien du tout. Hors mesure, l'objet est VIDE — le client
 * est créé exactement comme avant.
 */
export function optionsMesure(): { global?: { fetch: typeof fetch } } {
  if (!mesureActive()) return {};
  const fichier = process.env.MESURE_FICHIER!;
  const fetchMesure: typeof fetch = async (entree, init) => {
    const url = typeof entree === "string" ? entree : entree instanceof URL ? entree.href : entree.url;
    const methode = (init?.method ?? (entree instanceof Request ? entree.method : "GET")).toUpperCase();
    const debut = performance.timeOrigin + performance.now();
    try {
      return await fetch(entree, init);
    } finally {
      const fin = performance.timeOrigin + performance.now();
      try {
        appendFileSync(fichier, JSON.stringify({ debut, fin, methode, cible: cibleDeLaRequete(url) }) + "\n");
      } catch {
        // La mesure ne doit jamais casser l'écran mesuré.
      }
    }
  };
  return { global: { fetch: fetchMesure } };
}
