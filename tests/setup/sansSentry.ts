import http from "node:http";
import https from "node:https";

/**
 * Le garde-fou de la suite : RIEN ne part vers Sentry pendant les tests.
 *
 * Chargé avant chaque fichier de test (vitest.config.ts, `setupFiles`), il
 * surveille les deux seules sorties possibles — `fetch` et les requêtes
 * http/https de Node, que le transport de Sentry utilise. Une requête vers un
 * point de collecte fait échouer le test qui l'a provoquée, là où elle est
 * partie, plutôt que de laisser passer un envoi silencieux.
 *
 * Il compte aussi les tentatives : `requetesSentry()` les rend au test qui
 * vérifie la coupure.
 *
 * Limite connue : la garde remplace `request` SUR L'OBJET du module, ce que
 * voit un appel `require("node:http").request(…)` — la forme qu'ont les
 * transports une fois empaquetés. Un code qui importerait la liaison nommée
 * (`import { request } from "node:http"`) passerait à côté ; c'est pourquoi
 * la vraie coupure reste `enabled`, et non cette garde.
 */

const CIBLES = /sentry\.io|ingest\.sentry\.io|\.ingest\.[a-z]+\.sentry\.io|sentry_key=/i;

const tentatives: string[] = [];

/** Les envois vers Sentry observés depuis le début du fichier de test. */
export function requetesSentry(): string[] {
  return [...tentatives];
}

export function oublierRequetesSentry(): void {
  tentatives.length = 0;
}

function refuser(url: string): never {
  tentatives.push(url);
  throw new Error(
    `Envoi Sentry pendant les tests : ${url}. Sentry doit rester coupé hors production (enabled).`,
  );
}

const fetchOrigine = globalThis.fetch;
globalThis.fetch = (async (entree: Parameters<typeof fetchOrigine>[0], init?: Parameters<typeof fetchOrigine>[1]) => {
  const url = typeof entree === "string" ? entree : entree instanceof URL ? entree.href : (entree as Request).url;
  if (CIBLES.test(String(url))) refuser(String(url));
  return fetchOrigine(entree, init);
}) as typeof fetchOrigine;

for (const sortie of [http, https] as const) {
  const origine = sortie.request.bind(sortie) as (...a: unknown[]) => ReturnType<typeof sortie.request>;
  sortie.request = (...args: Parameters<typeof origine>) => {
    const premier = args[0];
    const url =
      typeof premier === "string" ? premier
      : premier instanceof URL ? premier.href
      : `${(premier as { hostname?: string })?.hostname ?? ""}${(premier as { path?: string })?.path ?? ""}`;
    if (CIBLES.test(url)) refuser(url);
    return origine(...args);
  };
}
