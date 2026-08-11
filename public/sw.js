// Service worker MINIMAL — sert uniquement à rendre l'app installable (PWA).
// Aucun cache : l'app est authentifiée et dynamique, on ne doit JAMAIS servir
// de données périmées. Le handler 'fetch' est un passe-plat (network-only).

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Passe-plat : aucun respondWith → le navigateur fait la requête réseau normale.
// (Un handler 'fetch' est requis par certains navigateurs pour l'installabilité.)
self.addEventListener("fetch", () => {
  /* network-only, aucun cache */
});
