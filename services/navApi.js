/* ====================================================================
   navApi.js — COUCHE D'ABSTRACTION UNIQUE DE LA NAVIGATION RAPIDE
   --------------------------------------------------------------------
   Règle d'architecture (non négociable) :
   les composants de navigation (palette, recherche, peek...) ne font
   JAMAIS de fetch directement. Ils passent TOUS par window.NavApi.
   Objectif : pouvoir rebrancher demain une autre source (gateway, cache,
   mock...) sans toucher aux composants (logique Strangler Fig).

   Exposé en global (window.NavApi) car le front n'a pas de bundler :
   React + Babel sont chargés dans le navigateur, il n'y a pas de modules
   ES / d'import-export. Ce fichier est un simple <script src="...">.

   API publique :
     NavApi.getNav()            -> { ecrans:[...], actions:[...] }
     NavApi.searchRecords(q)    -> [ { id, type, entityId, icon, label, sub, prospectId } ]
     NavApi.getPeek(type, id)   -> { icon, title, sub, fields:[[label,valeur]], prospectId }
   ==================================================================== */
(function () {
  'use strict';

  var API_BASE = '/api';

  // IMPORTANT : on capture le fetch NATIF au chargement (ce script tourne dans le
  // <head>, AVANT que l'app ne remplace window.fetch par son intercepteur 401).
  // L'app force une déconnexion + redirection sur tout 401 /api/* ; or un 401 de la
  // couche de nav (ex. palette ouverte avant connexion) ne doit JAMAIS déconnecter
  // l'utilisateur. En passant par le fetch natif, la nav est totalement isolée de
  // cet intercepteur.
  var nativeFetch = (typeof window !== 'undefined' && window.fetch)
    ? window.fetch.bind(window)
    : fetch;

  // Récupère le token JWT exactement comme l'app existante : localStorage 'user'.
  function getToken() {
    try {
      var u = JSON.parse(localStorage.getItem('user') || '{}');
      return u && u.token ? u.token : '';
    } catch (e) {
      return '';
    }
  }

  // Wrapper fetch maison : seul endroit du front autorisé à parler à l'API de nav.
  // Injecte l'Authorization, gère le JSON et remonte une erreur lisible.
  function request(path, opts) {
    opts = opts || {};
    var headers = Object.assign({ 'Authorization': 'Bearer ' + getToken() }, opts.headers || {});
    return nativeFetch(API_BASE + path, { headers: headers, signal: opts.signal })
      .then(function (r) {
        if (!r.ok) {
          // On renvoie un tableau/objet vide plutôt que de faire planter l'UI de nav.
          return r.json().catch(function () { return {}; }).then(function (body) {
            var msg = (body && body.error) ? body.error : ('HTTP ' + r.status);
            var err = new Error(msg);
            err.status = r.status;
            throw err;
          });
        }
        return r.json();
      });
  }

  window.NavApi = {
    // Référentiel de navigation (écrans épinglés + actions rapides).
    getNav: function () {
      // Pas de token (ex. écran de connexion) → on n'appelle pas l'API : évite un
      // 401 inutile (et toute interférence avec l'authentification de l'app).
      if (!getToken()) return Promise.resolve({ ecrans: [], actions: [] });
      return request('/nav').catch(function () {
        return { ecrans: [], actions: [] };
      });
    },

    // Recherche multi-entités. `signal` (AbortSignal) optionnel pour annuler
    // une requête périmée — complète le token de version géré côté composant.
    searchRecords: function (q, signal) {
      var query = (q || '').trim();
      if (query.length < 2 || !getToken()) return Promise.resolve([]);
      return request('/search?q=' + encodeURIComponent(query), { signal: signal })
        .catch(function (err) {
          // Une annulation (AbortError) n'est pas une vraie erreur : on l'avale.
          if (err && err.name === 'AbortError') return [];
          console.warn('[NavApi.searchRecords]', err.message);
          return [];
        });
    },

    // Aperçu léger d'une entité (type ∈ prospect|affaire|devis|interlocuteur).
    getPeek: function (type, id) {
      if (!type || id == null || !getToken()) return Promise.resolve(null);
      return request('/peek/' + encodeURIComponent(type) + '/' + encodeURIComponent(id))
        .catch(function (err) {
          console.warn('[NavApi.getPeek]', err.message);
          return null;
        });
    }
  };
})();
