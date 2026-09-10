import * as React from 'react';
import { prospectDisplayName } from '../lib/shared.jsx';
import { API_URL } from '../lib/constants.js';

// Barre du haut (refonte « épurée ») :
//  - le logo / nom TexasWin ramène au Dashboard (plus de bouton dédié) ;
//  - UNE recherche : sociétés (locale, instantanée) + contacts / devis / affaires
//    (serveur, GET /api/search dès 2 caractères) ; Ctrl+K place le curseur dedans ;
//  - un seul menu « + Créer » : société, devis avec configurateur, devis simple ;
//  - l'avatar ouvre le menu utilisateur : paramètres, attribution, déconnexion.
const TYPE_LABEL = { interlocuteur: 'Contacts', devis: 'Devis', affaire: 'Affaires' };
const TYPE_ICON = { interlocuteur: '👤', devis: '📄', affaire: '📁' };

export function Header({ user, onLogout, onDashboard, isDashboard, onSettings, onAttribution, showAttribution, onCampagnes, showCampagnes, onPipeline, showPipeline, onListe, activeListe, prospects, onSelectProspect, onNewProspect, dueTodayCount, onOpenMyActions, onNewDevisConfigurateur, onNewDevisSimple }) {
      const [globalSearch, setGlobalSearch] = React.useState('');
      const [showResults, setShowResults] = React.useState(false);
      const [searchIndex, setSearchIndex] = React.useState(-1);
      const [serverResults, setServerResults] = React.useState([]);
      const [showCreate, setShowCreate] = React.useState(false);
      const [showUserMenu, setShowUserMenu] = React.useState(false);
      const searchRef = React.useRef(null);
      const inputRef = React.useRef(null);
      const createRef = React.useRef(null);
      const userRef = React.useRef(null);
      const seqRef = React.useRef(0);
      const [focused, setFocused] = React.useState(false); // boîte de recherche active (mise en évidence + panneau d'aide)

      React.useEffect(() => {
        const handleClickOutside = (e) => {
          if (searchRef.current && !searchRef.current.contains(e.target)) setShowResults(false);
          if (createRef.current && !createRef.current.contains(e.target)) setShowCreate(false);
          if (userRef.current && !userRef.current.contains(e.target)) setShowUserMenu(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
      }, []);

      // Ctrl+K (géré dans overlay.jsx) et le bouton de la barre d'onglets envoient tw:search-focus.
      React.useEffect(() => {
        const onFocus = () => {
          if (!inputRef.current) return;
          inputRef.current.focus();
          inputRef.current.select();
          setFocused(true);     // mise en évidence même si l'événement focus ne part pas (fenêtre inactive)
          setShowResults(true); // panneau ouvert tout de suite : aide si vide, résultats sinon
        };
        // Ctrl+K géré ici aussi (repli si l'overlay n'est pas monté) ; l'overlay dispatche
        // le même événement, l'effet est idempotent.
        const onKey = (e) => {
          if ((e.ctrlKey || e.metaKey) && String(e.key || '').toLowerCase() === 'k') { e.preventDefault(); onFocus(); }
        };
        window.addEventListener('tw:search-focus', onFocus);
        document.addEventListener('keydown', onKey);
        return () => { window.removeEventListener('tw:search-focus', onFocus); document.removeEventListener('keydown', onKey); };
      }, [globalSearch]);

      // Recherche serveur (contacts, devis, affaires) avec délai anti-rafale ;
      // les sociétés viennent de la liste locale, on ignore donc le type prospect.
      React.useEffect(() => {
        const q = globalSearch.trim();
        if (q.length < 2) { setServerResults([]); return; }
        const seq = ++seqRef.current;
        const t = setTimeout(async () => {
          try {
            const r = await fetch(`${API_URL}/search?q=${encodeURIComponent(q)}`, { headers: { 'Authorization': `Bearer ${user.token}` } });
            const rows = r.ok ? await r.json() : [];
            if (seq !== seqRef.current) return;
            setServerResults((Array.isArray(rows) ? rows : []).filter(x => x.type !== 'prospect'));
          } catch { if (seq === seqRef.current) setServerResults([]); }
        }, 250);
        return () => clearTimeout(t);
      }, [globalSearch, user.token]);

      const needle = globalSearch.toLowerCase();
      const filteredProspects = globalSearch.length >= 2 && prospects
        ? prospects.filter(p =>
            p.name.toLowerCase().includes(needle) ||
            (p.contact_name && p.contact_name.toLowerCase().includes(needle)) ||
            (Array.isArray(p.marques) && p.marques.some(m => m.toLowerCase().includes(needle)))
          ).slice(0, 6)
        : [];
      // Liste plate pour la navigation clavier : sociétés puis entités serveur groupées par type.
      const flat = [
        ...filteredProspects.map(p => ({ kind: 'societe', key: 'p' + p.id, p })),
        ...['interlocuteur', 'devis', 'affaire'].flatMap(t => serverResults.filter(r => r.type === t).slice(0, 4).map(r => ({ kind: 'entity', key: r.id, r }))),
      ];
      const closeSearch = () => { setGlobalSearch(''); setShowResults(false); setSearchIndex(-1); setServerResults([]); setFocused(false); };
      const runItem = (it) => {
        if (!it) return;
        if (it.kind === 'societe') onSelectProspect(it.p);
        else window.dispatchEvent(new CustomEvent('tw:navigate', { detail: { prospectId: it.r.prospectId, affaireId: it.r.affaireId || null, type: it.r.type, entityId: it.r.entityId } }));
        closeSearch();
        if (inputRef.current) inputRef.current.blur();
      };

      const initials = (name) => name ? name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2) : '?';
      const isAdmin = ['Christian', 'Frédéric', 'Frederic'].includes(user.name);

      // Couleur d'avatar dérivée du nom (pastel cohérent par utilisateur)
      const avatarPalette = [
        {bg:'#fde8d4', fg:'#b06e2a'},
        {bg:'#d3edff', fg:'#0a5085'},
        {bg:'#d8f0e3', fg:'#0f6e56'},
        {bg:'#f1ecfa', fg:'#6b3aa1'},
        {bg:'#ffe1e1', fg:'#a52d2d'},
      ];
      const avatarColor = avatarPalette[(user.name || '').charCodeAt(0) % avatarPalette.length] || avatarPalette[0];

      const none = !showAttribution && !showCampagnes && !activeListe && !showPipeline;
      const dashOn = isDashboard && none;
      const navBtn = (label, on, onClick) => (
        <button key={label} onClick={onClick}
          style={{padding:'6px 14px',borderRadius:'999px',background: on ? 'var(--primary)' : 'transparent',color: on ? '#fff' : 'rgba(255,255,255,.82)',border:'none',fontSize:'13px',fontWeight: on ? 600 : 500,fontFamily:'Inter,sans-serif',cursor:'pointer',transition:'all .15s',whiteSpace:'nowrap'}}>{label}</button>
      );
      const menuItem = (label, sub, onClick, extra = {}) => (
        <div key={label} className="tw-search-item" onClick={onClick} style={extra.style}>
          <div style={{fontWeight:600,fontSize:'13px',color: extra.danger ? '#a52d2d' : 'var(--tw-ink)'}}>{label}</div>
          {sub && <div style={{fontSize:'11px',color:'var(--tw-muted)',marginTop:'2px'}}>{sub}</div>}
        </div>
      );
      const groupHead = (label) => (
        <div key={'g-' + label} style={{padding:'6px 12px 2px',fontSize:'10.5px',fontWeight:700,letterSpacing:'.5px',textTransform:'uppercase',color:'var(--tw-muted)'}}>{label}</div>
      );

      return (
        <div className="tw-topbar">
          {/* LOGO → Dashboard */}
          <div onClick={onDashboard} title="Tableau de bord" role="button"
            style={{display:'flex',alignItems:'center',gap:'8px',fontWeight:600,color:'#fff',fontSize:'14px',whiteSpace:'nowrap',cursor:'pointer',padding:'4px 8px 4px 2px',borderRadius:'999px',background: dashOn ? 'rgba(255,255,255,.12)' : 'transparent',transition:'background .15s'}}
            onMouseEnter={(e) => e.currentTarget.style.background='rgba(255,255,255,.18)'}
            onMouseLeave={(e) => e.currentTarget.style.background = dashOn ? 'rgba(255,255,255,.12)' : 'transparent'}>
            <div style={{width:'22px',height:'22px',borderRadius:'6px',background:'var(--tw-teal)',display:'flex',alignItems:'center',justifyContent:'center',color:'white',fontSize:'11px',fontWeight:600}}>T</div>
            TexasWin
          </div>

          {/* NAV PRINCIPALE */}
          <nav style={{display:'flex',gap:'2px',flexWrap:'wrap'}}>
            {navBtn('Pipeline', showPipeline, onPipeline)}
            {navBtn('Sociétés', activeListe === 'societes', () => onListe('societes'))}
            {navBtn('Devis', activeListe === 'devis', () => onListe('devis'))}
            {navBtn('Actions', activeListe === 'actions', () => onListe('actions'))}
          </nav>

          {/* RECHERCHE UNIQUE : sociétés + contacts + devis + affaires (Ctrl+K) */}
          <div ref={searchRef} style={{position:'relative',flex:1,maxWidth:'520px',marginLeft:'8px'}}>
            <div style={{display:'flex',alignItems:'center',gap:'8px',background: focused ? 'rgba(255,255,255,.96)' : 'rgba(255,255,255,.10)',border: focused ? '1px solid #fff' : '1px solid rgba(255,255,255,.16)',boxShadow: focused ? '0 0 0 3px rgba(43,107,240,.45)' : 'none',borderRadius:'999px',padding:'6px 12px',transition:'background .12s, box-shadow .12s'}}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={focused ? 'var(--tw-slate)' : 'rgba(255,255,255,.7)'} strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              <input
                ref={inputRef}
                type="text"
                placeholder="Rechercher une société, un contact, un devis, une affaire…"
                value={globalSearch}
                onChange={(e) => { setGlobalSearch(e.target.value); setShowResults(true); setSearchIndex(-1); }}
                onFocus={() => { setFocused(true); setShowResults(true); }}
                onBlur={() => setFocused(false)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') { closeSearch(); e.currentTarget.blur(); return; }
                  if (!showResults || flat.length === 0) return;
                  if (e.key === 'ArrowDown') { e.preventDefault(); setSearchIndex(i => Math.min(i+1, flat.length-1)); }
                  else if (e.key === 'ArrowUp') { e.preventDefault(); setSearchIndex(i => Math.max(i-1, 0)); }
                  else if (e.key === 'Enter') { e.preventDefault(); runItem(flat[searchIndex >= 0 ? searchIndex : 0]); }
                }}
                style={{flex:1,border:'none',outline:'none',background:'transparent',fontSize:'13px',fontFamily:'Inter,sans-serif',color: focused ? 'var(--tw-ink)' : '#fff',minWidth:0}}
              />
              <kbd title="Ctrl+K : aller à la recherche" style={{fontFamily:'Inter,sans-serif',fontSize:'10px',fontWeight:600,background: focused ? 'var(--tw-bg, #eef2f5)' : 'rgba(255,255,255,.14)',border: focused ? '1px solid var(--tw-border)' : '1px solid rgba(255,255,255,.2)',borderRadius:'4px',padding:'1px 5px',color: focused ? 'var(--tw-slate)' : 'rgba(255,255,255,.85)',whiteSpace:'nowrap'}}>Ctrl K</kbd>
            </div>
            {showResults && (
              <div className="tw-search-dropdown">
                {globalSearch.trim().length < 2 ? (
                  <div style={{padding: '12px 14px', fontSize: '12.5px', color: 'var(--tw-slate)', lineHeight: 1.5}}>
                    <div style={{fontWeight: 600, color: 'var(--tw-ink)', marginBottom: '4px'}}>Rechercher partout</div>
                    Tapez au moins deux lettres : société, contact, devis ou affaire.
                    <div style={{marginTop: '6px', color: 'var(--tw-muted)', fontSize: '11.5px'}}>↑ ↓ pour choisir · Entrée pour ouvrir · Échap pour fermer</div>
                  </div>
                ) : flat.length === 0 ? (
                  <div style={{padding: '16px', textAlign: 'center', color: 'var(--tw-muted)', fontSize: '13px'}}>Aucun résultat</div>
                ) : (() => {
                  const out = [];
                  let lastGroup = null;
                  flat.forEach((it, idx) => {
                    const group = it.kind === 'societe' ? 'Sociétés' : TYPE_LABEL[it.r.type] || it.r.type;
                    if (group !== lastGroup) { out.push(groupHead(group)); lastGroup = group; }
                    const active = idx === searchIndex;
                    if (it.kind === 'societe') {
                      const p = it.p;
                      out.push(
                        <div key={it.key} className="tw-search-item" style={{background: active ? 'var(--tw-teal-light)' : 'white'}} onMouseEnter={() => setSearchIndex(idx)} onClick={() => runItem(it)}>
                          <div style={{fontWeight: '600', fontSize: '13px', color: 'var(--tw-ink)'}}>{prospectDisplayName(p)}</div>
                          <div style={{fontSize: '11px', color: 'var(--tw-muted)', marginTop: '2px'}}>
                            {p.contact_name && `${p.contact_name} · `}
                            <span style={{color: p.statut_societe === 'Client' ? 'var(--tw-teal)' : p.statut_societe === 'Prospect' ? 'var(--tw-orange)' : p.statut_societe === 'Holding' ? '#0d7fb0' : p.statut_societe === 'Prestataire' ? '#7b5ea7' : 'var(--tw-muted)'}}>{p.statut_societe || 'Prospect'}</span>
                            {p.real_status && <span style={{color: 'var(--tw-slate)'}}> · {p.real_status}</span>}
                          </div>
                        </div>
                      );
                    } else {
                      const r = it.r;
                      out.push(
                        <div key={it.key} className="tw-search-item" style={{background: active ? 'var(--tw-teal-light)' : 'white'}} onMouseEnter={() => setSearchIndex(idx)} onClick={() => runItem(it)}>
                          <div style={{fontWeight: '600', fontSize: '13px', color: 'var(--tw-ink)'}}>{TYPE_ICON[r.type] || ''} {r.label}</div>
                          {r.sub && <div style={{fontSize: '11px', color: 'var(--tw-muted)', marginTop: '2px'}}>{r.sub}</div>}
                        </div>
                      );
                    }
                  });
                  return out;
                })()}
              </div>
            )}
          </div>

          {/* RAPPEL : actions à faire aujourd'hui / en retard */}
          {dueTodayCount > 0 && (
            <button
              onClick={onOpenMyActions}
              title={`${dueTodayCount} action(s) à traiter aujourd'hui ou en retard`}
              style={{display:'flex',alignItems:'center',gap:'6px',background:'var(--accent-orange)',border:'1px solid var(--accent-orange)',borderRadius:'999px',padding:'6px 12px',fontSize:'12.5px',fontWeight:700,fontFamily:'Inter,sans-serif',color:'#fff',cursor:'pointer',whiteSpace:'nowrap'}}
            >
              🔔 {dueTodayCount} à faire
            </button>
          )}

          {/* + CRÉER : société, devis avec configurateur, devis simple */}
          <div ref={createRef} style={{position:'relative'}}>
            <button
              onClick={() => setShowCreate(v => !v)}
              style={{background:'linear-gradient(180deg,#2B6BF0,var(--primary))',color:'white',border:'none',padding:'7px 14px',borderRadius:'999px',fontSize:'13px',fontWeight:600,fontFamily:'Inter,sans-serif',cursor:'pointer',display:'flex',alignItems:'center',gap:'6px',whiteSpace:'nowrap'}}
              onMouseEnter={(e) => e.currentTarget.style.background = 'linear-gradient(180deg,#3B7BFF,#1E5FE0)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'linear-gradient(180deg,#2B6BF0,var(--primary))'}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
              Créer <span style={{fontSize:'9px',opacity:.85}}>▾</span>
            </button>
            {showCreate && (
              <div className="tw-search-dropdown" style={{left:'auto',right:0,minWidth:'300px'}}>
                {menuItem('🏢 Nouvelle société', 'Fiche société : coordonnées, contacts, affaires', () => { setShowCreate(false); onNewProspect(); })}
                {menuItem('📦 Devis avec configurateur', "Modules, abonnements, formation. Estimation libre ; société choisie à l'enregistrement.", () => { setShowCreate(false); if (onNewDevisConfigurateur) onNewDevisConfigurateur(); })}
                {menuItem('📝 Devis simple', "Grille Réf / Désignation / PU / Qté → PDF. Société choisie d'abord.", () => { setShowCreate(false); if (onNewDevisSimple) onNewDevisSimple(); })}
              </div>
            )}
          </div>

          {/* UTILISATEUR : avatar → paramètres, attribution, déconnexion */}
          <div ref={userRef} style={{position:'relative'}}>
            <button
              onClick={() => setShowUserMenu(v => !v)}
              title={user.name}
              aria-label="Menu utilisateur"
              style={{display:'flex',alignItems:'center',gap:'8px',padding:'3px 4px 3px 10px',background: showUserMenu ? 'rgba(255,255,255,.2)' : 'rgba(255,255,255,.10)',border:'1px solid rgba(255,255,255,.14)',borderRadius:'999px',cursor:'pointer',fontFamily:'Inter,sans-serif'}}
            >
              <span style={{fontSize:'13px',color:'#fff',fontWeight:500,whiteSpace:'nowrap'}}>{user.name}</span>
              <div style={{width:'28px',height:'28px',borderRadius:'50%',background:avatarColor.bg,color:avatarColor.fg,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'11px',fontWeight:600}}>{initials(user.name)}</div>
            </button>
            {showUserMenu && (
              <div className="tw-search-dropdown" style={{left:'auto',right:0,minWidth:'240px'}}>
                {isAdmin && menuItem('⚙️ Paramètres', null, () => { setShowUserMenu(false); onSettings(); })}
                {menuItem('📣 Campagnes', 'Emailings, notes d\'information, opt-in', () => { setShowUserMenu(false); onCampagnes(); }, { style: showCampagnes ? { background: 'var(--tw-teal-light)' } : undefined })}
                {user.name === 'Christian' && menuItem('🗂️ Attribution', 'Répartition des sociétés entre commerciaux', () => { setShowUserMenu(false); onAttribution(); })}
                {menuItem('Déconnexion', null, () => { setShowUserMenu(false); onLogout(); }, { danger: true, style: { borderTop: '0.5px solid var(--tw-border)' } })}
              </div>
            )}
          </div>
        </div>
      );
    }
