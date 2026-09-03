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
3. **Liste des sociétés** : `GET /api/prospects/enriched` (nom, statut, ville, nb d'affaires),
   avec recherche instantanée + deux compteurs (sociétés / clients).
4. **Fiche société** (clic sur une société) avec **navigation par onglets** ; chaque
   onglet charge son endpoint **à la demande**, jamais mis en cache :
   - **Infos** — montants Setup / Mensuel / Annuel + coordonnées (données de la liste).
   - **Actions** — `GET /api/prospects/:id/actions-all` (À faire / Historique, échéances colorées).
   - **Contacts** — `GET /api/prospects/:id/interlocuteurs` (téléphones dans la carte, badges
     Principal / Décideur / Externe ; clic → fiche contact détaillée avec liens `tel:` / `mailto:`).
   - **Sites** — `GET /api/prospects/:id/sites`.
   - **Boutiques** — `GET /api/prospects/:id/boutiques`.
   - **Affaires** — `GET /api/prospects/:id/affaires` (statut + montants + nb devis).
   - **Licences** — `GET /api/prospects/:id/licences`.
   - **Matériel** — `GET /api/prospects/:id/materiel`.
5. **Actions à faire** (bascule en haut de la liste) : `GET /api/lists/actions`, triées par
   urgence (aujourd'hui, retards du plus récent au plus ancien, puis à venir), compteur
   préchargé dès la connexion.

## Saisie (écriture — modifie réellement les données du CRM)

Le proto utilise les **mêmes endpoints que l'application principale** ; ce qui est saisi ici
apparaît dans le CRM.

| Action | Où | Endpoint |
|---|---|---|
| Créer une **société** | bouton « + Nouvelle société » (liste) : coordonnées, **marques** (séparées par des virgules), **note** libre → ouvre la nouvelle fiche | `POST /api/prospects` |
| Ajouter une **note** datée | onglet Notes → « + Nouvelle note » | `POST /api/prospects/:id/notes` |
| Créer un **contact** | onglet Contacts → « + Nouveau contact » | `POST /api/prospects/:id/interlocuteurs` |
| Créer une **action** | onglet Actions → « + Nouvelle action » (contact en autocomplétion) | `POST /api/prospects/:id/next_actions` |
| Modifier / supprimer une action | onglet Actions ou liste globale (✏️) | `PUT` / `DELETE /api/next_actions/:id` |
| Cocher une action **faite** | case ronde (liste globale et fiche) | `PUT /api/next_actions/:id` `{completed:true}` |
| **Reporter** une action | ⏰ → Demain / +3 j / +1 semaine / Lundi / date précise | `PUT /api/next_actions/:id` `{reschedule:true}` |

> Le champ « Commercial » d'une nouvelle société est pré-rempli avec l'utilisateur connecté :
> un utilisateur non-admin ne voit que les sociétés qui lui sont attribuées.

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
| `index.html` | Coquille : connexion, liste sociétés / actions, fiche à onglets, feuilles de saisie |
| `styles.css` | Habillage (charte teal/navy, responsive, dark mode) |
| `app.js` | Logique : login JWT, appels API, rendu, enregistrement du SW |
| `sw.js` | Service worker : cache app-shell only, jamais l'API |
| `manifest.json` | Manifeste PWA (nom, standalone, thème, icônes 192/512) |
| `icons/` | Icônes placeholder 192 / 512 |
| `serve.mjs` | Serveur statique local (Node natif, 0 dépendance) |
| `package.json` | Script `npm start` |
