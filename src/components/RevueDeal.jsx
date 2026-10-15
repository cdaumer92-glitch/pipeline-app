import * as React from 'react';
import { ACTION_TYPES } from '../lib/constants.js';
import { I, ICONS, IconBtn, displayName } from '../lib/shared.jsx';
import { REVUE_QUESTIONS, REVUE_TOTAL, REVUE_ETATS, etatInfo, emptyReponses, normalizeReponses, computeScore, scoreTone, daysSince, ageLabel, santeDeal, revueUrgence } from '../lib/revueDeal.js';

// ─── Revue de deal ─────────────────────────────────────────────────────────────
// Espace « Revue de deal » d'une affaire : qualification en six questions (état
// solide / partiel / inconnu + texte libre), score de santé, cascade des pourquoi
// jusqu'à la cause de fond, et une action corrective créée dans l'affaire.
// Les revues sont horodatées et signées ; l'historique reste consultable.
// Couleur de l'espace : violet, distinct des devis (bleu) et des actions (orange).

const C = { color: '#5a47b0', dark: '#45368a', bg: '#f4f2fb', border: '#cfc8ee' };
const FONT = "'Inter',sans-serif";

const fmtDate = (d) => {
  if (!d) return '—';
  const m = typeof d === 'string' ? d.match(/^(\d{4})-(\d{2})-(\d{2})/) : null;
  const dt = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(d);
  return Number.isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('fr-FR');
};
const isoPlusDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().split('T')[0]; };

// Pastille de santé (Kanban). Rouge pleine quand la revue est en retard, verte quand
// elle est récente. Rien si l'affaire n'a ni devis ni revue.
export function SantePill({ score, date, nbDevis, createdAt, size = 11, style }) {
  const s = santeDeal({ score, date, nbDevis });
  if (!s) return null;
  const u = revueUrgence({ score, date, nbDevis, createdAt });
  return (
    <span title={u.title} style={{ fontSize: `${size}px`, fontWeight: 600, padding: '2px 8px', borderRadius: '10px', background: u.bg, color: u.fg, border: `0.5px solid ${u.color}`, whiteSpace: 'nowrap', ...style }}>
      {u.level === 'urgent' ? 'À revoir' : s.label}
    </span>
  );
}

// Bouton « Revue de deal » de la ligne d'affaire : rouge plein quand le deal dure
// depuis trop longtemps sans revue, vert quand c'est acceptable (avec le score),
// neutre pour une affaire toute neuve. Un clic ouvre directement le formulaire.
export function RevueButton({ affaire, nbDevis, onClick }) {
  const u = revueUrgence({ score: affaire.revue_score, date: affaire.revue_date, nbDevis, createdAt: affaire.created_at });
  const urgent = u.level === 'urgent';
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); onClick(); }} title={u.title} data-testid={`revue-btn-${affaire.id}`} data-level={u.level}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 11px', borderRadius: '7px', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer', fontFamily: FONT, whiteSpace: 'nowrap',
        background: u.bg, color: u.fg, border: `1px solid ${u.color}`, boxShadow: urgent ? '0 1px 4px rgba(198,40,40,.4)' : 'none' }}
      onMouseEnter={(e) => { e.currentTarget.style.filter = 'brightness(.93)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.filter = 'none'; }}>
      <span style={{ display: 'inline-flex' }}>{I(ICONS.pulse, 12)}</span>
      {u.label}
    </button>
  );
}

const ScoreBar = ({ score }) => {
  const t = scoreTone(score);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'white', border: `0.5px solid ${C.border}`, borderRadius: '8px', padding: '8px 12px' }}>
      <span style={{ fontSize: '12px', fontWeight: 600, color: C.dark, whiteSpace: 'nowrap' }}>Santé du deal</span>
      <div style={{ flex: 1, height: '8px', borderRadius: '4px', background: '#e8e5f3', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${(Math.max(0, Math.min(REVUE_TOTAL, score)) / REVUE_TOTAL) * 100}%`, background: t.color, transition: 'width .2s' }} />
      </div>
      <span data-testid="revue-score" style={{ fontSize: '13px', fontWeight: 600, color: t.fg, whiteSpace: 'nowrap' }}>{score} / {REVUE_TOTAL} solides · {t.label}</span>
    </div>
  );
};

const EtatChip = ({ etat, size = 10 }) => {
  const e = etatInfo(etat);
  return (
    <span title={e.label} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: `${size + 8}px`, height: `${size + 8}px`, borderRadius: '5px', background: e.color, color: 'white', fontSize: `${size}px`, fontWeight: 700, flexShrink: 0 }}>
      {e.symbol}
    </span>
  );
};

const secTitle = (n, label, extra) => (
  <p style={{ margin: '0 0 8px', fontSize: '11px', fontWeight: 700, letterSpacing: '.4px', textTransform: 'uppercase', color: C.dark, display: 'flex', alignItems: 'center', gap: '8px' }}>
    {n}. {label} {extra}
  </p>
);

// ── Lecture d'une revue enregistrée ─────────────────────────────────────────
function RevueView({ revue }) {
  const reponses = normalizeReponses(revue.reponses);
  const pourquoi = Array.isArray(revue.pourquoi) ? revue.pourquoi.filter(Boolean) : [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div>
        {secTitle(1, 'Qualification')}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {REVUE_QUESTIONS.map(q => (
            <div key={q.key} style={{ display: 'grid', gridTemplateColumns: '22px 130px 1fr', gap: '8px', alignItems: 'start', padding: '6px 8px', background: 'white', border: '0.5px solid var(--tw-border)', borderRadius: '7px', fontSize: '12px' }}>
              <EtatChip etat={reponses[q.key].etat} />
              <span style={{ fontWeight: 600, color: 'var(--tw-ink)' }}>{q.label}</span>
              <span style={{ color: reponses[q.key].texte ? 'var(--tw-slate)' : 'var(--tw-muted)', fontStyle: reponses[q.key].texte ? 'normal' : 'italic', whiteSpace: 'pre-wrap' }}>{reponses[q.key].texte || 'Non renseigné'}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: '8px' }}><ScoreBar score={computeScore(reponses)} /></div>
      </div>
      {(pourquoi.length > 0 || revue.cause_fond) && (
        <div>
          {secTitle(2, 'Pourquoi ça n\'avance pas ?')}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {pourquoi.map((p, i) => (
              <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginLeft: `${Math.min(i, 4) * 18}px`, fontSize: '12px' }}>
                <span style={{ fontSize: '10px', fontWeight: 600, padding: '3px 7px', borderRadius: '10px', background: '#e8e5f3', color: C.dark, whiteSpace: 'nowrap', marginTop: '2px' }}>Pourquoi {i + 1}</span>
                <span style={{ flex: 1, background: 'white', border: '0.5px solid var(--tw-border)', borderRadius: '7px', padding: '6px 9px', color: 'var(--tw-slate)', whiteSpace: 'pre-wrap' }}>{p}</span>
              </div>
            ))}
            {revue.cause_fond && (
              <div style={{ marginLeft: `${Math.min(pourquoi.length, 4) * 18}px`, border: '1px solid #d85a30', borderRadius: '7px', padding: '7px 10px', background: '#faece7', color: '#4a1b0c', fontSize: '12px', whiteSpace: 'pre-wrap' }}>
                <span style={{ fontWeight: 700 }}>Cause de fond : </span>{revue.cause_fond}
              </div>
            )}
          </div>
        </div>
      )}
      {revue.action_corrective && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', border: '1px solid #1d9e75', borderRadius: '7px', padding: '7px 10px', background: '#e1f5ee', color: '#04342c', fontSize: '12px' }}>
          <span style={{ display: 'inline-flex', color: '#1d9e75', marginTop: '1px' }}>{I(ICONS.check, 13)}</span>
          <span style={{ flex: 1, whiteSpace: 'pre-wrap' }}><span style={{ fontWeight: 700 }}>Action corrective : </span>{revue.action_corrective}</span>
          {revue.action_id && <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: '10px', background: '#1d9e75', color: 'white', whiteSpace: 'nowrap' }}>Action créée</span>}
        </div>
      )}
    </div>
  );
}

// ── Formulaire d'une nouvelle revue ─────────────────────────────────────────
// Pré-rempli avec la dernière revue (réponses, pourquoi, cause) pour ne corriger
// que ce qui a changé ; l'action corrective est toujours nouvelle.
// initialAction : action proposée par la lecture assistée ({ texte, type, delai_jours }), reprise telle quelle.
function RevueForm({ affaire, initial, initialAction, user, API_URL, interlocuteurs, onSaved, onCancel }) {
  const [reponses, setReponses] = React.useState(() => initial ? normalizeReponses(initial.reponses) : emptyReponses());
  const [pourquoi, setPourquoi] = React.useState(() => (initial && Array.isArray(initial.pourquoi) && initial.pourquoi.length) ? initial.pourquoi.map(String) : ['']);
  const [cause, setCause] = React.useState((initial && initial.cause_fond) || '');
  const [actionTexte, setActionTexte] = React.useState((initialAction && initialAction.texte) || '');
  const [creerAction, setCreerAction] = React.useState(true);
  const [actionType, setActionType] = React.useState(() => (initialAction && ACTION_TYPES.includes(initialAction.type)) ? initialAction.type : 'Appel');
  const [actionDate, setActionDate] = React.useState(() => isoPlusDays((initialAction && Number(initialAction.delai_jours)) || 7));
  const [actionActor, setActionActor] = React.useState((user && user.name) || '');
  const [actionContact, setActionContact] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const score = computeScore(reponses);

  const setRep = (key, patch) => setReponses(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  const setWhy = (i, v) => setPourquoi(prev => prev.map((p, j) => (j === i ? v : p)));
  const addWhy = () => setPourquoi(prev => (prev.length >= 10 ? prev : [...prev, '']));
  const removeWhy = (i) => setPourquoi(prev => (prev.length <= 1 ? [''] : prev.filter((_, j) => j !== i)));

  const save = async () => {
    const texteAction = actionTexte.trim();
    const avecAction = creerAction && !!texteAction;
    if (avecAction && !actionDate) { window.showToast({ title: 'Date de l\'action manquante', type: 'warning' }); return; }
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/affaires/${affaire.id}/revues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${user.token}` },
        body: JSON.stringify({
          reponses,
          pourquoi: pourquoi.map(p => p.trim()).filter(Boolean),
          cause_fond: cause.trim(),
          action_corrective: texteAction,
          creer_action: avecAction,
          action_type: actionType,
          action_date: actionDate,
          action_actor: actionActor,
          action_contact: actionContact,
        })
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `HTTP ${res.status}`); }
      const saved = await res.json();
      window.showToast({ title: avecAction ? 'Revue enregistrée, action créée' : 'Revue enregistrée', type: 'success' });
      onSaved(saved);
    } catch (err) {
      console.error('Erreur enregistrement revue:', err);
      window.showToast({ title: 'Erreur : ' + err.message, type: 'error' });
    } finally { setSaving(false); }
  };

  const input = { width: '100%', boxSizing: 'border-box', padding: '7px 9px', border: '0.5px solid var(--tw-border)', borderRadius: '7px', fontSize: '12px', fontFamily: FONT, color: 'var(--tw-ink)', background: 'white', resize: 'vertical' };
  const select = { ...input, resize: 'none' };

  return (
    <div data-testid="revue-form" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }} onClick={(e) => e.stopPropagation()}>
      {/* 1. Qualification */}
      <div>
        {secTitle(1, 'Qualification', <span style={{ fontSize: '10px', fontWeight: 500, padding: '1px 7px', borderRadius: '10px', background: '#e8e5f3', color: C.dark, textTransform: 'none', letterSpacing: 0 }}>{REVUE_TOTAL} questions</span>)}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {REVUE_QUESTIONS.map(q => (
            <div key={q.key} style={{ display: 'grid', gridTemplateColumns: '130px 1fr auto', gap: '10px', alignItems: 'start', padding: '8px 10px', background: 'white', border: '0.5px solid var(--tw-border)', borderRadius: '8px' }}>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--tw-ink)' }}>{q.label}</div>
                <div style={{ fontSize: '10.5px', color: 'var(--tw-muted)', lineHeight: 1.35, marginTop: '2px' }}>{q.hint}</div>
              </div>
              <textarea rows={2} value={reponses[q.key].texte} onChange={(e) => setRep(q.key, { texte: e.target.value })}
                placeholder="Ce que l'on sait, en une phrase" style={input} data-testid={`revue-q-${q.key}`} />
              <div style={{ display: 'flex', gap: '4px' }} role="radiogroup" aria-label={`État : ${q.label}`}>
                {REVUE_ETATS.map(e => {
                  const on = reponses[q.key].etat === e.key;
                  return (
                    <button key={e.key} type="button" title={e.label} aria-pressed={on} data-testid={`revue-etat-${q.key}-${e.key}`}
                      onClick={() => setRep(q.key, { etat: e.key })}
                      style={{ width: '26px', height: '26px', borderRadius: '6px', border: `0.5px solid ${on ? e.color : 'var(--tw-border)'}`, background: on ? e.color : 'white', color: on ? 'white' : 'var(--tw-muted)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: FONT, padding: 0 }}>
                      {e.symbol}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: '8px' }}><ScoreBar score={score} /></div>
      </div>

      {/* 2. Cascade des pourquoi */}
      <div>
        {secTitle(2, 'Pourquoi ça n\'avance pas ?', <span style={{ fontSize: '10px', fontWeight: 500, padding: '1px 7px', borderRadius: '10px', background: '#e8e5f3', color: C.dark, textTransform: 'none', letterSpacing: 0 }}>cascade</span>)}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {pourquoi.map((p, i) => (
            <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginLeft: `${Math.min(i, 4) * 18}px` }}>
              <span style={{ fontSize: '10px', fontWeight: 600, padding: '4px 7px', borderRadius: '10px', background: '#e8e5f3', color: C.dark, whiteSpace: 'nowrap', marginTop: '4px', minWidth: '66px', textAlign: 'center' }}>Pourquoi {i + 1}</span>
              <textarea rows={1} value={p} onChange={(e) => setWhy(i, e.target.value)} data-testid={`revue-why-${i}`}
                placeholder={i === 0 ? 'Le constat : qu\'est-ce qui bloque ?' : 'Et pourquoi cela ?'} style={{ ...input, flex: 1, width: 'auto' }} />
              <IconBtn title="Retirer ce pourquoi" danger onClick={() => removeWhy(i)}>{I(ICONS.trash, 12)}</IconBtn>
            </div>
          ))}
          <div style={{ marginLeft: `${Math.min(pourquoi.length, 4) * 18}px` }}>
            <button type="button" onClick={addWhy} data-testid="revue-add-why"
              style={{ background: 'white', border: `1px dashed ${C.border}`, color: C.color, padding: '5px 11px', borderRadius: '7px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: FONT, display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              {I(ICONS.plus, 11)} Pourquoi
            </button>
          </div>
          <div style={{ marginLeft: `${Math.min(pourquoi.length, 4) * 18}px`, border: '1px solid #d85a30', borderRadius: '8px', padding: '8px 10px', background: '#faece7' }}>
            <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: '#4a1b0c', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: '4px' }}>Cause de fond</label>
            <textarea rows={2} value={cause} onChange={(e) => setCause(e.target.value)} data-testid="revue-cause"
              placeholder="Ce qu'il faut vraiment traiter (pas le symptôme)" style={{ ...input, background: 'white' }} />
          </div>
        </div>
      </div>

      {/* 3. Action corrective */}
      <div style={{ border: '1px solid #1d9e75', borderRadius: '8px', padding: '10px 12px', background: '#e1f5ee' }}>
        <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: '#04342c', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: '4px' }}>Action corrective</label>
        <textarea rows={2} value={actionTexte} onChange={(e) => setActionTexte(e.target.value)} data-testid="revue-action"
          placeholder="Une seule action, concrète, datée : qui fait quoi, pour quand ?" style={{ ...input, background: 'white' }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#04342c', marginTop: '8px', cursor: 'pointer' }}>
          <input type="checkbox" checked={creerAction} onChange={(e) => setCreerAction(e.target.checked)} style={{ accentColor: '#1d9e75' }} data-testid="revue-creer-action" />
          Créer cette action dans l'affaire
        </label>
        {creerAction && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '8px', marginTop: '8px' }}>
            <select value={actionType} onChange={(e) => setActionType(e.target.value)} style={select} data-testid="revue-action-type">
              {ACTION_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
            <input type="date" value={actionDate} onChange={(e) => setActionDate(e.target.value)} style={select} data-testid="revue-action-date" />
            <select value={actionActor} onChange={(e) => setActionActor(e.target.value)} style={select}>
              <option value="">-- De --</option>
              {['Christian', 'Roger', 'Frédéric'].map(n => <option key={n}>{n}</option>)}
            </select>
            <select value={actionContact} onChange={(e) => setActionContact(e.target.value)} style={select}>
              <option value="">-- À --</option>
              <option value="Interne">Interne</option>
              {(interlocuteurs || []).map(c => <option key={c.id} value={displayName(c)}>{displayName(c)}{c.fonction ? ` (${c.fonction})` : ''}</option>)}
            </select>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
        {!!initial && (
          <button type="button" onClick={onCancel} disabled={saving}
            style={{ background: 'white', border: '0.5px solid var(--tw-border)', color: 'var(--tw-slate)', padding: '7px 14px', borderRadius: '7px', fontSize: '12px', fontWeight: 500, cursor: 'pointer', fontFamily: FONT }}>
            Annuler
          </button>
        )}
        <button type="button" onClick={save} disabled={saving} data-testid="revue-save"
          style={{ background: C.color, border: 'none', color: 'white', padding: '7px 14px', borderRadius: '7px', fontSize: '12px', fontWeight: 600, cursor: saving ? 'wait' : 'pointer', fontFamily: FONT, boxShadow: '0 1px 3px rgba(90,71,176,.35)', opacity: saving ? .7 : 1 }}>
          {saving ? 'Enregistrement…' : (creerAction && actionTexte.trim() ? 'Enregistrer + créer l\'action' : 'Enregistrer la revue')}
        </button>
      </div>
    </div>
  );
}

// ── Contenu « Revue de deal » d'une affaire ─────────────────────────────────
// Affiché dans le panneau latéral droit (RevueDealDrawer). Sans revue existante,
// le formulaire s'ouvre directement ; sinon on voit la dernière revue, l'historique
// et un bouton pour en refaire une.
export function RevueDealContent({ affaire, user, API_URL, interlocuteurs, nbDevis, onChanged }) {
  const [revues, setRevues] = React.useState(null);
  const [formOpen, setFormOpen] = React.useState(false);
  const [showLast, setShowLast] = React.useState(false);
  const [histOpen, setHistOpen] = React.useState(false);
  const [viewId, setViewId] = React.useState(null);
  // Action proposée par la lecture assistée, reprise dans le formulaire (remonte le formulaire).
  const [actionProposee, setActionProposee] = React.useState(null);
  const rootRef = React.useRef(null);
  const reprendreAction = (action) => {
    setActionProposee({ ...action, _k: Date.now() });
    setFormOpen(true);
    setTimeout(() => { if (rootRef.current && rootRef.current.scrollIntoView) rootRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 50);
  };

  const load = React.useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/affaires/${affaire.id}/revues`, { headers: { 'Authorization': `Bearer ${user.token}` } });
      const data = res.ok ? await res.json() : [];
      setRevues(data);
      // Première revue : pas de détour, le formulaire tout de suite.
      if (!Array.isArray(data) || data.length === 0) setFormOpen(true);
    } catch (err) { console.error('Erreur chargement revues:', err); setRevues([]); }
  }, [API_URL, affaire.id, user.token]);
  React.useEffect(() => { load(); }, [load]);

  const list = revues || [];
  const derniere = list[0] || null;
  const anciennes = list.slice(1);
  const sante = santeDeal({ score: derniere && derniere.score, date: derniere && derniere.date_revue, nbDevis });

  const handleDelete = async (id) => {
    if (!window.confirm('Supprimer cette revue ? L\'action créée, elle, est conservée.')) return;
    try {
      const res = await fetch(`${API_URL}/revues/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${user.token}` } });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `HTTP ${res.status}`); }
      await load();
      if (typeof onChanged === 'function') onChanged();
    } catch (err) { window.showToast({ title: 'Erreur : ' + err.message, type: 'error' }); }
  };

  const revueLine = (r) => (
    <span style={{ fontSize: '12px', color: 'var(--tw-slate)' }}>
      <span style={{ fontWeight: 600, color: 'var(--tw-ink)' }}>{fmtDate(r.date_revue)}</span>
      {r.auteur && <span> · {r.auteur}</span>}
      <span> · </span>
      <span style={{ fontWeight: 600, color: scoreTone(r.score).fg }}>{r.score}/{REVUE_TOTAL}</span>
    </span>
  );

  return (
    <section ref={rootRef} data-testid={`revue-block-${affaire.id}`} onClick={(e) => e.stopPropagation()}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
        <p style={{ margin: 0, fontSize: '11px', color: C.color, textTransform: 'uppercase', letterSpacing: '.5px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex' }}>{I(ICONS.pulse, 13)}</span>
          {formOpen ? (derniere ? 'Nouvelle revue' : 'Première revue') : 'Revues'}
          {!formOpen && <><span style={{ color: 'var(--tw-muted)', fontWeight: 500 }}>·</span> <span style={{ color: C.color }}>{list.length}</span></>}
          {derniere && !formOpen && (
            <span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--tw-muted)', textTransform: 'none', letterSpacing: 0 }}>
              dernière revue {ageLabel(daysSince(derniere.date_revue))}{derniere.auteur ? ` par ${derniere.auteur}` : ''}
            </span>
          )}
        </p>
        {!formOpen && (
          <button type="button" onClick={() => setFormOpen(true)} data-testid={`revue-new-${affaire.id}`}
            style={{ background: C.color, border: 'none', padding: '5px 12px', borderRadius: '7px', fontSize: '12px', fontWeight: 600, color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontFamily: FONT, boxShadow: '0 1px 3px rgba(90,71,176,.35)' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = C.dark; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = C.color; }}>
            {I(ICONS.pulse, 11)} {derniere ? 'Revoir le deal' : 'Revue de deal'}
          </button>
        )}
      </div>

      <div style={{ border: `1px solid ${C.border}`, borderLeft: `4px solid ${C.color}`, borderRadius: '10px', background: C.bg, padding: '12px 14px' }}>
        {formOpen ? (
          <RevueForm key={actionProposee ? actionProposee._k : 'form'} affaire={affaire} initial={derniere} initialAction={actionProposee} user={user} API_URL={API_URL} interlocuteurs={interlocuteurs}
            onCancel={() => { if (derniere) setFormOpen(false); setActionProposee(null); }}
            onSaved={async () => { setFormOpen(false); setShowLast(false); setActionProposee(null); await load(); if (typeof onChanged === 'function') onChanged(); }} />
        ) : revues === null ? (
          <div style={{ fontSize: '12px', color: 'var(--tw-muted)', fontStyle: 'italic' }}>Chargement…</div>
        ) : !derniere ? (
          <div style={{ fontSize: '12px', color: 'var(--tw-slate)', lineHeight: 1.5 }}>
            <span style={{ fontWeight: 600, color: C.dark }}>Aucune revue pour cette affaire.</span>{' '}
            Six questions, une cascade de pourquoi, une action : dix minutes pour savoir où en est vraiment ce deal.
          </div>
        ) : (
          <div>
            {/* Dernière revue : synthèse */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                {revueLine(derniere)}
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  {REVUE_QUESTIONS.map(q => {
                    const r = normalizeReponses(derniere.reponses)[q.key];
                    const e = etatInfo(r.etat);
                    return (
                      <span key={q.key} title={`${q.label} : ${e.label}${r.texte ? ' — ' + r.texte : ''}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '10.5px', fontWeight: 600, padding: '2px 7px 2px 3px', borderRadius: '10px', background: e.bg, color: e.fg }}>
                        <EtatChip etat={r.etat} size={9} /> {q.label}
                      </span>
                    );
                  })}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <button type="button" onClick={() => setShowLast(v => !v)} data-testid={`revue-detail-${affaire.id}`}
                  style={{ background: 'white', border: `0.5px solid ${C.border}`, color: C.color, padding: '4px 10px', borderRadius: '7px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}>
                  {showLast ? 'Masquer le détail' : 'Voir le détail'}
                </button>
                <IconBtn title="Supprimer cette revue" danger onClick={() => handleDelete(derniere.id)}>{I(ICONS.trash, 12)}</IconBtn>
              </div>
            </div>
            {!showLast && (derniere.cause_fond || derniere.action_corrective) && (
              <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
                {derniere.cause_fond && <div style={{ color: '#4a1b0c' }}><span style={{ fontWeight: 700 }}>Cause de fond : </span><span style={{ color: 'var(--tw-slate)' }}>{derniere.cause_fond}</span></div>}
                {derniere.action_corrective && <div style={{ color: '#04342c' }}><span style={{ fontWeight: 700 }}>Action corrective : </span><span style={{ color: 'var(--tw-slate)' }}>{derniere.action_corrective}</span></div>}
              </div>
            )}
            {showLast && <div style={{ marginTop: '10px' }}><RevueView revue={derniere} /></div>}

            {/* Historique */}
            {anciennes.length > 0 && (
              <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: `0.5px dashed ${C.border}` }}>
                <button type="button" onClick={() => setHistOpen(v => !v)}
                  style={{ background: 'none', border: 'none', color: C.color, padding: 0, fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: FONT, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  {I(histOpen ? ICONS.chevron : ICONS.chevronR, 11)} Revues précédentes · {anciennes.length}
                </button>
                {histOpen && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                    {anciennes.map(r => (
                      <div key={r.id} style={{ background: 'white', border: '0.5px solid var(--tw-border)', borderRadius: '8px', padding: '8px 10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                          <button type="button" onClick={() => setViewId(viewId === r.id ? null : r.id)}
                            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: FONT, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ color: 'var(--tw-muted)', display: 'inline-flex' }}>{I(viewId === r.id ? ICONS.chevron : ICONS.chevronR, 11)}</span>
                            {revueLine(r)}
                          </button>
                          <IconBtn title="Supprimer cette revue" danger onClick={() => handleDelete(r.id)}>{I(ICONS.trash, 12)}</IconBtn>
                        </div>
                        {viewId === r.id && <div style={{ marginTop: '8px' }}><RevueView revue={r} /></div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <AnalyseSection affaire={affaire} user={user} API_URL={API_URL} onReprendre={reprendreAction} />
    </section>
  );
}

// ── Lecture assistée : analyse du deal par Claude, à la demande ─────────────
// Affiche la dernière analyse enregistrée (visible par l'équipe) et un bouton
// « Analyser » qui en lance une nouvelle. L'action proposée peut être reprise
// dans le formulaire de revue d'un clic.
const AI = { color: '#4f46a5', bg: '#eeedfe', border: '#afa9ec', fg: '#26215c' };
export function AnalyseSection({ affaire, user, API_URL, onReprendre }) {
  const [analyse, setAnalyse] = React.useState(undefined); // undefined = pas chargé, null = aucune
  const [running, setRunning] = React.useState(false);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/affaires/${affaire.id}/analyse`, { headers: { 'Authorization': `Bearer ${user.token}` } });
        if (!alive) return;
        setAnalyse(res.status === 204 || !res.ok ? null : await res.json());
      } catch (e) { if (alive) setAnalyse(null); }
    })();
    return () => { alive = false; };
  }, [API_URL, affaire.id, user.token]);

  const run = async () => {
    setRunning(true); setError(null);
    try {
      const res = await fetch(`${API_URL}/affaires/${affaire.id}/analyse`, { method: 'POST', headers: { 'Authorization': `Bearer ${user.token}` } });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `HTTP ${res.status}`); }
      setAnalyse(await res.json());
    } catch (err) { setError(err.message); }
    finally { setRunning(false); }
  };

  const c = analyse && analyse.contenu;
  const confiance = c && { faible: { label: 'confiance faible', color: '#b06e2a' }, moyenne: { label: 'confiance moyenne', color: '#5b6775' }, bonne: { label: 'confiance bonne', color: '#1d9e75' } }[c.confiance];
  const btn = (
    <button type="button" onClick={run} disabled={running} data-testid="revue-analyser"
      style={{ background: running ? '#8f89d9' : AI.color, border: 'none', padding: '6px 14px', borderRadius: '7px', fontSize: '12px', fontWeight: 600, color: 'white', cursor: running ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', fontFamily: FONT, boxShadow: '0 1px 3px rgba(79,70,165,.35)' }}>
      {running ? <span style={{ width: '12px', height: '12px', border: '2px solid rgba(255,255,255,.4)', borderTopColor: 'white', borderRadius: '50%', display: 'inline-block', animation: 'twspin .8s linear infinite' }} /> : I(ICONS.spark, 12)}
      {running ? 'Analyse en cours…' : (c ? 'Relancer l\'analyse' : 'Analyser')}
    </button>
  );

  return (
    <section data-testid="revue-analyse" style={{ marginTop: '18px', paddingTop: '14px', borderTop: '0.5px solid var(--tw-border)' }}>
      <style>{'@keyframes twspin{to{transform:rotate(360deg)}}'}</style>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
        <p style={{ margin: 0, fontSize: '11px', color: AI.color, textTransform: 'uppercase', letterSpacing: '.5px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ display: 'inline-flex' }}>{I(ICONS.spark, 13)}</span> Lecture assistée
          <span style={{ fontSize: '10px', fontWeight: 500, padding: '1px 7px', borderRadius: '10px', background: AI.bg, color: AI.fg, textTransform: 'none', letterSpacing: 0 }}>Claude</span>
          {analyse && (
            <span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--tw-muted)', textTransform: 'none', letterSpacing: 0 }}>
              {ageLabel(daysSince(analyse.created_at))}{analyse.auteur ? ` par ${analyse.auteur}` : ''}{confiance ? ` · ` : ''}{confiance && <span style={{ color: confiance.color, fontWeight: 600 }}>{confiance.label}</span>}
            </span>
          )}
        </p>
        {btn}
      </div>
      <div style={{ border: `1px solid ${AI.border}`, borderLeft: `4px solid ${AI.color}`, borderRadius: '10px', background: AI.bg, padding: '12px 14px', color: AI.fg, fontSize: '12.5px', lineHeight: 1.5 }}>
        {error && <div style={{ color: '#a52d2d', fontWeight: 600, marginBottom: '8px' }}>Analyse impossible : {error}</div>}
        {analyse === undefined && !error ? (
          <span style={{ color: 'var(--tw-muted)', fontStyle: 'italic' }}>Chargement…</span>
        ) : !c ? (
          <span>Claude relit le dossier tel qu'il est dans le CRM (contacts, devis, actions, notes, revues, comparables gagnés et perdus) et confronte ce qui est déclaré à ce qui s'est réellement passé. Cinq lignes, deux ou trois questions à poser, une action. C'est toi qui décides.</span>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div data-testid="analyse-situation"><span style={{ fontWeight: 700 }}>Situation. </span>{c.situation}</div>
            {c.risque_principal && <div><span style={{ fontWeight: 700, color: '#a52d2d' }}>Risque principal. </span>{c.risque_principal}</div>}
            {c.signaux && c.signaux.length > 0 && (
              <div>
                <div style={{ fontWeight: 700, marginBottom: '3px' }}>Ce qui le montre</div>
                <ul style={{ margin: 0, paddingLeft: '18px' }}>{c.signaux.map((s, i) => <li key={i}>{s}</li>)}</ul>
              </div>
            )}
            {c.questions && c.questions.length > 0 && (
              <div>
                <div style={{ fontWeight: 700, marginBottom: '3px' }}>À poser au prochain contact</div>
                <ul style={{ margin: 0, paddingLeft: '18px' }}>{c.questions.map((q, i) => <li key={i} style={{ fontStyle: 'italic' }}>« {q} »</li>)}</ul>
              </div>
            )}
            {c.action && c.action.texte && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', border: '1px solid #1d9e75', borderRadius: '8px', padding: '8px 10px', background: '#e1f5ee', color: '#04342c' }}>
                <span style={{ flex: 1 }}><span style={{ fontWeight: 700 }}>Action proposée. </span>{c.action.texte} <span style={{ color: 'var(--tw-muted)' }}>({c.action.type}, sous {c.action.delai_jours} j)</span></span>
                {typeof onReprendre === 'function' && (
                  <button type="button" onClick={() => onReprendre(c.action)} data-testid="analyse-reprendre"
                    style={{ background: '#1d9e75', border: 'none', color: 'white', padding: '5px 10px', borderRadius: '7px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: FONT, whiteSpace: 'nowrap' }}>
                    Reprendre dans la revue
                  </button>
                )}
              </div>
            )}
            {c.manque && <div style={{ color: 'var(--tw-slate)' }}><span style={{ fontWeight: 700 }}>Pour trancher, il manque. </span>{c.manque}</div>}
          </div>
        )}
      </div>
    </section>
  );
}

// ── Panneau latéral droit ───────────────────────────────────────────────────
// Ouvert par le bouton de la ligne d'affaire. Fond assombri, fermeture par ×,
// clic hors du panneau ou Échap. L'affaire reste visible derrière.
export function RevueDealDrawer({ affaire, prospect, devis, user, API_URL, interlocuteurs, onChanged, onClose }) {
  const [shown, setShown] = React.useState(false);
  React.useEffect(() => {
    const t = requestAnimationFrame(() => setShown(true));
    const esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', esc);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { cancelAnimationFrame(t); document.removeEventListener('keydown', esc); document.body.style.overflow = prevOverflow; };
  }, [onClose]);
  if (!affaire) return null;
  const nbDevis = Array.isArray(devis) ? devis.length : 0;
  const dernierDevis = Array.isArray(devis) && devis.length ? devis[0] : null;
  const sante = santeDeal({ score: affaire.revue_score, date: affaire.revue_date, nbDevis });
  return (
    <div data-testid="revue-drawer" role="dialog" aria-modal="true" aria-label={`Revue de deal : ${affaire.nom_affaire || ''}`}
      style={{ position: 'fixed', inset: 0, zIndex: 9990, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,.38)', opacity: shown ? 1 : 0, transition: 'opacity .2s' }} />
      <aside style={{ position: 'relative', width: '640px', maxWidth: '95vw', height: '100%', background: 'white', boxShadow: '-12px 0 40px rgba(0,0,0,.18)', display: 'flex', flexDirection: 'column',
        transform: shown ? 'none' : 'translateX(100%)', transition: 'transform .22s cubic-bezier(.2,.8,.3,1)', fontFamily: FONT }}>
        <header style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '16px 20px', borderBottom: '0.5px solid var(--tw-border)', borderTop: `4px solid ${C.color}` }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '9px', background: C.bg, color: C.color, display: 'grid', placeItems: 'center', flexShrink: 0 }}>{I(ICONS.pulse, 18)}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: C.color, textTransform: 'uppercase', letterSpacing: '.5px' }}>Revue de deal</div>
            <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--tw-ink)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{affaire.nom_affaire}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '5px', fontSize: '11.5px', color: 'var(--tw-slate)' }}>
              {prospect && prospect.name && <span style={{ fontWeight: 600, color: 'var(--tw-ink)' }}>{prospect.name}</span>}
              <span style={{ fontSize: '11px', fontWeight: 500, padding: '2px 8px', borderRadius: '10px', background: 'var(--primary-soft)', color: 'var(--primary)' }}>{affaire.statut_global || 'En cours'}</span>
              {dernierDevis && (
                <span style={{ fontSize: '11px', fontWeight: 500, padding: '2px 8px', borderRadius: '10px', background: '#faeeda', color: '#633806' }}>
                  Devis {dernierDevis.chance_percent != null ? `${dernierDevis.chance_percent} %` : ''}{dernierDevis.devis_status ? ` · ${dernierDevis.devis_status}` : ''}
                </span>
              )}
              {affaire.decision_periode && <span style={{ fontSize: '11px', fontWeight: 500, padding: '2px 8px', borderRadius: '10px', background: 'var(--tw-bg, #eef2f5)', color: 'var(--tw-slate)', border: '0.5px solid var(--tw-border)' }}>Décision : {String(affaire.decision_periode).replace(/^(\d{4})-(Q\d)$/, '$2 - $1')}</span>}
              {sante && <SantePill score={affaire.revue_score} date={affaire.revue_date} nbDevis={nbDevis} createdAt={affaire.created_at} />}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer la revue" title="Fermer (Échap)" data-testid="revue-drawer-close"
            style={{ width: '30px', height: '30px', border: '0.5px solid var(--tw-border)', background: 'white', borderRadius: '7px', cursor: 'pointer', color: 'var(--tw-slate)', fontSize: '18px', lineHeight: 1, flexShrink: 0 }}>×</button>
        </header>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 24px' }}>
          <RevueDealContent affaire={affaire} user={user} API_URL={API_URL} interlocuteurs={interlocuteurs} nbDevis={nbDevis} onChanged={onChanged} />
        </div>
      </aside>
    </div>
  );
}
