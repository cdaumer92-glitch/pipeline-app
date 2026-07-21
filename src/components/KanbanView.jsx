import * as React from 'react';
import { getStatusColor, prospectDisplayName, formatCurrency } from '../lib/shared.jsx';

// Vue Kanban du pipeline : les sociétés réparties en colonnes par statut, glisser-déposer
// d'une carte vers une autre colonne pour changer son statut (PATCH ciblé côté serveur).
// Non-admin = ses sociétés uniquement ; admin = tout (avec filtre par commercial).
// Les statuts "clôturés" (Ajourné / Éliminé / Perdu) sont repliés par défaut pour se
// concentrer sur le pipeline actif ; un bouton les affiche/masque.
const ACTIVE_STATUSES = ['Prospection', 'Devis', 'Démo', 'Négociation', 'Signé'];
const TERMINAL_STATUSES = ['Ajourné N+1', 'Éliminé par nous', 'Perdu'];
const STATUSES = [...ACTIVE_STATUSES, ...TERMINAL_STATUSES];
const RANK = { 'Prospection': 0, 'Devis': 1, 'Démo': 2, 'Négociation': 3, 'Signé': 4 };

// Statut "effectif" d'une société pour le Kanban : on part du statut MANUEL (champ `status`),
// mais on le corrige avec la réalité du devis en cours (`real_status` = devis_status), car le
// statut manuel est souvent laissé sur "Prospection" alors qu'un devis existe déjà.
//   - statut terminal saisi à la main (Ajourné/Éliminé/Perdu) : respecté tel quel
//   - devis Gagné → Signé ; devis Perdu → Perdu
//   - devis actif (En cours / Envoyé) → au moins "Devis", sauf si le statut manuel est déjà
//     plus avancé (Démo/Négociation/Signé), auquel cas on le conserve
export function effectiveStatus(p) {
  const manual = (p && p.status) || 'Prospection';
  if (TERMINAL_STATUSES.includes(manual)) return manual;
  const real = p && p.real_status;
  if (!real) return manual;
  if (real === 'Gagné') return 'Signé';
  if (TERMINAL_STATUSES.includes(real)) return real; // devis Perdu / Ajourné N+1 / Éliminé par nous
  return (RANK[manual] || 0) >= RANK['Devis'] ? manual : 'Devis';
}

export function KanbanView({ prospects, user, API_URL, onSelectProspect, onStatusChanged }) {
  const admin = (typeof isUserAdmin === 'function') ? isUserAdmin(user) : !!(user && (user.role === 'admin' || user.name === 'Christian'));
  const [commercial, setCommercial] = React.useState('__all__');
  const [dragId, setDragId] = React.useState(null);
  const [overCol, setOverCol] = React.useState(null);
  const [localStatus, setLocalStatus] = React.useState({}); // maj optimiste { [prospectId]: status }
  const [showTerminal, setShowTerminal] = React.useState(false); // colonnes clôturées repliées par défaut
  const [expanded, setExpanded] = React.useState({}); // { [prospectId]: true } — détail des affaires déplié

  const toast = (t, type) => { if (window.showToast) window.showToast({ title: t, type: type || 'success' }); };

  const commerciaux = React.useMemo(() => {
    const s = new Set((prospects || []).map(p => p.assigned_to).filter(Boolean));
    return Array.from(s).sort();
  }, [prospects]);

  const base = (prospects || []).filter(p => admin ? (commercial === '__all__' || p.assigned_to === commercial) : true);
  // Un choix explicite (glisser-déposer, stocké optimistically dans localStatus) prime toujours ;
  // sinon on affiche le statut effectif (statut manuel corrigé par le devis).
  const statusOf = (p) => localStatus[p.id] || effectiveStatus(p);

  const affairesOf = (p) => Array.isArray(p.affaires_detail) ? p.affaires_detail : [];
  const isAffairePerdue = (a) => TERMINAL_STATUSES.includes(a.statut);
  const isAffaireGagnee = (a) => a.statut === 'Gagné';

  // On n'additionne PAS setup + mensuel + annuel : un forfait ponctuel (setup) et deux
  // récurrences (mensuelle, annuelle) n'ont pas la même nature. Le Kanban affiche donc
  // trois chiffres distincts.
  const emptyMoney = () => ({ setup: 0, monthly: 0, annual: 0 });
  const affaireMoney = (a) => ({ setup: Number(a.setup) || 0, monthly: Number(a.monthly) || 0, annual: Number(a.annual) || 0 });
  const addMoney = (acc, m) => { acc.setup += m.setup; acc.monthly += m.monthly; acc.annual += m.annual; return acc; };
  const hasMoney = (m) => m.setup > 0 || m.monthly > 0 || m.annual > 0;
  const fallbackMoney = (p) => (
    (p.real_setup_amount != null || p.real_monthly_amount != null || p.real_annual_amount != null)
      ? { setup: Number(p.real_setup_amount) || 0, monthly: Number(p.real_monthly_amount) || 0, annual: Number(p.real_annual_amount) || 0 }
      : { setup: Number(p.setup_amount) || 0, monthly: Number(p.monthly_amount) || 0, annual: 0 }
  );

  // Colonne dans laquelle le MONTANT d'une affaire est comptabilisé (indépendamment de
  // la colonne où siège la carte de la société) :
  //   - perdue / terminale : nulle part (hors total) ;
  //   - gagnée : colonne « Signé », même si la société est encore active ailleurs ;
  //   - ouverte : la colonne où siège la carte (statut effectif de la société).
  // Ainsi une affaire gagnée d'une société encore en Devis alimente bien le total Signé.
  const columnOfAffaire = (p, a) => {
    if (isAffairePerdue(a)) return null;
    if (isAffaireGagnee(a)) return 'Signé';
    return statusOf(p);
  };

  // Montant affiché sur la carte = uniquement les affaires comptées dans SA propre colonne.
  // Une société en Devis n'affiche donc que ses affaires ouvertes ; ses affaires gagnées
  // sont visibles au dépliage mais comptées ailleurs (Signé).
  const cardMoney = (p) => {
    const affaires = affairesOf(p);
    if (!affaires.length) return fallbackMoney(p);
    const col = statusOf(p);
    return affaires.reduce((acc, a) => columnOfAffaire(p, a) === col ? addMoney(acc, affaireMoney(a)) : acc, emptyMoney());
  };

  // Total par colonne, piloté par le statut de chaque AFFAIRE (et non de la société).
  const columnMoney = {};
  STATUSES.forEach(s => (columnMoney[s] = emptyMoney()));
  base.forEach(p => {
    const affaires = affairesOf(p);
    if (affaires.length) {
      affaires.forEach(a => { const c = columnOfAffaire(p, a); if (c && columnMoney[c]) addMoney(columnMoney[c], affaireMoney(a)); });
    } else {
      const c = statusOf(p); if (columnMoney[c]) addMoney(columnMoney[c], fallbackMoney(p));
    }
  });

  // Bloc d'affichage des 3 chiffres (réutilisé carte, en-tête de colonne, détail affaire).
  const moneyBlock = (m, { size = 11, labelColor = 'var(--tw-muted)', valColor = 'var(--tw-slate)' } = {}) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '1px 8px', fontSize: `${size}px`, fontVariantNumeric: 'tabular-nums' }}>
      <span style={{ color: labelColor }}>Setup</span>
      <span style={{ textAlign: 'right', color: valColor, fontWeight: 700 }}>{formatCurrency(m.setup)}</span>
      <span style={{ color: labelColor }}>Mensuel</span>
      <span style={{ textAlign: 'right', color: valColor, fontWeight: 700 }}>{m.monthly > 0 ? formatCurrency(m.monthly) + '/mois' : formatCurrency(0)}</span>
      <span style={{ color: labelColor }}>Annuel</span>
      <span style={{ textAlign: 'right', color: valColor, fontWeight: 700 }}>{m.annual > 0 ? formatCurrency(m.annual) + '/an' : formatCurrency(0)}</span>
    </div>
  );

  const byStatus = {};
  STATUSES.forEach(s => (byStatus[s] = []));
  base.forEach(p => { const s = statusOf(p); (byStatus[s] || byStatus['Prospection']).push(p); });
  const terminalCount = TERMINAL_STATUSES.reduce((n, s) => n + (byStatus[s] || []).length, 0);

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

  // Rendu d'une colonne de statut (réutilisé pour les colonnes actives et clôturées).
  const renderColumn = (status) => {
    const list = byStatus[status] || [];
    const color = getStatusColor(status);
    const total = columnMoney[status] || emptyMoney();
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
          <div data-testid={`col-total-${status}`} style={{ marginTop: '5px' }}>
            {hasMoney(total)
              ? moneyBlock(total, { size: 10.5 })
              : <span style={{ fontSize: '11px', color: 'var(--tw-muted)' }}>—</span>}
          </div>
        </div>

        {/* Cartes */}
        <div style={{ padding: '8px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {list.length === 0 && (
            <div style={{ fontSize: '11px', color: 'var(--tw-muted)', textAlign: 'center', padding: '18px 6px', fontStyle: 'italic' }}>Aucune société</div>
          )}
          {list.map(p => {
            const money = cardMoney(p);
            const dragging = dragId === p.id;
            const affaires = affairesOf(p);
            const isOpen = !!expanded[p.id];
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
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '6px', marginBottom: '5px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--tw-ink)', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prospectDisplayName(p)}</span>
                  {admin && p.assigned_to && (
                    <span style={{ fontSize: '10px', color: 'var(--tw-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80px', flexShrink: 0 }}>{p.assigned_to}</span>
                  )}
                </div>
                {hasMoney(money)
                  ? moneyBlock(money)
                  : <span style={{ fontSize: '11px', color: 'var(--tw-muted)' }}>—</span>}

                {/* Bouton de dépliage : UNIQUEMENT à partir de 2 affaires. Avec une seule
                    affaire, les 3 chiffres ci-dessus SONT déjà ceux de cette affaire, rien
                    à déplier. stopPropagation sinon le clic ouvrirait la fiche. */}
                {affaires.length >= 2 && (
                  <button type="button"
                    onClick={(e) => { e.stopPropagation(); setExpanded(prev => ({ ...prev, [p.id]: !prev[p.id] })); }}
                    title={isOpen ? 'Masquer le détail des affaires' : 'Voir le détail par affaire'}
                    style={{
                      marginTop: '8px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                      background: isOpen ? 'var(--tw-teal-light)' : 'white', border: `1px solid ${color}55`,
                      borderRadius: '7px', padding: '5px 8px', cursor: 'pointer',
                      fontFamily: 'Inter,sans-serif', fontSize: '10.5px', fontWeight: 700, color: 'var(--primary)'
                    }}>
                    <span style={{ fontSize: '9px' }}>{isOpen ? '▾' : '▸'}</span>
                    {isOpen ? 'Masquer' : 'Voir'} les {affaires.length} affaires
                  </button>
                )}
                {isOpen && affaires.length >= 2 && (
                  <div style={{ marginTop: '6px', borderTop: '1px dashed var(--tw-border)', paddingTop: '6px', display: 'flex', flexDirection: 'column', gap: '7px' }}>
                    {affaires.map(a => {
                      const perdue = isAffairePerdue(a);
                      // Affaire gagnée d'une société encore active : son montant est compté
                      // dans la colonne Signé, pas ici → on le signale.
                      const compteeSigne = isAffaireGagnee(a) && statusOf(p) !== 'Signé';
                      const suffixe = perdue ? ' · hors total' : (compteeSigne ? ' · comptée dans Signé' : '');
                      return (
                        <div key={a.id} style={{ opacity: perdue ? 0.5 : 1 }}>
                          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--tw-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {a.nom || 'Affaire'}
                          </div>
                          {a.statut && (
                            <div style={{ fontSize: '9.5px', color: 'var(--tw-muted)', marginTop: '1px', marginBottom: '3px' }}>
                              {a.statut}{suffixe}
                            </div>
                          )}
                          {moneyBlock({ setup: Number(a.setup) || 0, monthly: Number(a.monthly) || 0, annual: Number(a.annual) || 0 }, { size: 10 })}
                        </div>
                      );
                    })}
                  </div>
                )}

                {p.action_is_late && (
                  <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--tw-red)', marginTop: '5px' }}>⚠ Action en retard</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div style={{ padding: '18px 22px', height: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column' }}>
      {/* Barre d'en-tête */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--tw-ink)', margin: 0 }}>Pipeline</h2>
        <span style={{ fontSize: '12px', color: 'var(--tw-muted)' }}>{cardCount} société{cardCount > 1 ? 's' : ''}</span>

        {/* Repli des colonnes clôturées */}
        <button onClick={() => setShowTerminal(v => !v)}
          title={showTerminal ? 'Masquer les statuts clôturés' : 'Afficher les statuts clôturés'}
          style={{
            marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '6px',
            padding: '6px 12px', borderRadius: '999px', cursor: 'pointer',
            border: '1px solid var(--tw-border)', fontFamily: 'Inter,sans-serif', fontSize: '12px', fontWeight: 600,
            background: showTerminal ? 'var(--tw-teal-light)' : 'white', color: showTerminal ? 'var(--primary)' : 'var(--tw-slate)'
          }}>
          <span style={{ fontSize: '10px' }}>{showTerminal ? '▾' : '▸'}</span>
          Clôturées{terminalCount > 0 ? ` (${terminalCount})` : ''}
        </button>

        {admin && (
          <select value={commercial} onChange={(e) => setCommercial(e.target.value)}
            style={{ padding: '6px 10px', border: '1px solid var(--tw-border)', borderRadius: '8px', fontSize: '13px', fontFamily: 'Inter,sans-serif', background: 'white', color: 'var(--tw-ink)' }}>
            <option value="__all__">Tous les commerciaux</option>
            {commerciaux.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <span style={{ fontSize: '11px', color: 'var(--tw-muted)' }}>Glissez une carte pour changer son statut</span>
      </div>

      {/* Colonnes */}
      <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', flex: 1, paddingBottom: '8px', alignItems: 'flex-start' }}>
        {ACTIVE_STATUSES.map(renderColumn)}
        {showTerminal && (
          <div aria-hidden="true" style={{ alignSelf: 'stretch', display: 'flex', alignItems: 'center', flexShrink: 0, padding: '0 2px' }}>
            <div style={{ width: '1px', background: 'var(--tw-border)', height: '92%' }} />
          </div>
        )}
        {showTerminal && TERMINAL_STATUSES.map(renderColumn)}
      </div>
    </div>
  );
}
