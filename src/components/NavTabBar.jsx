import * as React from 'react';
import { createPortal } from 'react-dom';
const ReactDOM = { createPortal };

export function NavTabBar({ currentView, onRestore, onOpenPalette }) {
      // Chaque onglet porte une PILE d'historique de vues ; la tête = vue affichée.
      const [tabs, setTabs] = React.useState(() => [{ uid: 1, history: [{ ...currentView }] }]);
      const [activeUid, setActiveUid] = React.useState(1);
      const seqRef = React.useRef(1);
      const dragFrom = React.useRef(null);
      const suppress = React.useRef(false); // n'empile PAS l'historique lors d'une nav programmatique (switch/back/restore)
      // Emplacement (sous le Header) où l'on rend le fil d'Ariane via portail, pour qu'il
      // soit collé au contenu et bien visible — sans déplacer la logique hors de ce composant.
      const [bcSlot, setBcSlot] = React.useState(null);
      React.useEffect(() => { setBcSlot(document.getElementById('tw-breadcrumb-slot')); }, []);

      const head = (t) => t.history[t.history.length - 1];
      const sameView = (a, b) => !!a && !!b && a.view === b.view && String(a.prospectId || '') === String(b.prospectId || '');

      // La vue courante alimente l'historique de l'onglet actif :
      //  - même vue (label rafraîchi) → on met à jour la tête sans empiler ;
      //  - nav programmatique (suppress) → on n'empile pas (la tête est déjà bonne) ;
      //  - nav réelle → on empile une nouvelle étape.
      React.useEffect(() => {
        setTabs(prev => prev.map(t => {
          if (t.uid !== activeUid) return t;
          const h0 = head(t);
          if (sameView(h0, currentView)) { const h = t.history.slice(); h[h.length - 1] = { ...currentView }; return { ...t, history: h }; }
          if (suppress.current) return t;
          return { ...t, history: [...t.history, { ...currentView }] };
        }));
      }, [currentView.view, currentView.prospectId, currentView.label]);

      // Restaure une vue SANS l'empiler comme nouvelle étape (switch d'onglet, retour…).
      const restoreNoPush = (d) => { suppress.current = true; onRestore(d); setTimeout(() => { suppress.current = false; }, 0); };

      const selectTab = (t) => { if (t.uid === activeUid) return; setActiveUid(t.uid); restoreNoPush(head(t)); };
      const newTab = () => {
        const uid = ++seqRef.current;
        setTabs(prev => [...prev, { uid, history: [{ view: 'dashboard', label: 'Nouvel onglet' }] }]);
        setActiveUid(uid);
        restoreNoPush({ view: 'dashboard' }); // vue neutre sous le nouvel onglet
        if (onOpenPalette) onOpenPalette();    // on propose tout de suite la recherche
      };
      const closeTab = (t, e) => {
        if (e) e.stopPropagation();
        if (tabs.length === 1) return; // garder au moins un onglet
        const idx = tabs.findIndex(x => x.uid === t.uid);
        const next = tabs.filter(x => x.uid !== t.uid);
        setTabs(next);
        if (t.uid === activeUid) { const fb = next[Math.min(idx, next.length - 1)]; setActiveUid(fb.uid); restoreNoPush(head(fb)); }
      };
      const goBack = () => {
        const t = tabs.find(x => x.uid === activeUid);
        if (!t || t.history.length <= 1) return;
        const h = t.history.slice(0, -1);
        setTabs(prev => prev.map(x => x.uid === activeUid ? { ...x, history: h } : x));
        restoreNoPush(h[h.length - 1]);
      };
      const onDrop = (i) => (e) => {
        e.preventDefault();
        const from = dragFrom.current; dragFrom.current = null;
        if (from == null || from === i) return;
        setTabs(prev => { const arr = [...prev]; const [m] = arr.splice(from, 1); arr.splice(i, 0, m); return arr; });
      };

      // Ctrl+T (nouvel onglet) / Ctrl+W (fermer, si >1 onglet) / Alt+← (retour dans l'onglet).
      React.useEffect(() => {
        const onKey = (e) => {
          const k = (e.key || '').toLowerCase();
          if ((e.ctrlKey || e.metaKey) && k === 't') { e.preventDefault(); newTab(); }
          else if ((e.ctrlKey || e.metaKey) && k === 'w' && tabs.length > 1) { e.preventDefault(); const t = tabs.find(x => x.uid === activeUid); if (t) closeTab(t); }
          else if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); goBack(); }
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
      }, [tabs, activeUid, onRestore]);

      const iconPath = {
        dashboard: 'M3 13h8V3H3zM13 21h8V11h-8zM13 3v6h8V3zM3 21h8v-6H3z',
        suivi: 'M3 3v18h18 M18 9l-5 5-3-3-4 4',
        campagnes: 'M3 11l19-9-9 19-2-8-8-2z',
        attribution: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
        prospect: 'M20 21v-2a4 4 0 0 0-3-3.87 M4 21v-2a4 4 0 0 1 3-3.87 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
      };
      const TabIcon = (v) => React.createElement('svg', { width: 13, height: 13, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', style: { flexShrink: 0 }, dangerouslySetInnerHTML: { __html: `<path d="${iconPath[v] || iconPath.dashboard}"/>` } });

      // Fil d'Ariane dérivé de la vue courante (le dernier crumb = vue active, non cliquable).
      const crumbsFor = (v) => {
        const home = { label: 'Accueil', go: { view: 'dashboard' } };
        const listeLabels = { 'liste-societes': 'Sociétés', 'liste-devis': 'Devis en cours', 'liste-actions': 'Actions' };
        if (v.view === 'prospect')    return [home, { label: 'Sociétés', go: { view: 'liste-societes' } }, { label: v.label }];
        if (v.view === 'dashboard')   return [{ label: 'Accueil' }];
        if (v.view && v.view.indexOf('liste-') === 0) return [home, { label: listeLabels[v.view] || 'Liste' }];
        if (v.view === 'campagnes')   return [home, { label: 'Campagnes' }];
        if (v.view === 'attribution') return [home, { label: 'Attribution' }];
        return [home];
      };
      const crumbs = crumbsFor(currentView);
      const activeTab = tabs.find(t => t.uid === activeUid);
      const canBack = !!activeTab && activeTab.history.length > 1;

      return (
        <React.Fragment>
        <div style={{ flexShrink: 0, background: 'var(--tw-bg)', borderBottom: '0.5px solid var(--tw-border)', fontFamily: "'Inter', system-ui, sans-serif" }}>
          {/* Onglets (rangée du haut) */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', padding: '6px 10px 0', overflowX: 'auto' }}>
            {tabs.map((t, i) => {
              const active = t.uid === activeUid; const hv = head(t);
              return (
                <div key={t.uid} draggable
                  onDragStart={(e) => { dragFrom.current = i; e.dataTransfer.effectAllowed = 'move'; }}
                  onDragOver={(e) => e.preventDefault()} onDrop={onDrop(i)}
                  onClick={() => selectTab(t)} onAuxClick={(e) => { if (e.button === 1) closeTab(t, e); }}
                  title={hv.label}
                  style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '7px 11px', maxWidth: '200px', fontSize: '12.5px', cursor: 'pointer', whiteSpace: 'nowrap', borderRadius: '8px 8px 0 0', border: '0.5px solid ' + (active ? 'var(--tw-border)' : 'transparent'), borderBottom: 'none', background: active ? 'white' : 'transparent', color: active ? '#12a0dc' : 'var(--tw-slate)', fontWeight: active ? 600 : 500, marginBottom: active ? '-1px' : 0, userSelect: 'none' }}>
                  {TabIcon(hv.view)}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{hv.label || 'Onglet'}</span>
                  {tabs.length > 1 && (
                    <span onClick={(e) => closeTab(t, e)} title="Fermer (Ctrl+W)"
                      style={{ width: '16px', height: '16px', borderRadius: '4px', display: 'grid', placeItems: 'center', fontSize: '14px', lineHeight: 1, opacity: .55 }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,.08)'; e.currentTarget.style.opacity = 1; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.opacity = .55; }}>×</span>
                  )}
                </div>
              );
            })}
            <button onClick={newTab} title="Nouvel onglet (Ctrl+T)"
              style={{ width: '28px', height: '28px', border: 'none', background: 'transparent', color: 'var(--tw-slate)', fontSize: '18px', borderRadius: '7px', cursor: 'pointer', flexShrink: 0, marginBottom: '2px' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#eaf0f4'; e.currentTarget.style.color = '#12a0dc'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--tw-slate)'; }}>+</button>
          </div>
        </div>
        {/* Fil d'Ariane + Retour : rendu via PORTAIL dans l'emplacement situé SOUS le
            Header (collé au contenu) pour être bien visible, alors que toute la logique
            (historique, canBack…) reste dans ce composant. */}
        {bcSlot && ReactDOM.createPortal(
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 24px', background: 'white', borderBottom: '0.5px solid var(--tw-border)', flexShrink: 0, fontFamily: "'Inter', system-ui, sans-serif" }}>
            <button onClick={goBack} disabled={!canBack} title="Retour (Alt+←)"
              style={{ width: '26px', height: '26px', borderRadius: '7px', border: '0.5px solid var(--tw-border)', background: 'white', cursor: canBack ? 'pointer' : 'default', color: canBack ? 'var(--tw-slate)' : '#d4dbe0', display: 'grid', placeItems: 'center', flexShrink: 0 }}
              onMouseEnter={(e) => { if (canBack) { e.currentTarget.style.borderColor = '#12a0dc'; e.currentTarget.style.color = '#12a0dc'; } }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--tw-border)'; e.currentTarget.style.color = canBack ? 'var(--tw-slate)' : '#d4dbe0'; }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            </button>
            <nav style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: 'var(--tw-slate)', overflow: 'hidden' }}>
              {crumbs.map((c, i) => {
                const last = i === crumbs.length - 1;
                return (
                  <React.Fragment key={i}>
                    {c.go && !last
                      ? <a onClick={() => onRestore(c.go)} style={{ cursor: 'pointer', padding: '2px 6px', borderRadius: '5px', color: 'var(--tw-slate)', whiteSpace: 'nowrap' }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = '#e8f6fc'; e.currentTarget.style.color = '#12a0dc'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--tw-slate)'; }}>{c.label}</a>
                      : <span style={{ color: last ? 'var(--tw-ink)' : 'var(--tw-slate)', fontWeight: last ? 600 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '420px' }}>{c.label}</span>}
                    {!last && <span style={{ opacity: .4, fontSize: '11px' }}>›</span>}
                  </React.Fragment>
                );
              })}
            </nav>
          </div>,
          bcSlot
        )}
        </React.Fragment>
      );
    }
