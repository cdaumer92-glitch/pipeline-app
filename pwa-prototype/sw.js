'use strict';

/* Service worker minimal — Pipeline TexasWin (proto PWA)
 *
 * Règle absolue : on ne met en cache QUE l'app-shell (fichiers statiques
 * servis depuis la même origine que ce SW). Aucune réponse d'API n'est
 * jamais interceptée ni mise en cache : les appels partent vers une autre
 * origine (crm.texaswin.fr) et sont donc ignorés d'office par le fetch
 * handler ci-dessous. */

const CACHE = 'texaswin-pwa-shell-v1';

const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // On ne touche qu'aux GET de MÊME origine (l'app-shell).
  // Tout le reste — dont les appels API cross-origin — passe au réseau
  // sans interception ni mise en cache.
  if (req.method !== 'GET' || url.origin !== self.location.origin) {
    return; // laisse le navigateur gérer normalement
  }

  // App-shell : cache d'abord, réseau en secours.
  event.respondWith(
    caches.match(req).then((hit) => hit || fetch(req))
  );
});
