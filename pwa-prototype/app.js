'use strict';

/* ── Config ─────────────────────────────────────────────
   API par défaut = prod. Éditable dans l'écran de connexion.
   IMPORTANT : aucune réponse API n'est mise en cache (voir sw.js). */
const DEFAULT_API = 'https://crm.texaswin.fr/api';
const LS_API = 'pwa_api_base';

/* Le token JWT reste en mémoire de l'onglet uniquement (sessionStorage) :
   jamais dans le cache du service worker, effacé à la fermeture. */
let TOKEN = sessionStorage.getItem('pwa_token') || null;
let USER = null;
let CONTACTS = [];

const $ = (id) => document.getElementById(id);

/* ── Helpers ── */
function apiBase() {
  return (localStorage.getItem(LS_API) || DEFAULT_API).replace(/\/+$/, '');
}
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.hidden = true; }, 2600);
}
function initials(prenom, nom) {
  const a = (prenom || '').trim()[0] || '';
  const b = (nom || '').trim()[0] || '';
  return (a + b).toUpperCase() || '?';
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ── Appel API (jamais mis en cache : requêtes cross-origin,
      ignorées par le SW ; en plus cache:'no-store' explicite) ── */
async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && TOKEN) headers['Authorization'] = 'Bearer ' + TOKEN;
  const res = await fetch(apiBase() + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || `Erreur ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

/* ── Navigation entre écrans ── */
function showLogin() {
  $('login-view').hidden = false;
  $('data-view').hidden = true;
}
function showData() {
  $('login-view').hidden = true;
  $('data-view').hidden = false;
  $('who-name').textContent = USER ? (USER.name || USER.email || 'Connecté') : 'Connecté';
  $('who-api').textContent = apiBase();
}

/* ── Connexion ── */
async function doLogin(e) {
  e.preventDefault();
  const btn = $('login-btn');
  const err = $('login-error');
  err.hidden = true;

  const base = $('api-base').value.trim() || DEFAULT_API;
  localStorage.setItem(LS_API, base);

  btn.disabled = true;
  btn.textContent = 'Connexion…';
  try {
    const data = await api('/auth/login', {
      method: 'POST',
      auth: false,
      body: { email: $('email').value.trim(), password: $('password').value },
    });
    if (!data || !data.token) throw new Error('Réponse inattendue du serveur (pas de token).');
    TOKEN = data.token;
    USER = data.user || { email: $('email').value.trim() };
    sessionStorage.setItem('pwa_token', TOKEN);
    showData();
    loadContacts();
  } catch (ex) {
    err.textContent = ex.message.includes('Failed to fetch')
      ? "Impossible de joindre l'API (réseau / CORS). Vérifie l'URL de l'API."
      : ex.message;
    err.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Se connecter';
  }
}

/* ── Chargement des contacts (démo : appel réel de l'API) ── */
async function loadContacts() {
  const box = $('contacts');
  box.innerHTML = '<div class="empty">Chargement…</div>';
  try {
    const data = await api('/brevo/audience?type=all');
    CONTACTS = Array.isArray(data) ? data : (data && data.contacts) || [];
    renderStats();
    renderContacts($('search').value);
  } catch (ex) {
    if (/401|403|token|jwt/i.test(ex.message)) {
      toast('Session expirée, reconnecte-toi.');
      return logout();
    }
    box.innerHTML = `<div class="empty">Échec du chargement : ${esc(ex.message)}</div>`;
  }
}

function renderStats() {
  const societes = new Set(CONTACTS.map((c) => c.societe).filter(Boolean));
  const withEmail = CONTACTS.filter((c) => c.email);
  $('stat-societes').textContent = societes.size;
  $('stat-contacts').textContent = withEmail.length;
}

function renderContacts(filter) {
  const q = (filter || '').toLowerCase().trim();
  const box = $('contacts');
  const list = CONTACTS.filter((c) => {
    if (!q) return true;
    return [c.prenom, c.nom, c.societe, c.email, c.fonction]
      .some((v) => (v || '').toLowerCase().includes(q));
  });

  if (!list.length) {
    box.innerHTML = '<div class="empty">Aucun contact.</div>';
    return;
  }

  box.innerHTML = list.slice(0, 400).map((c) => {
    const nom = [c.prenom, c.nom].filter(Boolean).join(' ') || '(sans nom)';
    const meta = [c.fonction, c.email].filter(Boolean).join(' · ') || '—';
    const st = c.statut_societe || '';
    const stClass = ['Client', 'Prospect', 'Suspect'].includes(st) ? st : '';
    return `<div class="row">
      <div class="avatar">${esc(initials(c.prenom, c.nom))}</div>
      <div class="col">
        <div class="name">${esc(nom)}</div>
        <div class="meta">${esc(c.societe || '')}${c.societe ? ' — ' : ''}${esc(meta)}</div>
      </div>
      ${st ? `<span class="tag ${stClass}">${esc(st)}</span>` : ''}
    </div>`;
  }).join('') + (list.length > 400 ? `<div class="empty">… ${list.length - 400} de plus (affichage limité)</div>` : '');
}

/* ── Déconnexion ── */
function logout() {
  TOKEN = null;
  USER = null;
  CONTACTS = [];
  sessionStorage.removeItem('pwa_token');
  showLogin();
}

/* ── Init ── */
function init() {
  $('api-base').value = apiBase();
  $('login-form').addEventListener('submit', doLogin);
  $('logout-btn').addEventListener('click', logout);
  $('search').addEventListener('input', (e) => renderContacts(e.target.value));

  if (TOKEN) {
    showData();
    loadContacts();
  } else {
    showLogin();
  }

  /* Service worker : app-shell uniquement, JAMAIS l'API. */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then((reg) => console.log('[PWA] service worker enregistré :', reg.scope))
        .catch((err) => console.error('[PWA] échec enregistrement service worker :', err));
    });
  }
}

document.addEventListener('DOMContentLoaded', init);
