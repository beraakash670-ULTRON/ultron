const C = "ultron-v4";
self.addEventListener("install", e => {
  e.waitUntil(caches.open(C).then(c => c.addAll(["/", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"])));
  self.skipWaiting();
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== C).map(x => caches.delete(x)))));
  self.clients.claim();
});
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin || u.pathname === "/chat" || u.pathname === "/ping") return;
  // "?fresh" = the app asked for the newest version: go to the network and refresh the cache.
  if (u.searchParams.has("fresh")) {
    const key = u.origin + u.pathname;
    e.respondWith(fetch(new Request(key, { cache: "reload" })).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(C).then(c => c.put(key, copy)); }
      return r;
    }).catch(() => caches.match(key)));
    return;
  }
  // Otherwise open instantly from the cache and refresh it in the background (the free server may be asleep).
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => {
    const net = fetch(e.request).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(C).then(c => c.put(e.request, copy)); }
      return r;
    }).catch(() => hit);
    return hit || net;
  }));
});
