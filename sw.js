// Service worker : l'appli s'ouvre même sans réseau.
const VERSION = "colis-v1.9.0";
const LIBS = "colis-libs"; // bibliothèques externes (lecteur de photo…) : gardées d'une version à l'autre
const SHELL = ["./", "index.html", "style.css", "app.js", "lecture.js", "config.js", "bg.svg",
  "manifest.webmanifest", "icons/icon-192.png", "icons/apple-touch-icon.png"];
const EXTERNES = ["cdn.jsdelivr.net", "tessdata.projectnaptha.com"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION && k !== LIBS).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.hostname.endsWith("supabase.co")) return; // données : toujours en direct
  if (EXTERNES.includes(url.hostname)) {            // bibliothèques : le cache d'abord (gros fichiers, jamais modifiés)
    e.respondWith(caches.open(LIBS).then(c => c.match(req).then(r => r || fetch(req).then(res => {
      if (res && (res.ok || res.type === "opaque")) c.put(req, res.clone());
      return res;
    }))));
    return;
  }
  // le reste : réseau d'abord, cache en secours (les mises à jour arrivent tout de suite)
  e.respondWith(
    fetch(req).then(res => {
      if (res && (res.ok || res.type === "opaque")) {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match("index.html")))
  );
});
