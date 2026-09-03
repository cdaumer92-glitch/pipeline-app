'use strict';

/* ── Config ─────────────────────────────────────────────
   API par défaut = prod. Éditable dans l'écran de connexion.
   IMPORTANT : aucune réponse API n'est mise en cache (voir sw.js). */
const DEFAULT_API = 'https://crm.texaswin.fr/api';
const LS_API = 'pwa_api_base';

/* Miroir de src/lib/constants.js (proto en lecture seule sur l'existant). */
const ACTION_TYPES = ['Appel', 'Relance', 'Email', 'À faire', 'Point technique', 'Démo', 'Négociation', 'Signature'];
const ACTORS = ['Christian', 'Roger', 'Frederic'];

/* Le token JWT reste en mémoire de l'onglet uniquement (sessionStorage) :
   jamais dans le cache du service worker, effacé à la fermeture. */
let TOKEN = sessionStorage.getItem('pwa_token') || null;
let USER = null;
let SOCIETES = [];
let ACTIONS = [];
let LIST_MODE = 'societes'; // 'societes' | 'actions'
let CURRENT = null;      // société ouverte dans la fiche
let ACTIVE_TAB = null;
let CONTACTS_ROWS = [];  // contacts de l'onglet Contacts en cours (pour la fiche détail)
let FICHE_ACTIONS = [];  // actions de l'onglet Actions en cours (pour l'édition)

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
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function initials(a, b) {
  const x = (a || '').trim()[0] || '';
  const y = (b || '').trim()[0] || '';
  return (x + y).toUpperCase() || '?';
}
function euro(n) {
  const v = Number(n || 0);
  if (!v) return '—';
  return v.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
}
function tagClass(st) {
  return ['Client', 'Prospect', 'Suspect', 'Prestataire'].includes(st) ? st : '';
}
function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
/* Échéance : retourne { label, cls } relatif à aujourd'hui. */
function dueInfo(dateStr) {
  if (!dateStr) return { label: 'sans date', cls: 'none' };
  const d = startOfDay(dateStr), today = startOfDay(new Date());
  const days = Math.round((d - today) / 86400000);
  const fmt = d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  if (days < 0) return { label: `En retard · ${fmt}`, cls: 'late' };
  if (days === 0) return { label: `Aujourd'hui`, cls: 'today' };
  if (days === 1) return { label: `Demain · ${fmt}`, cls: 'soon' };
  if (days <= 7) return { label: `Dans ${days} j · ${fmt}`, cls: 'soon' };
  return { label: fmt, cls: 'far' };
}
function addDays(n) { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + n); return d; }
function nextMonday() { const d = new Date(); d.setHours(0, 0, 0, 0); const diff = ((8 - d.getDay()) % 7) || 7; d.setDate(d.getDate() + diff); return d; }
/* ISO local (évite le décalage d'un jour de toISOString qui est en UTC). */
function toISO(d) { const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 10); }
function frDate(d) { return (d instanceof Date ? d : new Date(d + 'T00:00:00')).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }); }

/* ── Appel API (jamais mis en cache) ── */
async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && TOKEN) headers['Authorization'] = 'Bearer ' + TOKEN;
  const res = await fetch(apiBase() + path, {
    method, headers,
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || `Erreur ${res.status}`;
    const err = new Error(msg); err.status = res.status; throw err;
  }
  return data;
}
function handleAuthError(ex) {
  if (ex.status === 401 || ex.status === 403 || /token|jwt/i.test(ex.message)) {
    toast('Session expirée, reconnecte-toi.');
    logout();
    return true;
  }
  return false;
}

/* ── Navigation entre écrans ── */
function show(view) {
  for (const v of ['login-view', 'list-view', 'fiche-view']) $(v).hidden = (v !== view);
}
function showLogin() { show('login-view'); }
function showList() {
  show('list-view');
  $('who-name').textContent = USER ? (USER.name || USER.email || 'Connecté') : 'Connecté';
  $('who-api').textContent = apiBase();
}

/* ── Connexion ── */
async function doLogin(e) {
  e.preventDefault();
  const btn = $('login-btn'), err = $('login-error');
  err.hidden = true;
  const base = $('api-base').value.trim() || DEFAULT_API;
  localStorage.setItem(LS_API, base);
  btn.disabled = true; btn.textContent = 'Connexion…';
  try {
    const data = await api('/auth/login', {
      method: 'POST', auth: false,
      body: { email: $('email').value.trim(), password: $('password').value },
    });
    if (!data || !data.token) throw new Error('Réponse inattendue du serveur (pas de token).');
    TOKEN = data.token;
    USER = data.user || { email: $('email').value.trim() };
    sessionStorage.setItem('pwa_token', TOKEN);
    showList();
    loadSocietes();
    loadActions(); // précharge le compteur d'actions (badge visible d'emblée)
  } catch (ex) {
    err.textContent = /Failed to fetch/.test(ex.message)
      ? "Impossible de joindre l'API (réseau / CORS). Vérifie l'URL de l'API."
      : ex.message;
    err.hidden = false;
  } finally {
    btn.disabled = false; btn.textContent = 'Se connecter';
  }
}

/* ── Liste des sociétés (appel réel : /prospects/enriched) ── */
async function loadSocietes() {
  const box = $('societes');
  box.innerHTML = '<div class="empty">Chargement…</div>';
  try {
    const data = await api('/prospects/enriched');
    SOCIETES = Array.isArray(data) ? data : [];
    const clients = SOCIETES.filter((s) => (s.statut_societe || s.status) === 'Client').length;
    $('stat-societes').textContent = SOCIETES.length;
    $('stat-clients').textContent = clients;
    renderSocietes($('search').value);
  } catch (ex) {
    if (handleAuthError(ex)) return;
    box.innerHTML = `<div class="empty">Échec du chargement : ${esc(ex.message)}</div>`;
  }
}

function renderSocietes(filter) {
  const q = (filter || '').toLowerCase().trim();
  const box = $('societes');
  const list = SOCIETES.filter((s) => {
    if (!q) return true;
    return [s.name, s.ville, s.secteur].some((v) => (v || '').toLowerCase().includes(q));
  });
  if (!list.length) { box.innerHTML = '<div class="empty">Aucune société.</div>'; return; }

  box.innerHTML = list.slice(0, 500).map((s) => {
    const st = s.statut_societe || s.status || '';
    const nbAff = Array.isArray(s.affaires_detail) ? s.affaires_detail.length : 0;
    const loc = [s.ville, s.cp].filter(Boolean).join(' ');
    const meta = [loc, s.secteur].filter(Boolean).join(' · ') || '—';
    return `<button class="row link" data-id="${s.id}">
      <div class="avatar">${esc(initials(s.name, s.name && s.name.slice(1)))}</div>
      <div class="col">
        <div class="name">${esc(s.name || '(sans nom)')}</div>
        <div class="meta">${esc(meta)}</div>
      </div>
      ${nbAff ? `<span class="pill">${nbAff} aff.</span>` : ''}
      ${st ? `<span class="tag ${tagClass(st)}">${esc(st)}</span>` : ''}
      <span class="chev">›</span>
    </button>`;
  }).join('');
  box.querySelectorAll('.row.link').forEach((el) =>
    el.addEventListener('click', () => openFiche(Number(el.dataset.id))));
}

/* ── Bascule Sociétés / Actions ── */
function setMode(mode) {
  LIST_MODE = mode;
  $('seg-societes').classList.toggle('active', mode === 'societes');
  $('seg-actions').classList.toggle('active', mode === 'actions');
  $('mode-societes').hidden = mode !== 'societes';
  $('mode-actions').hidden = mode !== 'actions';
  if (mode === 'actions' && !ACTIONS.length) loadActions();
}

/* ── Marquer une action faite (écriture : PUT /next_actions/:id) ── */
async function markActionDone(id) {
  try {
    await api(`/next_actions/${id}`, { method: 'PUT', body: { completed: true } });
    return true;
  } catch (ex) {
    if (handleAuthError(ex)) return false;
    toast('Échec : ' + ex.message);
    return false;
  }
}
/* ── Reporter / snooze (écriture : PUT /next_actions/:id reschedule) ── */
let SNOOZE_CTX = null; // { id, onDone }
function openSnooze(id, onDone) {
  SNOOZE_CTX = { id, onDone };
  const presets = [
    { label: 'Demain', d: addDays(1) },
    { label: 'Dans 3 jours', d: addDays(3) },
    { label: 'Dans 1 semaine', d: addDays(7) },
    { label: 'Lundi prochain', d: nextMonday() },
  ];
  $('sheet-presets').innerHTML = presets.map((p) =>
    `<button class="preset" data-iso="${toISO(p.d)}"><span>${p.label}</span><em>${frDate(p.d)}</em></button>`).join('');
  $('sheet-presets').querySelectorAll('.preset').forEach((el) =>
    el.addEventListener('click', () => applySnooze(el.dataset.iso)));
  $('sheet-date').value = toISO(addDays(1));
  $('sheet').hidden = false;
}
function closeSnooze() { $('sheet').hidden = true; SNOOZE_CTX = null; }
async function applySnooze(iso) {
  if (!SNOOZE_CTX || !iso) return;
  const { id, onDone } = SNOOZE_CTX;
  try {
    await api(`/next_actions/${id}`, { method: 'PUT', body: { reschedule: true, planned_date: iso } });
  } catch (ex) {
    if (handleAuthError(ex)) return;
    toast('Échec : ' + ex.message);
    return;
  }
  closeSnooze();
  toast('Reportée au ' + frDate(iso));
  if (onDone) onDone(iso);
}

/* ── Créer une action (écriture : POST /prospects/:id/next_actions) ── */
let AF_PRIO = 1;
let AF_EDIT_ID = null;    // null = création ; sinon édition
let AF_EDIT_NOTE = null;  // completed_note à préserver en édition
let AF_PROSPECT_ID = null; // société cible (fiche courante OU prospect de l'action éditée)
async function openActionSheet(action) {
  const editing = action && action.id;
  // société cible : celle de l'action (liste globale) sinon la fiche ouverte
  AF_PROSPECT_ID = editing ? (action.prospect_id || (CURRENT && CURRENT.id)) : (CURRENT && CURRENT.id);
  if (!AF_PROSPECT_ID) return;
  AF_EDIT_ID = editing ? action.id : null;
  AF_EDIT_NOTE = editing ? (action.completed_note || null) : null;

  $('af-title').textContent = editing ? "Modifier l'action" : 'Nouvelle action';
  $('af-submit').textContent = editing ? 'Enregistrer' : "Créer l'action";
  $('af-delete').hidden = !editing;

  // Type
  $('af-type').innerHTML = ACTION_TYPES.map((t) => `<option>${esc(t)}</option>`).join('');
  $('af-type').value = editing && ACTION_TYPES.includes(action.action_type) ? action.action_type : ACTION_TYPES[0];
  // Acteur (inclut un acteur existant hors liste, le cas échéant)
  const defActor = USER && ACTORS.includes(USER.name) ? USER.name : '';
  const wantActor = editing ? (action.actor || '') : defActor;
  const actorOpts = [...new Set([wantActor, ...ACTORS].filter(Boolean))];
  $('af-actor').innerHTML = `<option value="">— Acteur —</option>` +
    actorOpts.map((a) => `<option>${esc(a)}</option>`).join('');
  $('af-actor').value = wantActor || '';
  // Date / contact / priorité
  $('af-date').value = editing && action.planned_date ? String(action.planned_date).slice(0, 10) : toISO(addDays(0));
  $('af-contact').value = editing ? (action.contact || '') : '';
  $('af-contacts').innerHTML = '';
  setActionPrio(editing ? (Number(action.priority) || 1) : 1);
  $('af-error').hidden = true;
  $('action-sheet').hidden = false;

  // Autocomplétion des contacts de la société (datalist). Best-effort :
  // en cas d'échec, le champ reste en saisie libre.
  try {
    const rows = await api(`/prospects/${AF_PROSPECT_ID}/interlocuteurs`);
    const opts = (Array.isArray(rows) ? rows : [])
      .map((c) => ({ n: [c.prenom, c.nom].filter(Boolean).join(' ').trim(), f: c.fonction }))
      .filter((x) => x.n);
    $('af-contacts').innerHTML = opts
      .map((x) => `<option value="${esc(x.n)}">${x.f ? esc(x.f) : ''}</option>`).join('');
  } catch (_) { /* saisie libre */ }
}
function closeActionSheet() { $('action-sheet').hidden = true; }
function setActionPrio(p) {
  AF_PRIO = p;
  document.querySelectorAll('#action-sheet .prio').forEach((el) =>
    el.classList.toggle('active', Number(el.dataset.prio) === p));
}
async function submitActionSheet() {
  if (!AF_PROSPECT_ID) return;
  const btn = $('af-submit'), err = $('af-error');
  const editing = !!AF_EDIT_ID;
  err.hidden = true;
  const body = {
    action_type: $('af-type').value,
    planned_date: $('af-date').value || null,
    actor: $('af-actor').value || null,
    contact: $('af-contact').value.trim() || null,
    priority: AF_PRIO,
  };
  if (!body.action_type) { err.textContent = 'Choisis un type.'; err.hidden = false; return; }
  btn.disabled = true; btn.textContent = editing ? 'Enregistrement…' : 'Création…';
  try {
    if (editing) {
      await api(`/next_actions/${AF_EDIT_ID}`, { method: 'PUT', body: { ...body, edit: true, completed_note: AF_EDIT_NOTE } });
    } else {
      await api(`/prospects/${AF_PROSPECT_ID}/next_actions`, { method: 'POST', body });
    }
    closeActionSheet();
    toast(editing ? 'Action modifiée ✅' : 'Action créée ✅');
    refreshAfterActionChange();
  } catch (ex) {
    if (handleAuthError(ex)) return;
    err.textContent = 'Échec : ' + ex.message; err.hidden = false;
  } finally {
    btn.disabled = false; btn.textContent = editing ? 'Enregistrer' : "Créer l'action";
  }
}
async function deleteAction() {
  if (!AF_EDIT_ID) return;
  if (!confirm('Supprimer définitivement cette action ?')) return;
  const btn = $('af-delete');
  btn.disabled = true; btn.textContent = 'Suppression…';
  try {
    await api(`/next_actions/${AF_EDIT_ID}`, { method: 'DELETE' });
    closeActionSheet();
    toast('Action supprimée');
    refreshAfterActionChange();
  } catch (ex) {
    if (handleAuthError(ex)) return;
    $('af-error').textContent = 'Échec : ' + ex.message; $('af-error').hidden = false;
  } finally {
    btn.disabled = false; btn.textContent = "Supprimer l'action";
  }
}
/* Recharge la vue concernée après création/édition/suppression d'action. */
function refreshAfterActionChange() {
  if (!$('fiche-view').hidden && ACTIVE_TAB === 'actions') selectTab('actions'); // onglet fiche visible
  loadActions(); // liste globale + badge/compteurs
}

/* Tri de la liste globale, par urgence :
   1) Aujourd'hui puis les retards, du plus récent au plus ancien
   2) puis les actions à venir (demain, plus tard), les plus proches d'abord
   3) puis les actions sans date.
   À rang/date égale, priorité haute d'abord. */
function sortActionsByDate() {
  const today = startOfDay(new Date()).getTime();
  const rank = (a) => {
    if (!a.planned_date) return 2;                                   // sans date
    return startOfDay(a.planned_date).getTime() <= today ? 0 : 1;    // 0 = aujourd'hui/retard, 1 = à venir
  };
  ACTIONS.sort((a, b) => {
    const ra = rank(a), rb = rank(b);
    if (ra !== rb) return ra - rb;
    if (ra === 2) return Number(b.priority || 1) - Number(a.priority || 1);
    const ta = startOfDay(a.planned_date).getTime(), tb = startOfDay(b.planned_date).getTime();
    if (ta !== tb) return ra === 0 ? (tb - ta) : (ta - tb);          // rang 0 décroissant, rang 1 croissant
    return Number(b.priority || 1) - Number(a.priority || 1);
  });
}
function recomputeActionStats() {
  const retard = ACTIONS.filter((a) => a.planned_date && startOfDay(a.planned_date) < startOfDay(new Date())).length;
  $('stat-actions-total').textContent = ACTIONS.length;
  $('stat-actions-retard').textContent = retard;
  const badge = $('seg-actions-badge');
  badge.textContent = ACTIONS.length; badge.hidden = !ACTIONS.length;
}

/* ── Actions à faire (appel réel : /lists/actions) ── */
async function loadActions() {
  const box = $('actions');
  box.innerHTML = '<div class="empty">Chargement…</div>';
  try {
    const data = await api('/lists/actions');
    ACTIONS = Array.isArray(data) ? data : [];
    sortActionsByDate();
    recomputeActionStats();
    renderActions($('search-actions').value);
  } catch (ex) {
    if (handleAuthError(ex)) return;
    box.innerHTML = `<div class="empty">Échec du chargement : ${esc(ex.message)}</div>`;
  }
}

function renderActions(filter) {
  const q = (filter || '').toLowerCase().trim();
  const box = $('actions');
  const list = ACTIONS.filter((a) => {
    if (!q) return true;
    return [a.prospect_name, a.action_type, a.contact, a.actor].some((v) => (v || '').toLowerCase().includes(q));
  });
  if (!list.length) { box.innerHTML = '<div class="empty">Aucune action à faire. 🎉</div>'; return; }

  box.innerHTML = list.slice(0, 500).map((a) => {
    const due = dueInfo(a.planned_date);
    const meta = [a.prospect_name, a.contact, a.actor && ('→ ' + a.actor)].filter(Boolean).join(' · ') || '—';
    const prio = Number(a.priority) >= 3 ? '<span class="pill hot">Prioritaire</span>' : '';
    return `<div class="row">
      <button class="check" data-done="${a.id}" title="Marquer faite" aria-label="Marquer faite"></button>
      <button class="col open" data-pid="${a.prospect_id}">
        <div class="name">${esc(a.action_type || 'Action')} ${prio}</div>
        <div class="meta">${esc(meta)}</div>
      </button>
      <span class="due ${due.cls}">${esc(due.label)}</span>
      <button class="iconbtn" data-edit-g="${a.id}" title="Modifier" aria-label="Modifier">✏️</button>
      <button class="snooze" data-snooze="${a.id}" title="Reporter" aria-label="Reporter">⏰</button>
    </div>`;
  }).join('');
  box.querySelectorAll('.col.open').forEach((el) =>
    el.addEventListener('click', () => openFiche(Number(el.dataset.pid))));
  box.querySelectorAll('.check').forEach((el) =>
    el.addEventListener('click', (e) => onCheckGlobalAction(e.currentTarget)));
  box.querySelectorAll('.snooze').forEach((el) =>
    el.addEventListener('click', () => onSnoozeGlobalAction(Number(el.dataset.snooze))));
  box.querySelectorAll('[data-edit-g]').forEach((el) =>
    el.addEventListener('click', () => openActionSheet(ACTIONS.find((x) => x.id === Number(el.dataset.editG)))));
}

function onSnoozeGlobalAction(id) {
  openSnooze(id, (iso) => {
    const a = ACTIONS.find((x) => x.id === id);
    if (a) a.planned_date = iso;
    sortActionsByDate();
    recomputeActionStats();
    renderActions($('search-actions').value);
  });
}

async function onCheckGlobalAction(btn) {
  const id = Number(btn.dataset.done);
  btn.disabled = true; btn.classList.add('checked');
  const ok = await markActionDone(id);
  if (!ok) { btn.disabled = false; btn.classList.remove('checked'); return; }
  ACTIONS = ACTIONS.filter((a) => a.id !== id);
  recomputeActionStats();
  renderActions($('search-actions').value);
  toast('Action marquée faite ✅');
}

/* ── Fiche société + onglets ── */
const TABS = [
  { key: 'infos',      label: 'Infos' },
  { key: 'actions',    label: 'Actions' },
  { key: 'notes',      label: 'Notes' },
  { key: 'contacts',   label: 'Contacts' },
  { key: 'sites',      label: 'Sites' },
  { key: 'boutiques',  label: 'Boutiques' },
  { key: 'affaires',   label: 'Affaires' },
  { key: 'licences',   label: 'Licences' },
  { key: 'materiel',   label: 'Matériel' },
];

function openFiche(id) {
  CURRENT = SOCIETES.find((s) => s.id === id) || { id, name: '—' };
  show('fiche-view');
  const st = CURRENT.statut_societe || CURRENT.status || '';
  $('fiche-avatar').textContent = initials(CURRENT.name, CURRENT.name && CURRENT.name.slice(1));
  $('fiche-name').textContent = CURRENT.name || '—';
  const loc = [CURRENT.ville, CURRENT.cp].filter(Boolean).join(' ');
  $('fiche-sub').textContent = [loc, CURRENT.secteur].filter(Boolean).join(' · ') || '—';
  const tag = $('fiche-tag');
  tag.textContent = st; tag.className = 'tag ' + tagClass(st); tag.hidden = !st;

  // barre d'onglets
  $('tabs').innerHTML = TABS.map((t) =>
    `<button class="tab" role="tab" data-tab="${t.key}">${t.label}</button>`).join('');
  $('tabs').querySelectorAll('.tab').forEach((el) =>
    el.addEventListener('click', () => selectTab(el.dataset.tab)));
  window.scrollTo(0, 0);
  selectTab('infos');
}

function selectTab(key) {
  ACTIVE_TAB = key;
  $('tabs').querySelectorAll('.tab').forEach((el) =>
    el.classList.toggle('active', el.dataset.tab === key));
  const panel = $('tab-panel');
  if (key === 'infos') { panel.innerHTML = renderInfos(CURRENT); return; }

  panel.innerHTML = '<div class="empty">Chargement…</div>';
  const id = CURRENT.id;
  const routes = {
    actions:   `/prospects/${id}/actions-all`,
    notes:     `/prospects/${id}/notes`,
    contacts:  `/prospects/${id}/interlocuteurs`,
    sites:     `/prospects/${id}/sites`,
    boutiques: `/prospects/${id}/boutiques`,
    affaires:  `/prospects/${id}/affaires`,
    licences:  `/prospects/${id}/licences`,
    materiel:  `/prospects/${id}/materiel`,
  };
  api(routes[key])
    .then((data) => {
      if (ACTIVE_TAB !== key) return;        // onglet changé entre-temps
      const rows = Array.isArray(data) ? data : [];
      const render = {
        actions: renderFicheActions, notes: renderNotes,
        contacts: renderContacts, sites: renderSites, boutiques: renderBoutiques,
        affaires: renderAffaires, licences: renderLicences, materiel: renderMateriel,
      }[key];
      panel.innerHTML = render(rows);
    })
    .catch((ex) => {
      if (handleAuthError(ex)) return;
      if (ACTIVE_TAB === key) panel.innerHTML = `<div class="empty">Échec : ${esc(ex.message)}</div>`;
    });
}

/* ── Rendus par onglet ── */
function kv(label, value) {
  return `<div class="kv"><span class="k">${esc(label)}</span><span class="v">${value == null || value === '' ? '—' : esc(value)}</span></div>`;
}
function renderInfos(s) {
  const money = `<div class="money">
    <div class="m"><div class="mv">${euro(s.real_setup_amount ?? s.setup_amount)}</div><div class="mk">Setup</div></div>
    <div class="m"><div class="mv">${euro(s.real_monthly_amount ?? s.monthly_amount)}</div><div class="mk">Mensuel</div></div>
    <div class="m"><div class="mv">${euro(s.real_annual_amount ?? s.annual_amount)}</div><div class="mk">Annuel</div></div>
  </div>`;
  return `<div class="card panel-card">
    ${money}
    ${kv('Statut', s.statut_societe || s.status)}
    ${kv('Secteur', s.secteur)}
    ${kv('Ville', [s.cp, s.ville].filter(Boolean).join(' '))}
    ${kv('Téléphone', s.tel_standard || s.phone)}
    ${kv('Email société', s.email_societe || s.email)}
    ${kv('Site web', s.website)}
    ${kv('SIREN', s.siren)}
    ${kv('Code NAF', s.code_naf)}
    ${kv('Version TW', s.tw_version)}
    ${kv('Commercial', s.assigned_to)}
    ${Array.isArray(s.marques) && s.marques.length ? kv('Marques', s.marques.join(', ')) : ''}
  </div>`;
}
function empty(msg) { return `<div class="card"><div class="empty">${esc(msg)}</div></div>`; }

function renderFicheActions(rows) {
  FICHE_ACTIONS = rows;
  const addBtn = `<button class="btn btn-primary add-action">+ Nouvelle action</button>`;
  if (!rows.length) {
    setTimeout(() => {
      const b = document.querySelector('#tab-panel .add-action');
      if (b) b.addEventListener('click', () => openActionSheet());
    }, 0);
    return addBtn + empty('Aucune action.');
  }
  // À faire (completed=0) d'abord, triées par date ; puis les faites.
  const todo = rows.filter((a) => Number(a.completed) === 0)
    .sort((a, b) => String(a.planned_date || '').localeCompare(String(b.planned_date || '')));
  const done = rows.filter((a) => Number(a.completed) === 1)
    .sort((a, b) => String(b.completed_date || b.planned_date || '').localeCompare(String(a.completed_date || a.planned_date || '')));

  const rowHtml = (a, isDone) => {
    const due = dueInfo(a.planned_date);
    const meta = [a.nom_affaire, a.contact, a.actor && ('→ ' + a.actor)].filter(Boolean).join(' · ') || '—';
    const left = isDone
      ? '<div class="ico">☑️</div>'
      : `<button class="check" data-fdone="${a.id}" title="Marquer faite" aria-label="Marquer faite"></button>`;
    const right = isDone
      ? '<span class="pill">Fait</span>'
      : `<span class="due ${due.cls}">${esc(due.label)}</span>
         <button class="snooze" data-fsnooze="${a.id}" title="Reporter" aria-label="Reporter">⏰</button>`;
    const body = isDone
      ? `<div class="col"><div class="name">${esc(a.action_type || 'Action')}</div><div class="meta">${esc(meta)}</div></div>`
      : `<button class="col open" data-edit="${a.id}" title="Modifier">
           <div class="name">${esc(a.action_type || 'Action')}</div>
           <div class="meta">${esc(meta)}</div>
         </button>`;
    return `<div class="row${isDone ? ' done' : ''}">${left}${body}${right}</div>`;
  };

  let html = addBtn + '<div class="list">';
  if (todo.length) html += `<div class="grouplab">À faire (${todo.length})</div>` + todo.map((a) => rowHtml(a, false)).join('');
  if (done.length) html += `<div class="grouplab">Historique (${done.length})</div>` + done.slice(0, 50).map((a) => rowHtml(a, true)).join('');
  html += '</div>';

  // brancher les contrôles après insertion dans le DOM
  setTimeout(() => {
    const add = document.querySelector('#tab-panel .add-action');
    if (add) add.addEventListener('click', () => openActionSheet());
    document.querySelectorAll('#tab-panel .check[data-fdone]').forEach((el) =>
      el.addEventListener('click', (e) => onCheckFicheAction(e.currentTarget)));
    document.querySelectorAll('#tab-panel .snooze[data-fsnooze]').forEach((el) =>
      el.addEventListener('click', () => onSnoozeFicheAction(Number(el.dataset.fsnooze))));
    document.querySelectorAll('#tab-panel .col.open[data-edit]').forEach((el) =>
      el.addEventListener('click', () => openActionSheet(FICHE_ACTIONS.find((x) => x.id === Number(el.dataset.edit)))));
  }, 0);
  return html;
}

function onSnoozeFicheAction(id) {
  openSnooze(id, (iso) => {
    if (ACTIVE_TAB === 'actions') selectTab('actions'); // recharge et re-trie
    // garde la liste globale cohérente si elle est déjà chargée
    const a = ACTIONS.find((x) => x.id === id);
    if (a) { a.planned_date = iso; recomputeActionStats(); }
  });
}

async function onCheckFicheAction(btn) {
  const id = Number(btn.dataset.fdone);
  btn.disabled = true; btn.classList.add('checked');
  const ok = await markActionDone(id);
  if (!ok) { btn.disabled = false; btn.classList.remove('checked'); return; }
  // recharge l'onglet Actions pour regrouper À faire / Historique
  if (ACTIVE_TAB === 'actions') selectTab('actions');
  // invalide la liste globale (badge/compteurs) : rechargée à la prochaine ouverture
  ACTIONS = ACTIONS.filter((a) => a.id !== id);
  recomputeActionStats();
  toast('Action marquée faite ✅');
}

/* ── Notes ── */
function renderNotes(rows) {
  const addBtn = `<button class="btn btn-primary add-note">+ Nouvelle note</button>`;
  const list = Array.isArray(rows) ? rows : [];
  let html = addBtn;
  if (!list.length) {
    html += empty('Aucune note.');
  } else {
    html += '<div class="list">' + list.map((n) => {
      const when = n.created_at ? new Date(n.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
      const foot = [n.created_by, when].filter(Boolean).join(' · ');
      return `<div class="note-card">
        <div class="note-body">${esc(n.contenu || '')}</div>
        ${foot ? `<div class="note-foot">${esc(foot)}</div>` : ''}
      </div>`;
    }).join('') + '</div>';
  }
  setTimeout(() => {
    const b = document.querySelector('#tab-panel .add-note');
    if (b) b.addEventListener('click', openNoteSheet);
  }, 0);
  return html;
}
function openNoteSheet() {
  if (!CURRENT) return;
  $('nf-text').value = '';
  $('nf-error').hidden = true;
  $('note-sheet').hidden = false;
  setTimeout(() => $('nf-text').focus(), 50);
}
function closeNoteSheet() { $('note-sheet').hidden = true; }
async function submitNote() {
  if (!CURRENT) return;
  const btn = $('nf-submit'), err = $('nf-error');
  err.hidden = true;
  const contenu = $('nf-text').value.trim();
  if (!contenu) { err.textContent = 'La note est vide.'; err.hidden = false; return; }
  btn.disabled = true; btn.textContent = 'Ajout…';
  try {
    await api(`/prospects/${CURRENT.id}/notes`, { method: 'POST', body: { contenu } });
    closeNoteSheet();
    toast('Note ajoutée ✅');
    if (ACTIVE_TAB === 'notes') selectTab('notes');
  } catch (ex) {
    if (handleAuthError(ex)) return;
    err.textContent = 'Échec : ' + ex.message; err.hidden = false;
  } finally {
    btn.disabled = false; btn.textContent = 'Ajouter la note';
  }
}

function contactBadges(c) {
  return [
    c.principal ? '<span class="pill hot">Principal</span>' : '',
    c.decideur ? '<span class="pill">Décideur</span>' : '',
    c.est_secondaire ? '<span class="pill ext">Externe</span>' : '',
  ].join('');
}
function renderContacts(rows) {
  CONTACTS_ROWS = rows;
  if (!rows.length) return empty('Aucun contact.');
  const html = `<div class="list">` + rows.map((c, i) => {
    const nom = [c.prenom, c.nom].filter(Boolean).join(' ') || '(sans nom)';
    const line = [c.fonction, c.email].filter(Boolean).join(' · ') || '—';
    const phones = [
      c.telephone ? '📱 ' + c.telephone : '',
      c.telephone_fixe ? '📞 ' + c.telephone_fixe : '',
    ].filter(Boolean).join('    ');
    const autres = Array.isArray(c.autres_societes) && c.autres_societes.length
      ? `<div class="meta subtle">aussi chez ${esc(c.autres_societes.map((a) => a.name).join(', '))}</div>` : '';
    return `<button class="row link" data-cidx="${i}">
      <div class="avatar">${esc(initials(c.prenom, c.nom))}</div>
      <div class="col">
        <div class="name">${esc(nom)} ${contactBadges(c)}</div>
        <div class="meta">${esc(line)}</div>
        ${phones ? `<div class="meta phones">${esc(phones)}</div>` : ''}
        ${autres}
      </div>
      <span class="chev">›</span>
    </button>`;
  }).join('') + `</div>`;
  setTimeout(() => {
    document.querySelectorAll('#tab-panel .row.link[data-cidx]').forEach((el) =>
      el.addEventListener('click', () => openContactDetail(Number(el.dataset.cidx))));
  }, 0);
  return html;
}

/* ── Fiche contact détaillée ── */
function telHref(v) { return 'tel:' + String(v).replace(/[^\d+]/g, ''); }
function kvLink(label, href, text, ext) {
  return `<div class="kv"><span class="k">${esc(label)}</span>` +
    `<a class="v link-v" href="${esc(href)}"${ext ? ' target="_blank" rel="noopener"' : ''}>${esc(text)}</a></div>`;
}
function openContactDetail(idx) {
  const c = CONTACTS_ROWS[idx];
  if (!c) return;
  const nom = [c.civilite, c.prenom, c.nom].filter(Boolean).join(' ') || '(sans nom)';
  $('contact-avatar').textContent = initials(c.prenom, c.nom);
  $('contact-title').innerHTML = esc(nom) + ' ' + contactBadges(c);
  $('contact-sub').textContent = c.fonction || '—';

  const parts = [];
  if (c.telephone) parts.push(kvLink('📱 Mobile', telHref(c.telephone), c.telephone));
  if (c.telephone_fixe) parts.push(kvLink('📞 Fixe', telHref(c.telephone_fixe), c.telephone_fixe));
  if (c.email) parts.push(kvLink('✉️ Email', 'mailto:' + c.email, c.email));
  if (c.linkedin_url) parts.push(kvLink('in LinkedIn', c.linkedin_url, 'Profil', true));
  parts.push(kv('Emailing commercial', c.accept_emailing ? 'Oui' : 'Non'));
  parts.push(kv("Notes d'information", c.accept_notes_info ? 'Oui' : 'Non'));
  if (Array.isArray(c.autres_societes) && c.autres_societes.length)
    parts.push(kv('Aussi chez', c.autres_societes.map((a) => a.name).join(', ')));
  if (c.source) parts.push(kv('Source', [c.source, c.source_detail].filter(Boolean).join(' · ')));
  $('contact-body').innerHTML = `<div class="card panel-card">${parts.join('')}</div>`;
  $('contact-sheet').hidden = false;
}
function closeContactDetail() { $('contact-sheet').hidden = true; }
function renderSites(rows) {
  if (!rows.length) return empty('Aucun site.');
  return `<div class="list">` + rows.map((s) => {
    const addr = [s.adresse, [s.cp, s.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    const meta = [addr, s.telephone].filter(Boolean).join(' · ') || '—';
    const resp = s.responsable_nom ? `<div class="meta subtle">Resp. ${esc(s.responsable_nom)}</div>` : '';
    return `<div class="row">
      <div class="ico">🏢</div>
      <div class="col">
        <div class="name">${esc(s.nom || '(site)')} ${s.type ? `<span class="pill">${esc(s.type)}</span>` : ''}</div>
        <div class="meta">${esc(meta)}</div>${resp}
      </div>
    </div>`;
  }).join('') + `</div>`;
}
function renderBoutiques(rows) {
  if (!rows.length) return empty('Aucune boutique.');
  return `<div class="list">` + rows.map((b) => {
    const addr = [b.adresse, [b.cp, b.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    const meta = [addr, b.telephone].filter(Boolean).join(' · ') || '—';
    const resp = b.responsable_nom ? `<div class="meta subtle">Resp. ${esc(b.responsable_nom)}</div>` : '';
    return `<div class="row">
      <div class="ico">🛍️</div>
      <div class="col">
        <div class="name">${esc(b.nom || '(boutique)')}</div>
        <div class="meta">${esc(meta)}</div>${resp}
      </div>
    </div>`;
  }).join('') + `</div>`;
}
function renderAffaires(rows) {
  if (!rows.length) return empty('Aucune affaire.');
  return `<div class="list">` + rows.map((a) => {
    const st = a.statut_global || '';
    const stc = st === 'Gagné' ? 'Client' : st === 'Perdu' ? 'Suspect' : 'Prospect';
    const line = [euro(a.setup_amount) !== '—' ? 'Setup ' + euro(a.setup_amount) : '',
                  euro(a.monthly_amount) !== '—' ? 'Mens. ' + euro(a.monthly_amount) : '',
                  euro(a.annual_amount) !== '—' ? 'Ann. ' + euro(a.annual_amount) : '']
                  .filter(Boolean).join(' · ') || '—';
    return `<div class="row">
      <div class="ico">📁</div>
      <div class="col">
        <div class="name">${esc(a.nom_affaire || '(affaire)')} ${st ? `<span class="tag ${stc}">${esc(st)}</span>` : ''}</div>
        <div class="meta">${esc(line)}${a.nb_devis ? ` · ${a.nb_devis} devis` : ''}</div>
      </div>
    </div>`;
  }).join('') + `</div>`;
}
function renderLicences(rows) {
  if (!rows.length) return empty('Aucune licence.');
  return `<div class="list">` + rows.map((l) => {
    const meta = [l.licence_type, l.nb_utilisateurs ? l.nb_utilisateurs + ' util.' : '', l.facturation, l.hebergement]
      .filter(Boolean).join(' · ') || '—';
    return `<div class="row">
      <div class="ico">🔑</div>
      <div class="col">
        <div class="name">${esc(l.licence_nom || l.code || '(licence)')}</div>
        <div class="meta">${esc(meta)}</div>
      </div>
    </div>`;
  }).join('') + `</div>`;
}
function renderMateriel(rows) {
  if (!rows.length) return empty('Aucun matériel.');
  return `<div class="list">` + rows.map((m) => {
    const title = [m.marque, m.modele].filter(Boolean).join(' ') || m.type_nom || '(matériel)';
    const meta = [m.type_nom, m.os, m.nb_unites ? m.nb_unites + ' u.' : '', m.boutique_nom, m.localisation]
      .filter(Boolean).join(' · ') || '—';
    return `<div class="row">
      <div class="ico">💻</div>
      <div class="col">
        <div class="name">${esc(title)}</div>
        <div class="meta">${esc(meta)}</div>
      </div>
    </div>`;
  }).join('') + `</div>`;
}

/* ── Déconnexion ── */
function logout() {
  TOKEN = null; USER = null; SOCIETES = []; ACTIONS = []; CURRENT = null;
  setMode('societes');
  sessionStorage.removeItem('pwa_token');
  showLogin();
}

/* ── Init ── */
function init() {
  $('api-base').value = apiBase();
  $('login-form').addEventListener('submit', doLogin);
  $('logout-btn').addEventListener('click', logout);
  $('logout-btn2').addEventListener('click', logout);
  $('back-btn').addEventListener('click', showList);
  $('search').addEventListener('input', (e) => renderSocietes(e.target.value));
  $('search-actions').addEventListener('input', (e) => renderActions(e.target.value));
  $('seg-societes').addEventListener('click', () => setMode('societes'));
  $('seg-actions').addEventListener('click', () => setMode('actions'));
  $('sheet-validate').addEventListener('click', () => applySnooze($('sheet-date').value));
  $('sheet').querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', closeSnooze));
  $('af-submit').addEventListener('click', submitActionSheet);
  $('action-sheet').querySelectorAll('[data-aclose]').forEach((el) => el.addEventListener('click', closeActionSheet));
  $('action-sheet').querySelectorAll('.prio').forEach((el) =>
    el.addEventListener('click', () => setActionPrio(Number(el.dataset.prio))));
  $('contact-sheet').querySelectorAll('[data-cclose]').forEach((el) => el.addEventListener('click', closeContactDetail));
  $('af-delete').addEventListener('click', deleteAction);
  $('nf-submit').addEventListener('click', submitNote);
  $('note-sheet').querySelectorAll('[data-nclose]').forEach((el) => el.addEventListener('click', closeNoteSheet));

  if (TOKEN) { showList(); loadSocietes(); loadActions(); } else { showLogin(); }

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
