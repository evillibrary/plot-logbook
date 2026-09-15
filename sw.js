// Offline shell. Cache-first for the app's own files; everything else (the data source) goes to the network.
const VERSION = "plot-logbook-v0.1.1";
const SHELL = ["./", "index.html", "manifest.json", "css/app.css", "vendor/leaflet/leaflet.js", "vendor/leaflet/leaflet.css",
  "vendor/leaflet/images/layers.png", "vendor/leaflet/images/layers-2x.png", "vendor/leaflet/images/marker-icon.png",
  "vendor/leaflet/images/marker-icon-2x.png", "vendor/leaflet/images/marker-shadow.png", "vendor/exifr.js", "vendor/fflate.js",
  "js/app.js", "js/db.js", "js/source.js", "js/proj.js", "js/map.js", "js/tiles.js", "js/events.js", "js/photos.js",
  "js/ui/dom.js", "js/ui/forms.js", "js/ui/sheet.js", "js/ui/views.js", "js/ui/more.js", "icons/icon-192.png", "icons/icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || e.request.method !== "GET") return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).then(res => {
    if (res.ok) caches.open(VERSION).then(c => c.put(e.request, res.clone()));
    return res;
  })));
});
