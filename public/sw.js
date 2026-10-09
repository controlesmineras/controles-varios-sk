const ROOT = "/controles-varios-sk/";
const PREFIX = "control-explosivos-shell-";
const CACHE = PREFIX + "v16-__BUILD_ID__";
// The Pages build replaces this list with every script, stylesheet and local asset.
const PRECACHE = /* OFFLINE_ASSETS */ [ROOT];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    try {
      await cache.addAll(PRECACHE.map(url => new Request(url, { cache: "reload" })));
    } catch (error) {
      await caches.delete(CACHE);
      throw error; // Keep the working version if any required download fails.
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const previous = (await caches.keys()).filter(key => key.startsWith(PREFIX) && key !== CACHE);
    // An already open page may still request a chunk from the previous version.
    await Promise.all(previous.slice(0, -1).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin || !url.pathname.startsWith(ROOT)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // Serve a complete installed version; the next worker prepares updates atomically.
    if (event.request.mode === "navigate" && (url.pathname === ROOT || url.pathname === ROOT + "index.html")) {
      const shell = await cache.match(ROOT);
      if (shell) return shell;
    }
    const cached = await cache.match(event.request) || await cache.match(event.request, { ignoreSearch: true });
    if (cached) return cached;
    if (url.pathname.startsWith(ROOT + "_next/static/")) {
      const previous = (await caches.keys()).filter(key => key.startsWith(PREFIX) && key !== CACHE);
      for (const name of previous.reverse()) {
        const response = await (await caches.open(name)).match(event.request);
        if (response) return response;
      }
    }
    try {
      const response = await fetch(event.request);
      // Never cache API responses or substitute HTML for a missing JS/CSS file.
      if (response.ok && url.pathname.startsWith(ROOT + "_next/static/")) await cache.put(event.request, response.clone());
      return response;
    } catch {
      return new Response("Recurso no disponible sin conexión", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
  })());
});
