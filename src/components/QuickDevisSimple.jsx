import * as React from 'react';
import { prospectDisplayName } from '../lib/shared.jsx';
import { DevisSimpleForm } from './DevisSimpleForm.jsx';

// « Créer un devis → Devis simple » depuis le menu principal.
// Un devis ne peut pas être enregistré sans société : on choisit d'abord la société,
// puis la grille de devis s'ouvre. L'affaire est rattachée ou créée à l'enregistrement,
// dans la grille elle-même (même mécanique que depuis la fiche société).
export function QuickDevisSimple({ prospects, user, API_URL, onClose, onOpenFiche }) {
  const [q, setQ] = React.useState('');
  const [prospect, setProspect] = React.useState(null);
  const [interlocuteurs, setInterlocuteurs] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const inputRef = React.useRef(null);
  React.useEffect(() => { if (inputRef.current) inputRef.current.focus(); }, []);

  const needle = q.trim().toLowerCase();
  const results = needle.length >= 2
    ? (prospects || []).filter(p =>
        (p.name || '').toLowerCase().includes(needle) ||
        (Array.isArray(p.marques) && p.marques.some(m => String(m).toLowerCase().includes(needle)))
      ).slice(0, 12)
    : [];

  const choose = async (p) => {
    setLoading(true);
    try {
      const r = await fetch(`${API_URL}/prospects/${p.id}/interlocuteurs`, { headers: { 'Authorization': `Bearer ${user.token}` } });
      const list = r.ok ? await r.json() : [];
      setInterlocuteurs(Array.isArray(list) ? list : []);
    } catch { setInterlocuteurs([]); }
    setProspect(p);
    setLoading(false);
  };

  if (prospect) {
    return (
      <DevisSimpleForm
        prospect={prospect}
        interlocuteurs={interlocuteurs}
        affaireId={null}
        user={user}
        API_URL={API_URL}
        onClose={onClose}
        onSaved={async () => { if (onOpenFiche) await onOpenFiche(prospect); }}
      />
    );
  }

  const statutColor = (s) => s === 'Client' ? 'var(--tw-teal)' : s === 'Prospect' ? 'var(--tw-orange)' : s === 'Holding' ? '#0d7fb0' : s === 'Prestataire' ? '#7b5ea7' : 'var(--tw-muted)';

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(11,31,78,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000 }} onClick={onClose}>
      <div style={{ background: 'white', borderRadius: '14px', padding: '24px 26px', width: '520px', maxWidth: '95vw', boxShadow: '0 20px 50px rgba(17,24,39,.25)' }} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 4px', fontSize: '17px', fontWeight: 700, color: 'var(--tw-ink)' }}>Devis simple</h3>
        <p style={{ margin: '0 0 14px', fontSize: '13px', color: 'var(--tw-muted)' }}>Pour quelle société ? Un devis ne peut pas être enregistré sans société.</p>
        <input
          ref={inputRef}
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') onClose(); if (e.key === 'Enter' && results.length === 1) choose(results[0]); }}
          placeholder="Nom de la société ou marque…"
          style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--tw-border)', borderRadius: '8px', fontSize: '14px', fontFamily: "'Inter',sans-serif", boxSizing: 'border-box' }}
        />
        <div style={{ marginTop: '10px', maxHeight: '320px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {needle.length < 2 ? (
            <div style={{ padding: '14px', textAlign: 'center', color: 'var(--tw-muted)', fontSize: '13px' }}>Tapez au moins deux lettres.</div>
          ) : results.length === 0 ? (
            <div style={{ padding: '14px', textAlign: 'center', color: 'var(--tw-muted)', fontSize: '13px' }}>Aucune société trouvée.</div>
          ) : results.map(p => (
            <button key={p.id} onClick={() => choose(p)} disabled={loading}
              style={{ textAlign: 'left', background: 'white', border: '0.5px solid var(--tw-border)', borderRadius: '8px', padding: '9px 12px', cursor: 'pointer', fontFamily: "'Inter',sans-serif" }}
              onMouseOver={e => e.currentTarget.style.background = 'var(--tw-teal-light, #eef7fb)'}
              onMouseOut={e => e.currentTarget.style.background = 'white'}>
              <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--tw-ink)' }}>{prospectDisplayName(p)}</div>
              <div style={{ fontSize: '11px', color: 'var(--tw-muted)', marginTop: '2px' }}>
                <span style={{ color: statutColor(p.statut_societe) }}>{p.statut_societe || 'Prospect'}</span>
                {p.ville ? ` · ${p.ville}` : ''}{p.assigned_to ? ` · ${p.assigned_to}` : ''}
              </div>
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '14px' }}>
          <button onClick={onClose}
            style={{ padding: '8px 16px', border: '1px solid var(--tw-border)', borderRadius: '7px', background: 'white', fontSize: '13px', cursor: 'pointer', fontFamily: "'Inter',sans-serif" }}>Annuler</button>
        </div>
      </div>
    </div>
  );
}
