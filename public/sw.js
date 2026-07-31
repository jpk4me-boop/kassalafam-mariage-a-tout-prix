/*
 * KASSALAFAM — Service worker minimal, respectueux de la vie privée.
 *
 * Principes (à ne pas assouplir sans revue) :
 *  - AUCUNE page HTML n'est mise en cache (contenu membre = privé) ;
 *    les navigations passent toujours par le réseau, avec pour seul
 *    repli hors-ligne la page /offline pré-cachée.
 *  - Seuls les assets immuables de Next (/_next/static/, empreinte dans
 *    l'URL) et les icônes publiques sont mis en cache (cache-first).
 *  - /api/ et les requêtes non-GET ou cross-origin ne sont jamais
 *    interceptées.
 *
 * Pour invalider l'intégralité du cache : incrémenter CACHE_VERSION.
 */

const CACHE_VERSION = "v1";
const CACHE_NAME = `kassalafam-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline";

/* Précache minimal : la page hors-ligne et les icônes de l'app. */
const PRECACHE_URLS = [
  OFFLINE_URL,
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("kassalafam-") && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/* Les assets Next sont fingerprintés : immuables, donc cache-first sûr. */
function isImmutableAsset(url) {
  return url.pathname.startsWith("/_next/static/");
}

function isPrecachedUrl(url) {
  return PRECACHE_URLS.includes(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const request = event.request;

  /* Jamais d'interception : non-GET, cross-origin, API. */
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  /* Navigations : réseau d'abord, SANS mise en cache de la réponse ;
     repli sur la page hors-ligne pré-cachée en cas d'échec réseau. */
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches
          .match(OFFLINE_URL)
          .then((cached) => cached ?? Response.error()),
      ),
    );
    return;
  }

  /* Assets immuables + précache : cache-first avec remplissage au vol. */
  if (isImmutableAsset(url) || isPrecachedUrl(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches
                .open(CACHE_NAME)
                .then((cache) => cache.put(request, copy))
                .catch(() => {});
            }
            return response;
          }),
      ),
    );
  }

  /* Tout le reste : comportement réseau par défaut (aucun respondWith). */
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
