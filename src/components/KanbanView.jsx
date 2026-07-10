import * as React from 'react';
import { getStatusColor, prospectDisplayName, calculateTotal, formatCurrency } from '../lib/shared.jsx';

// Vue Kanban du pipeline : les sociétés réparties en colonnes par statut, glisser-déposer
// d'une carte vers une autre colonne pour changer son statut (PATCH ciblé côté serveur).
// Non-admin = ses sociétés uniquement ; admin = tout (avec filtre par commercial).
const STATUSES = ['Prospection', 'Devis', 'Démo', 'Négociation', 'Signé', 'Ajourné N+1', 'Éliminé par nous', 'Perdu'];

export function KanbanView({ prospects, user, API_URL, onSelectProspect, onStatusChanged }) {
  const admin = (typeof isUserAdmin === 'function') ? isUserAdmin(user) : !!(user && (user.role === 'admin' || user.name === 'Christian'));
  const [commercial, setCommercial] = React.useState('__all__');
  const [dragId, setDragId] = React.useState(null);
  const [overCol, setOverCol] = React.useState(null);
  const [localStatus, setLocalStatus] = React.useState({}); // maj optimiste { [prospectId]: status }

  const toast = (t, type) => { if (window.showToast) window.showToast({ title: t, type: type || 'success' }); };

  const commerciaux = React.useMemo(() => {
    const s = new Set((prospects || []).map(p => p.assigned_to).filter(Boolean));
    return Array.from(s).sort();
  }, [prospects]);

  const base = (prospects || []).filter(p => admin ? (commercial === '__all__' || p.assigned_to === commercial) : true);
  const statusOf = (p) => localStatus[p.id] || p.status || 'Prospection';

  // Montant "pipeline" : privilégie le montant du devis en cours (données enrichies), sinon le total saisi.
  const amountOf = (p) => {
    if (p.real_setup_amount != null || p.real_monthly_amount != null || p.real_annual_amount != null) {
      return (Number(p.real_setup_amount) || 0) + (Number(p.real_monthly_amount) || 0) * 12 + (Number(p.real_annual_amount) || 0) + (Number(p.real_training_amount) || 0);
    }
    return calculateTotal(p);
  };

  const byStatus = {};
  STATUSES.forEach(s => (byStatus[s] = []));
  base.forEach(p => { const s = statusOf(p); (byStatus[s] || byStatus['Prospection']).push(p); });

  const moveTo = async (prospectId, newStatus) => {
    const p = (prospects || []).find(x => x.id === prospectId);
    if (!p) return;
    const old = statusOf(p);
    if (old === newStatus) return;
    setLocalStatus(prev => ({ ...prev, [prospectId]: newStatus })); // optimiste
    try {
      const res = await fetch(`${API_URL}/prospects/${prospectId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${user.token}` },
        body: JSON.stringify({ status: newStatus })
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      toast(`${prospectDisplayName(p)} → ${newStatus}`);
      if (onStatusChanged) onStatusChanged(prospectId, newStatus);
    } catch (e) {
      setLocalStatus(prev => ({ ...prev, [prospectId]: old })); // rollback
      toast('Erreur de mise à jour : ' + e.message, 'error');
    }
  };

  const cardCount = base.length;

  return (
    <div style={{ padding: '18px 22px', height: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column' }}>
      {/* Barre d'en-tête */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--tw-ink)', margin: 0 }}>Pipeline</h2>
        <span style={{ fontSize: '12px', color: 'var(--tw-muted)' }}>{cardCount} société{cardCount > 1 ? 's' : ''}</span>
        {admin && (
          <select value={commercial} onChange={(e) => setCommercial(e.target.value)}
            style={{ marginLeft: 'auto', padding: '6px 10px', border: '1px solid var(--tw-border)', borderRadius: '8px', fontSize: '13px', fontFamily: 'Inter,sans-serif', background: 'white', color: 'var(--tw-ink)' }}>
            <option value="__all__">Tous les commerciaux</option>
            {commerciaux.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <span style={{ fontSize: '11px', color: 'var(--tw-muted)', flexBasis: admin ? 'auto' : 'auto' }}>Glissez une carte pour changer son statut</span>
      </div>

      {/* Colonnes */}
      <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', flex: 1, paddingBottom: '8px', alignItems: 'flex-start' }}>
        {STATUSES.map(status => {
          const list = byStatus[status] || [];
          const color = getStatusColor(status);
          const total = list.reduce((s, p) => s + amountOf(p), 0);
          const isOver = overCol === status;
          return (
            <div key={status}
              onDragOver={(e) => { e.preventDefault(); if (overCol !== status) setOverCol(status); }}
              onDragLeave={(e) => { if (e.currentTarget === e.target) setOverCol(null); }}
              onDrop={(e) => { e.preventDefault(); if (dragId != null) moveTo(dragId, status); setOverCol(null); setDragId(null); }}
              style={{
                minWidth: '240px', width: '240px', flexShrink: 0, display: 'flex', flexDirection: 'column',
                maxHeight: '100%', background: isOver ? 'var(--tw-teal-light)' : 'var(--tw-bg)',
                border: isOver ? `2px dashed ${color}` : '1px solid var(--tw-border)',
                borderRadius: '12px', transition: 'background .12s, border-color .12s'
              }}>
              {/* En-tête de colonne */}
              <div style={{ padding: '11px 13px', borderBottom: '1px solid var(--tw-border)', borderTop: `3px solid ${color}`, borderTopLeftRadius: '11px', borderTopRightRadius: '11px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--tw-ink)', letterSpacing: '.2px' }}>{status}</span>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: color, background: 'white', border: `1px solid ${color}33`, borderRadius: '999px', padding: '1px 8px', minWidth: '20px', textAlign: 'center' }}>{list.length}</span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--tw-muted)', marginTop: '3px', fontVariantNumeric: 'tabular-nums' }}>{total > 0 ? formatCurrency(total) : '—'}</div>
              </div>

              {/* Cartes */}
              <div style={{ padding: '8px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {list.length === 0 && (
                  <div style={{ fontSize: '11px', color: 'var(--tw-muted)', textAlign: 'center', padding: '18px 6px', fontStyle: 'italic' }}>Aucune société</div>
                )}
                {list.map(p => {
                  const amount = amountOf(p);
                  const dragging = dragId === p.id;
                  return (
                    <div key={p.id}
                      draggable
                      onDragStart={() => setDragId(p.id)}
                      onDragEnd={() => { setDragId(null); setOverCol(null); }}
                      onClick={() => onSelectProspect && onSelectProspect(p)}
                      title="Cliquer pour ouvrir · glisser pour déplacer"
                      style={{
                        background: 'white', border: '1px solid var(--tw-border)', borderLeft: `3px solid ${color}`,
                        borderRadius: '9px', padding: '10px 11px', cursor: 'grab', boxShadow: 'var(--sh-sm)',
                        opacity: dragging ? 0.45 : 1, transition: 'opacity .12s, box-shadow .12s'
                      }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--tw-ink)', lineHeight: 1.3, marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prospectDisplayName(p)}</div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--tw-slate)', fontVariantNumeric: 'tabular-nums' }}>{amount > 0 ? formatCurrency(amount) : '—'}</span>
                        {admin && p.assigned_to && (
                          <span style={{ fontSize: '10px', color: 'var(--tw-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '90px' }}>{p.assigned_to}</span>
                        )}
                      </div>
                      {p.action_is_late && (
                        <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--tw-red)', marginTop: '5px' }}>⚠ Action en retard</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
