# Pipeline TexasWin — Prototype PWA

Client web **autonome et installable** (PWA) qui consomme l'**API existante** du CRM.
Dossier isolé : **rien** en dehors de `pwa-prototype/` n'est modifié. Le front et le
back-end existants ne sont **pas** touchés.

## Choix technique

**HTML / CSS / JavaScript purs, sans framework ni build.**
Raison : c'est le plus simple pour une PWA — le `manifest.json` et le `service worker`
sont natifs du navigateur, l'app est un simple lot de fichiers statiques, aucun outil
de build, aucune dépendance à installer. Idéal pour un proto.

## Lancer en local

Aucune dépendance à installer (le serveur statique n'utilise que Node natif) :

```bash
cd pwa-prototype
npm start
```

Puis ouvrir **http://localhost:5173**.

> `localhost` est considéré comme une origine sécurisée par les navigateurs :
> le service worker et l'installation PWA fonctionnent sans HTTPS.

## Utilisation

1. **API** : pré-remplie sur la prod `https://crm.texaswin.fr/api` (modifiable dans l'écran de connexion).
2. **Se connecter** avec un compte du CRM (email + mot de passe).
   → `POST /api/auth/login`, le token JWT est gardé en mémoire de l'onglet (`sessionStorage`).
3. L'écran de démo appelle réellement l'API : `GET /api/brevo/audience?type=all`
   et affiche la **liste des contacts** + deux compteurs (sociétés / contacts avec email).

## Installer l'application (« Installer l'application »)

- **Chrome / Edge (desktop)** : icône d'installation dans la barre d'adresse (à droite),
  ou menu ⋮ → « Installer Pipeline TexasWin… ».
- **Android (Chrome)** : menu ⋮ → « Installer l'application » / « Ajouter à l'écran d'accueil ».
- **iOS (Safari)** : bouton Partager → « Sur l'écran d'accueil ».

L'app s'ouvre alors en fenêtre autonome (mode `standalone`), avec son icône.

## Ce qui est mis en cache (et ce qui ne l'est jamais)

- **Mis en cache** : uniquement l'app-shell (`index.html`, `styles.css`, `app.js`,
  `manifest.json`, icônes) — pour un démarrage hors-ligne de la coquille.
- **Jamais mis en cache** : **aucune réponse d'API**. Le `service worker` n'intercepte
  que les requêtes `GET` de **même origine** ; les appels vers `crm.texaswin.fr` sont
  cross-origin et donc ignorés. En plus, chaque `fetch` API utilise `cache: 'no-store'`.

## CORS / auth — côté serveur

Rien à changer côté serveur pour ce proto : l'API active déjà `app.use(cors())`
(ouvert à toutes les origines), donc les appels depuis `http://localhost:5173`
sont acceptés. L'auth se fait par en-tête `Authorization: Bearer <token>` (pas de cookie),
ce qui ne pose aucun problème de CORS avec credentials.

> Si un jour le CORS était restreint à des origines précises côté serveur, il faudrait
> y **ajouter** `http://localhost:5173` — mais ce n'est **pas** le cas actuellement,
> et ce proto ne modifie aucune config serveur.

## Contenu du dossier

| Fichier | Rôle |
|---|---|
| `index.html` | Coquille : écran connexion + écran contacts |
| `styles.css` | Habillage (charte teal/navy, responsive, dark mode) |
| `app.js` | Logique : login JWT, appels API, rendu, enregistrement du SW |
| `sw.js` | Service worker : cache app-shell only, jamais l'API |
| `manifest.json` | Manifeste PWA (nom, standalone, thème, icônes 192/512) |
| `icons/` | Icônes placeholder 192 / 512 |
| `serve.mjs` | Serveur statique local (Node natif, 0 dépendance) |
| `package.json` | Script `npm start` |
