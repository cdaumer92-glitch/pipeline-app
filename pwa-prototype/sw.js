'use strict';

/* Service worker minimal — Pipeline TexasWin (proto PWA)
 *
 * Règle absolue : on ne met en cache QUE l'app-shell (fichiers statiques
 * servis depuis la même origine que ce SW). Aucune réponse d'API n'est
 * jamais interceptée ni mise en cache : les appels partent vers une autre
 * origine (crm.texaswin.fr) et sont donc ignorés d'office par le fetch
 * handler ci-dessous.
 *
 * Stratégie coquille : RÉSEAU D'ABORD. En ligne, on sert toujours la
 * dernière version (indispensable pour un proto qui évolue souvent) et on
 * rafraîchit le cache au passage ; le cache ne sert qu'en secours hors-ligne.
 * Bump le numéro de version ci-dessous à chaque changement de coquille pour
 * évincer l'ancien cache. */

const CACHE = 'texaswin-pwa-shell-v23';

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

  // On ne touche qu'aux GET de MÊME origine ET situés dans le dossier de
  // l'app (l'app-shell : /mobile/… en prod, / en local). Tout le reste passe
  // au réseau sans interception ni mise en cache — en particulier /api/, qui
  // est désormais sur la même origine que l'app une fois hébergée sur le CRM.
  const base = new URL('./', self.location.href).pathname;
  if (req.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(base)) {
    return; // laisse le navigateur gérer normalement
  }

  // App-shell : réseau d'abord (toujours à jour en ligne), cache en secours.
  event.respondWith(
    fetch(req)
      .then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return resp;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
  );
});
