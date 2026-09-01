import * as React from 'react';

// ===================================================================
// CampagnesLibrary — écran Campagnes repensé (tranche 1)
// Centré sur l'envoi : cockpit « audience joignable » + tableau des
// brouillons Brevo (Actif/Archivé) + panneau Lancer / Relancer.
// Réutilise les endpoints Brevo déjà en prod :
//   GET  /brevo/campaigns?status=draft   → les brouillons (messages)
//   GET  /brevo/campaign-statuts         → statut Actif/Archivé (CRM)
//   POST /brevo/campaign-statuts/:id     → ranger Actif/Archivé
//   GET  /brevo/envois                   → dernier envoi par campagne
//   GET  /brevo/audience?type=all        → cockpit + segments (RGPD)
//   GET  /brevo/campaign-stats/:id       → non-ouvreurs (pour Relancer)
//   POST /brevo/send-campaign            → lancer / relancer
//   POST /brevo/send-test                → envoi de test
// Non couvert dans cette tranche : programmation (Brevo scheduledAt) et
// listes nommées — ajoutés dans les tranches suivantes.
// ===================================================================
export function CampagnesLibrary({ user, API_URL }) {
  const [drafts, setDrafts] = React.useState([]);
  const [statuts, setStatuts] = React.useState({});
  const [lastSend, setLastSend] = React.useState({}); // { [brevoId]: {date, nb, envoiId} }
  const [audience, setAudience] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [filter, setFilter] = React.useState('actif'); // 'actif' | 'archive'
  const [rates, setRates] = React.useState({}); // { [brevoId]: {open, click} } chargé à la demande
  const [drawer, setDrawer] = React.useState(null); // { mode:'send'|'relance', draft, ... }
  const [feedback, setFeedback] = React.useState(null);

  const token = () => (user && user.token) ? user.token : '';
  const authH = () => ({ 'Authorization': 'Bearer ' + token(), 'Content-Type': 'application/json' });

  const load = React.useCallback(() => {
    setLoading(true); setError(null);
    const H = { 'Authorization': 'Bearer ' + token() };
    Promise.all([
      fetch(`${API_URL}/brevo/campaigns?status=draft`, { headers: H }).then(r => r.json().then(d => ({ ok: r.ok, d }))),
      fetch(`${API_URL}/brevo/campaign-statuts`, { headers: H }).then(r => r.json()).catch(() => ({ statuts: {} })),
      fetch(`${API_URL}/brevo/envois?limit=100`, { headers: H }).then(r => r.json()).catch(() => ({ envois: [] })),
      fetch(`${API_URL}/brevo/audience?type=all`, { headers: H }).then(r => r.json()).catch(() => ({ contacts: [] })),
    ]).then(([camp, st, env, aud]) => {
      if (!camp.ok) { setError(camp.d.error || 'Erreur de chargement des campagnes Brevo'); }
      else setDrafts(camp.d.campaigns || []);
      setStatuts((st && st.statuts) || {});
      // Dernier envoi par campagne source (le plus récent avec un statut envoyé)
      const map = {};
      (env.envois || []).forEach(e => {
        const src = e.brevo_campaign_id_source;
        if (!src) return;
        const when = e.sent_at || e.created_at;
        if (!map[src] || new Date(when) > new Date(map[src].date)) {
          map[src] = { date: when, nb: e.nb_contacts_envoyes, envoiId: e.brevo_campaign_id_envoi || src };
        }
      });
      setLastSend(map);
      setAudience(aud.contacts || []);
    }).catch(e => setError('Erreur réseau : ' + e.message))
      .finally(() => setLoading(false));
  }, [API_URL]);
  React.useEffect(() => { load(); }, [load]);

  // ── Cockpit : 4 états RGPD dérivés de l'audience ──
  const cockpit = React.useMemo(() => {
    let joignable = 0, attente = 0, desabo = 0, jamais = 0;
    audience.forEach(c => {
      if (c.accept_emailing === true) joignable++;
      else if (c.emailing_unsubscribed_at) desabo++;
      else if (c.demande_optin === true || c.optin_token_envoye_at) attente++;
      else jamais++;
    });
    return { joignable, attente, desabo, jamais };
  }, [audience]);

  // Contacts joignables d'un segment commercial, selon le type de consentement :
  //  - 'emailing' → accept_emailing (emailing commercial)
  //  - 'notes'    → accept_notes_info (notes d'information)
  // RGPD : on ne cible QUE les contacts ayant donné le consentement correspondant.
  const joignablesForSegment = React.useCallback((seg, decideurOnly, consent = 'emailing') => {
    const map = { client: ['Client'], prospect: ['Prospect'], suspect: ['Suspect'], all: null };
    const allowed = map[seg];
    const okConsent = (c) => consent === 'notes' ? c.accept_notes_info === true : c.accept_emailing === true;
    return audience.filter(c =>
      okConsent(c) &&
      (!allowed || allowed.includes(c.statut_societe)) &&
      (!decideurOnly || c.decideur === true)
    );
  }, [audience]);

  // ── Chargement paresseux des taux d'ouverture/clic du dernier envoi ──
  const loadRates = React.useCallback((brevoId, envoiId) => {
    if (!envoiId || rates[brevoId]) return;
    fetch(`${API_URL}/brevo/campaign-stats/${envoiId}`, { headers: { 'Authorization': 'Bearer ' + token() } })
      .then(r => r.json()).then(d => {
        const a = d.aggregated;
        if (a) setRates(prev => ({ ...prev, [brevoId]: { open: a.tauxOuverture, click: a.tauxClic, recipients: d.recipients || [] } }));
      }).catch(() => {});
  }, [API_URL, rates]);

  React.useEffect(() => {
    // Précharge les taux des campagnes déjà envoyées (quelques appels).
    drafts.forEach(c => { const ls = lastSend[c.id]; if (ls) loadRates(c.id, ls.envoiId); });
  }, [drafts, lastSend, loadRates]);

  const statutOf = (id) => (statuts[id] && statuts[id].statut) || 'actif';
  const rows = drafts.map(c => ({ ...c, statut: statutOf(c.id), ls: lastSend[c.id] || null, rate: rates[c.id] || null }));
  const shown = rows.filter(r => r.statut === filter);
  const nActif = rows.filter(r => r.statut === 'actif').length;
  const nArch = rows.filter(r => r.statut === 'archive').length;

  const setStatut = (id, statut) => {
    setStatuts(prev => ({ ...prev, [id]: { ...(prev[id] || {}), statut } })); // optimiste
    fetch(`${API_URL}/brevo/campaign-statuts/${id}`, { method: 'POST', headers: authH(), body: JSON.stringify({ statut }) })
      .catch(() => load());
  };

  const toast = (type, msg) => { setFeedback({ type, msg }); if (window.showToast) window.showToast({ title: msg, type }); };

  // ── Envoi de test ──
  const sendTest = (draftId) => {
    fetch(`${API_URL}/brevo/send-test`, { method: 'POST', headers: authH(), body: JSON.stringify({ campaignId: draftId }) })
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => toast(ok ? 'success' : 'error', ok ? `Test envoyé à ${d.sent_to || 'ta boîte'}.` : `Erreur test : ${d.error}`))
      .catch(e => toast('error', 'Erreur : ' + e.message));
  };

  return (
    <div>
      {feedback && (
        <div style={{ padding: '11px 14px', borderRadius: '8px', marginBottom: '14px', fontSize: '13px', background: feedback.type === 'success' ? 'var(--success-soft)' : 'var(--danger-soft)', color: feedback.type === 'success' ? 'var(--success)' : 'var(--danger)' }}>{feedback.msg}</div>
      )}

      <Cockpit c={cockpit} loading={loading} />

      {/* En-tête tableau */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', margin: '26px 0 12px', flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--tw-ink)', margin: 0 }}>Vos campagnes</h2>
        <span style={{ fontSize: '12.5px', color: 'var(--tw-muted)' }}>vos brouillons Brevo — à lancer sur une liste, autant de fois que voulu</span>
        <div style={{ marginLeft: 'auto', display: 'inline-flex', background: 'var(--tw-bg)', borderRadius: '999px', padding: '3px' }}>
          {[['actif', 'Actives', nActif], ['archive', 'Archivées', nArch]].map(([f, lab, n]) => (
            <button key={f} onClick={() => setFilter(f)} style={{ border: 'none', background: filter === f ? 'white' : 'transparent', boxShadow: filter === f ? 'var(--sh-sm)' : 'none', padding: '6px 14px', borderRadius: '999px', fontSize: '12.5px', fontWeight: 600, color: filter === f ? 'var(--tw-ink)' : 'var(--tw-slate)', cursor: 'pointer', fontFamily: 'inherit' }}>{lab} <span style={{ opacity: .55 }}>{n}</span></button>
          ))}
        </div>
      </div>

      {/* Tableau */}
      <div style={{ background: 'white', border: '1px solid var(--tw-border)', borderRadius: '14px', boxShadow: 'var(--sh-sm)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px' }}>
            <thead>
              <tr>
                {['Campagne', 'Statut', 'Date d\'envoi', 'Ouverts', 'Clics', ''].map((h, i) => (
                  <th key={i} style={{ textAlign: i >= 3 && i <= 4 ? 'right' : 'left', fontSize: '11px', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--tw-muted)', padding: '12px 18px', borderBottom: '1px solid var(--tw-border)', whiteSpace: 'nowrap', background: 'var(--tw-bg)', width: i === 0 ? '100%' : undefined }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ padding: '30px', textAlign: 'center', color: 'var(--tw-muted)' }}>Chargement…</td></tr>
              ) : error ? (
                <tr><td colSpan={6} style={{ padding: '24px', color: 'var(--danger)' }}>Erreur : {error}</td></tr>
              ) : shown.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: '26px', textAlign: 'center', color: 'var(--tw-muted)', fontSize: '13px' }}>{filter === 'actif' ? 'Aucune campagne active. Créez un brouillon dans Brevo, il apparaîtra ici.' : 'Aucune campagne archivée.'}</td></tr>
              ) : shown.map(r => (
                <CampRow key={r.id} r={r}
                  onLancer={() => setDrawer({ mode: 'send', draft: r })}
                  onRelancer={() => setDrawer({ mode: 'relance', draft: r })}
                  onArchive={() => setStatut(r.id, 'archive')}
                  onReactivate={() => setStatut(r.id, 'actif')}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {drawer && (
        <SendDrawer drawer={drawer} audience={audience} rates={rates}
          joignablesForSegment={joignablesForSegment}
          onClose={() => setDrawer(null)}
          onDone={(msg) => { setDrawer(null); toast('success', msg); load(); }}
          onError={(msg) => toast('error', msg)}
          onTest={sendTest} API_URL={API_URL} authH={authH} />
      )}
    </div>
  );
}

// ── Cockpit ──
function Cockpit({ c, loading }) {
  const State = ({ n, k, tone, title }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '13px', background: 'white', border: '1px solid var(--tw-border)', borderRadius: '12px', padding: '13px 16px', boxShadow: 'var(--sh-sm)' }}>
      <div><div style={{ fontSize: '20px', fontWeight: 800, lineHeight: 1, color: tone || 'var(--tw-ink)' }}>{loading ? '—' : n}</div><div style={{ fontSize: '12.5px', color: 'var(--tw-muted)' }} title={title}>{k}</div></div>
    </div>
  );
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: '18px' }}>
      <div style={{ background: 'white', border: '1px solid var(--tw-border)', borderRadius: '18px', padding: '22px 24px', boxShadow: 'var(--sh-sm)' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase', color: 'var(--tw-muted)' }}>Audience joignable</div>
        <div style={{ fontSize: '48px', fontWeight: 800, lineHeight: 1, margin: '8px 0 2px', color: 'var(--tw-ink)', fontVariantNumeric: 'tabular-nums' }}>{loading ? '—' : c.joignable}</div>
        <div style={{ fontSize: '14px', color: 'var(--tw-slate)' }}>contacts vous ont donné leur accord — <b style={{ color: 'var(--tw-ink)' }}>vous pouvez leur écrire maintenant</b>.</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <State n={c.attente} k="en attente d'accord" tone="var(--warning)" title="Demande d'opt-in en cours" />
        <State n={c.jamais} k="jamais sollicités" title="Aucune demande de consentement envoyée" />
        <State n={c.desabo} k="désabonnés (exclus)" tone="var(--danger)" title="Opt-out" />
      </div>
    </div>
  );
}

// ── Ligne de campagne ──
function CampRow({ r, onLancer, onRelancer, onArchive, onReactivate }) {
  const td = { padding: '13px 18px', borderBottom: '1px solid var(--tw-border)', verticalAlign: 'middle' };
  const ib = (variant) => ({ border: variant === 'primary' ? 'none' : '1px solid var(--tw-border-strong, rgba(17,24,39,.16))', background: variant === 'primary' ? 'var(--primary)' : 'none', color: variant === 'primary' ? '#fff' : 'var(--tw-slate)', padding: '7px 13px', borderRadius: '999px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' });
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : null;
  const sent = !!r.ls;
  const archived = r.statut === 'archive';
  return (
    <tr>
      <td style={{ ...td, width: '100%' }}>
        <div style={{ fontWeight: 700, lineHeight: 1.25, color: 'var(--tw-ink)' }}>{r.name || `Campagne #${r.id}`}</div>
        {r.subject && <div style={{ fontSize: '12px', color: 'var(--tw-muted)', marginTop: '1px' }}>« {r.subject} »</div>}
      </td>
      <td style={{ ...td, whiteSpace: 'nowrap' }}>
        <span style={{ fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '999px', background: archived ? 'var(--tw-bg)' : sent ? 'var(--success-soft)' : 'var(--tw-bg)', color: archived ? 'var(--tw-muted)' : sent ? 'var(--success)' : 'var(--tw-muted)' }}>
          {archived ? 'Archivé' : sent ? 'Actif · envoyée' : 'Actif · brouillon'}
        </span>
      </td>
      <td style={{ ...td, whiteSpace: 'nowrap', color: 'var(--tw-slate)' }}>{sent ? `${r.ls.nb || 0} contacts · ${fmtDate(r.ls.date)}` : (archived ? '—' : 'jamais lancée')}</td>
      <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.rate ? <b>{r.rate.open}%</b> : (sent ? '…' : '—')}</td>
      <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.rate ? <b>{r.rate.click}%</b> : (sent ? '…' : '—')}</td>
      <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
        <span style={{ display: 'inline-flex', gap: '6px', justifyContent: 'flex-end' }}>
          {!archived && <button onClick={onLancer} style={ib('primary')}>Lancer</button>}
          {!archived && <button onClick={onRelancer} disabled={!sent} title={sent ? 'Relancer les non-ouvreurs' : 'Relance disponible après le premier envoi'} style={{ ...ib('ghost'), opacity: sent ? 1 : .4, cursor: sent ? 'pointer' : 'default' }}>Relancer</button>}
          {!archived && <button onClick={onArchive} style={ib('ghost')}>Archiver</button>}
          {archived && <button onClick={onReactivate} style={ib('ghost')}>Réactiver</button>}
        </span>
      </td>
    </tr>
  );
}

// ── Panneau Lancer / Relancer ──
function SendDrawer({ drawer, audience, rates, joignablesForSegment, onClose, onDone, onError, onTest, API_URL, authH }) {
  const { mode, draft } = drawer;
  const [consentType, setConsentType] = React.useState('emailing'); // 'emailing' | 'notes'
  const [seg, setSeg] = React.useState('prospect');
  const [decideurs, setDecideurs] = React.useState(false);
  const [relanceCible, setRelanceCible] = React.useState('nonopen'); // nonopen | untouched | all
  const [sending, setSending] = React.useState(false);

  // Non-ouvreurs du dernier envoi (via les stats déjà chargées)
  const emailToId = React.useMemo(() => { const m = {}; audience.forEach(c => { if (c.email) m[c.email.toLowerCase()] = c.id; }); return m; }, [audience]);
  const nonOpenerIds = React.useMemo(() => {
    const rr = (rates[draft.id] && rates[draft.id].recipients) || [];
    return rr.filter(x => x.delivered && !x.opened && !x.unsubscribed)
      .map(x => emailToId[(x.email || '').toLowerCase()]).filter(Boolean);
  }, [rates, draft.id, emailToId]);

  const allJoignableIds = React.useMemo(() => joignablesForSegment('all', false, consentType).map(c => c.id), [joignablesForSegment, consentType]);
  const alreadyIds = React.useMemo(() => {
    const rr = (rates[draft.id] && rates[draft.id].recipients) || [];
    return new Set(rr.map(x => emailToId[(x.email || '').toLowerCase()]).filter(Boolean));
  }, [rates, draft.id, emailToId]);
  const untouchedIds = allJoignableIds.filter(id => !alreadyIds.has(id));

  // Mode Lancer : liste des contacts du segment + consentement choisis, sélectionnables
  // (l'utilisateur peut en décocher avant l'envoi). La sélection se réinitialise à « tous »
  // quand la liste change (segment / type d'envoi / décideurs).
  const segContacts = React.useMemo(
    () => mode === 'send' ? joignablesForSegment(seg, decideurs, consentType) : [],
    [mode, seg, decideurs, consentType, joignablesForSegment]
  );
  const [selectedIds, setSelectedIds] = React.useState(() => new Set());
  React.useEffect(() => { setSelectedIds(new Set(segContacts.map(c => c.id))); }, [segContacts]);
  const toggleOne = (id) => setSelectedIds(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Cible effective + count
  let contactIds, count;
  if (mode === 'relance') {
    contactIds = relanceCible === 'nonopen' ? nonOpenerIds : relanceCible === 'untouched' ? untouchedIds : allJoignableIds;
  } else {
    contactIds = segContacts.filter(c => selectedIds.has(c.id)).map(c => c.id);
  }
  count = contactIds.length;

  const verb = mode === 'relance' ? 'Relancer' : 'Lancer sur';

  const doSend = () => {
    if (count === 0) { onError('Aucun contact joignable pour cette cible.'); return; }
    if (!window.confirm(`${verb} ${count} contact(s) — « ${draft.name} » ?`)) return;
    setSending(true);
    fetch(`${API_URL}/brevo/send-campaign`, { method: 'POST', headers: authH(), body: JSON.stringify({ campaignId: draft.id, contactIds, mode: 'normal', consent: consentType, filtres: { source: mode, consent: consentType } }) })
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) throw new Error(d.error || 'Envoi échoué');
        onDone(`« ${draft.name} » ${mode === 'relance' ? 'relancée' : 'lancée'} : ${d.nb_contacts_envoyes || count} envoi(s).`);
      })
      .catch(e => { onError('Erreur : ' + e.message); setSending(false); });
  };

  const lbl = { fontSize: '11px', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--tw-muted)', marginBottom: '10px' };
  const pill = (on) => ({ padding: '8px 14px', borderRadius: '999px', border: '1px solid var(--tw-border-strong, rgba(17,24,39,.16))', background: on ? 'var(--primary)' : 'white', color: on ? '#fff' : 'var(--tw-ink)', fontSize: '13px', fontWeight: on ? 600 : 500, cursor: 'pointer', fontFamily: 'inherit' });

  return (
    <div>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(11,20,44,.45)', zIndex: 3000 }} />
      <aside role="dialog" aria-modal="true" style={{ position: 'fixed', top: 0, right: 0, height: '100%', width: '440px', maxWidth: '94vw', background: 'white', boxShadow: 'var(--sh-md)', zIndex: 3001, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '20px 22px', borderBottom: '1px solid var(--tw-border)' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--tw-muted)' }}>{mode === 'relance' ? 'Relancer' : 'Lancer sur une liste'}</div>
          <h3 style={{ fontSize: '17px', fontWeight: 700, margin: '4px 0 0', color: 'var(--tw-ink)' }}>{draft.name}</h3>
        </div>
        <div style={{ padding: '20px 22px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Base de consentement : détermine QUELS contacts sont ciblés (RGPD) */}
          <div>
            <div style={lbl}>Type d'envoi</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {[['emailing', 'Emailing commercial', 'accept_emailing'], ['notes', "Notes d'information", 'accept_notes_info']].map(([v, t]) => (
                <button key={v} onClick={() => setConsentType(v)} style={{ flex: 1, ...pill(consentType === v), textAlign: 'center' }}>{t}</button>
              ))}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--tw-muted)', marginTop: '8px' }}>
              {consentType === 'notes'
                ? 'Cible uniquement les contacts ayant accepté les notes d\'information.'
                : 'Cible uniquement les contacts ayant accepté l\'emailing commercial.'}
            </div>
          </div>
          {mode === 'relance' ? (
            <div>
              <div style={lbl}>Relancer qui ?</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
                {[['nonopen', 'Les non-ouvreurs du dernier envoi', 'n\'ont pas ouvert le message', nonOpenerIds.length],
                  ['untouched', 'Contacts joignables non encore touchés', 'n\'ont jamais reçu cette campagne', untouchedIds.length],
                  ['all', 'Toute l\'audience joignable', 'renvoi à tous ceux qui ont accepté', allJoignableIds.length]].map(([v, t, s, n]) => (
                  <button key={v} onClick={() => setRelanceCible(v)} style={{ display: 'flex', alignItems: 'flex-start', gap: '11px', border: '1px solid ' + (relanceCible === v ? 'var(--primary)' : 'var(--tw-border-strong, rgba(17,24,39,.16))'), background: relanceCible === v ? 'var(--primary-soft)' : 'white', borderRadius: '12px', padding: '13px 15px', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
                    <div style={{ flex: 1 }}><div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--tw-ink)' }}>{t}</div><div style={{ fontSize: '12px', color: 'var(--tw-muted)', marginTop: '1px' }}>{s}</div></div>
                    <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--primary)', fontVariantNumeric: 'tabular-nums' }}>{n}</span>
                  </button>
                ))}
              </div>
              {relanceCible === 'nonopen' && nonOpenerIds.length === 0 && (
                <div style={{ fontSize: '12px', color: 'var(--tw-muted)', marginTop: '10px' }}>Les statistiques d'ouverture ne sont pas encore disponibles (ou tout le monde a ouvert).</div>
              )}
            </div>
          ) : (
            <div>
              <div style={lbl}>Sur quelle liste — segment rapide</div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                {[['client', 'Clients'], ['prospect', 'Prospects'], ['suspect', 'Suspects'], ['all', 'Tous']].map(([v, t]) => (
                  <button key={v} onClick={() => setSeg(v)} style={pill(seg === v)}>{t} <span style={{ fontSize: '11px', opacity: .7 }}>{joignablesForSegment(v, decideurs, consentType).length}</span></button>
                ))}
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--tw-slate)', cursor: 'pointer', marginLeft: '4px' }}>
                  <input type="checkbox" checked={decideurs} onChange={e => setDecideurs(e.target.checked)} /> Décideurs
                </label>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--tw-muted)', marginTop: '12px' }}>Les listes nommées réutilisables arrivent dans une prochaine version.</div>

              {/* Liste des contacts ciblés : décochez ceux que vous ne voulez pas inclure */}
              <div style={{ marginTop: '18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={lbl} title="Contacts resultant du segment + type d'envoi">Contacts ciblés — <b style={{ color: 'var(--primary)' }}>{selectedIds.size}</b>/{segContacts.length}</div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={() => setSelectedIds(new Set(segContacts.map(c => c.id)))} style={{ fontSize: '11.5px', fontWeight: 600, padding: '3px 9px', border: '1px solid var(--tw-border-strong, rgba(17,24,39,.16))', borderRadius: '999px', background: 'white', color: 'var(--tw-slate)', cursor: 'pointer', fontFamily: 'inherit' }}>Tout cocher</button>
                    <button onClick={() => setSelectedIds(new Set())} style={{ fontSize: '11.5px', fontWeight: 600, padding: '3px 9px', border: '1px solid var(--tw-border-strong, rgba(17,24,39,.16))', borderRadius: '999px', background: 'white', color: 'var(--tw-slate)', cursor: 'pointer', fontFamily: 'inherit' }}>Tout décocher</button>
                  </div>
                </div>
                {segContacts.length === 0 ? (
                  <div style={{ fontSize: '12.5px', color: 'var(--tw-muted)', fontStyle: 'italic', padding: '10px 0' }}>Aucun contact pour ce segment et ce type d'envoi.</div>
                ) : (
                  <div style={{ border: '1px solid var(--tw-border)', borderRadius: '10px', maxHeight: '260px', overflowY: 'auto' }}>
                    {segContacts.map(c => {
                      const on = selectedIds.has(c.id);
                      return (
                        <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', borderBottom: '0.5px solid var(--tw-border)', cursor: 'pointer', fontSize: '13px', opacity: on ? 1 : .5 }}>
                          <input type="checkbox" checked={on} onChange={() => toggleOne(c.id)} />
                          <span style={{ fontWeight: 600, color: 'var(--tw-ink)', flexShrink: 0, minWidth: '130px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[c.prenom, c.nom].filter(Boolean).join(' ') || '—'}</span>
                          <span style={{ color: 'var(--tw-slate)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.societe || ''}</span>
                          <span style={{ color: 'var(--tw-muted)', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '150px' }}>{c.email}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
          <div style={{ fontSize: '12px', color: 'var(--tw-slate)', background: 'var(--tw-bg)', borderRadius: '10px', padding: '11px 13px', lineHeight: 1.45 }}>
            Les désabonnés sont exclus automatiquement.{mode === 'relance' ? ' Le message est renvoyé sans le recréer dans Brevo.' : ''}
          </div>
        </div>
        <div style={{ padding: '16px 22px', borderTop: '1px solid var(--tw-border)', display: 'flex', gap: '10px', alignItems: 'center', background: 'var(--tw-bg)' }}>
          <button onClick={() => onTest(draft.id)} style={{ padding: '10px 16px', borderRadius: '999px', border: '1px solid var(--tw-border-strong, rgba(17,24,39,.16))', background: 'white', color: 'var(--tw-ink)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Envoyer un test</button>
          <button onClick={doSend} disabled={sending || count === 0} style={{ marginLeft: 'auto', padding: '10px 18px', borderRadius: '999px', border: 'none', background: (sending || count === 0) ? 'var(--tw-border-strong, #ccc)' : 'var(--primary)', color: '#fff', fontSize: '13.5px', fontWeight: 700, cursor: (sending || count === 0) ? 'default' : 'pointer', fontFamily: 'inherit' }}>{sending ? 'Envoi…' : `${verb} ${count} contact${count > 1 ? 's' : ''}`}</button>
        </div>
      </aside>
    </div>
  );
}
