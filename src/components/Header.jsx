import * as React from 'react';
import { prospectDisplayName } from '../lib/shared.jsx';

export function Header({ user, onLogout, onDashboard, onSuivi, isDashboard, onSettings, onAttribution, showAttribution, onCampagnes, showCampagnes, onPipeline, showPipeline, onListe, activeListe, prospects, onSelectProspect, onNewProspect, dueTodayCount, onOpenMyActions }) {
      const [globalSearch, setGlobalSearch] = React.useState('');
      const [showResults, setShowResults] = React.useState(false);
      const [searchIndex, setSearchIndex] = React.useState(-1);
      const searchRef = React.useRef(null);

      React.useEffect(() => {
        const handleClickOutside = (e) => {
          if (searchRef.current && !searchRef.current.contains(e.target)) setShowResults(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
      }, []);

      const filteredProspects = globalSearch.length >= 2 && prospects
        ? prospects.filter(p =>
            p.name.toLowerCase().includes(globalSearch.toLowerCase()) ||
            (p.contact_name && p.contact_name.toLowerCase().includes(globalSearch.toLowerCase())) ||
            (Array.isArray(p.marques) && p.marques.some(m => m.toLowerCase().includes(globalSearch.toLowerCase())))
          ).slice(0, 10)
        : [];

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

      return (
        <div className="tw-topbar">
          {/* LOGO */}
          <div style={{display:'flex',alignItems:'center',gap:'8px',fontWeight:600,color:'#fff',fontSize:'14px',whiteSpace:'nowrap'}}>
            <div style={{width:'22px',height:'22px',borderRadius:'6px',background:'var(--tw-teal)',display:'flex',alignItems:'center',justifyContent:'center',color:'white',fontSize:'11px',fontWeight:600}}>T</div>
            TexasWin
          </div>

          {/* NAV PRINCIPALE (gauche) */}
          <nav style={{display:'flex',gap:'2px',flexWrap:'wrap'}}>
            {(() => {
              const none = !showAttribution && !showCampagnes && !activeListe && !showPipeline;
              const dashOn = isDashboard && none;
              const navBtn = (label, on, onClick) => (
                <button key={label} onClick={onClick}
                  style={{padding:'6px 14px',borderRadius:'999px',background: on ? 'var(--primary)' : 'transparent',color: on ? '#fff' : 'rgba(255,255,255,.82)',border:'none',fontSize:'13px',fontWeight: on ? 600 : 500,fontFamily:'Inter,sans-serif',cursor:'pointer',transition:'all .15s',whiteSpace:'nowrap'}}>{label}</button>
              );
              return (
                <React.Fragment>
                  {navBtn('Dashboard', dashOn, () => { if (!dashOn) onDashboard(); })}
                  {navBtn('Pipeline', showPipeline, onPipeline)}
                  {navBtn('Sociétés', activeListe === 'societes', () => onListe('societes'))}
                  {navBtn('Devis en cours', activeListe === 'devis', () => onListe('devis'))}
                  {navBtn('Actions', activeListe === 'actions', () => onListe('actions'))}
                  {navBtn('Campagnes', showCampagnes, onCampagnes)}
                  {user.name === 'Christian' && navBtn('Attribution', showAttribution, onAttribution)}
                </React.Fragment>
              );
            })()}
          </nav>

          {/* SEARCH (centre, étirée) */}
          <div ref={searchRef} style={{position:'relative',flex:1,maxWidth:'420px',marginLeft:'8px'}}>
            <div style={{display:'flex',alignItems:'center',gap:'8px',background:'rgba(255,255,255,.10)',border:'1px solid rgba(255,255,255,.16)',borderRadius:'999px',padding:'6px 12px'}}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.7)" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              <input
                type="text"
                placeholder="Rechercher une société..."
                value={globalSearch}
                onChange={(e) => { setGlobalSearch(e.target.value); setShowResults(e.target.value.length >= 2); setSearchIndex(-1); }}
                onFocus={() => globalSearch.length >= 2 && setShowResults(true)}
                onKeyDown={(e) => {
                  if (!showResults || filteredProspects.length === 0) return;
                  if (e.key === 'ArrowDown') { e.preventDefault(); setSearchIndex(i => Math.min(i+1, filteredProspects.length-1)); }
                  else if (e.key === 'ArrowUp') { e.preventDefault(); setSearchIndex(i => Math.max(i-1, 0)); }
                  else if (e.key === 'Enter' && searchIndex >= 0) {
                    const p = filteredProspects[searchIndex];
                    onSelectProspect(p); setGlobalSearch(''); setShowResults(false); setSearchIndex(-1);
                  } else if (e.key === 'Escape') { setShowResults(false); setSearchIndex(-1); }
                }}
                style={{flex:1,border:'none',outline:'none',background:'transparent',fontSize:'13px',fontFamily:'Inter,sans-serif',color:'#fff',minWidth:0}}
              />
            </div>
            {showResults && (
              <div className="tw-search-dropdown">
                {filteredProspects.length > 0 ? filteredProspects.map((p, idx) => (
                  <div key={p.id} className="tw-search-item"
                    style={{background: idx === searchIndex ? 'var(--tw-teal-light)' : 'white'}}
                    onClick={() => {
                    onSelectProspect(p); setGlobalSearch(''); setShowResults(false); setSearchIndex(-1);
                  }}>
                    <div style={{fontWeight: '600', fontSize: '13px', color: 'var(--tw-ink)'}}>{prospectDisplayName(p)}</div>
                    <div style={{fontSize: '11px', color: 'var(--tw-muted)', marginTop: '2px'}}>
                      {p.contact_name && `${p.contact_name} · `}
                      <span style={{color: p.statut_societe === 'Client' ? 'var(--tw-teal)' : p.statut_societe === 'Prospect' ? 'var(--tw-orange)' : 'var(--tw-muted)'}}>{p.statut_societe || 'Prospect'}</span>
                      {p.real_status && <span style={{color: 'var(--tw-slate)'}}> · {p.real_status}</span>}
                    </div>
                  </div>
                )) : (
                  <div style={{padding: '16px', textAlign: 'center', color: 'var(--tw-muted)', fontSize: '13px'}}>Aucune société trouvée</div>
                )}
              </div>
            )}
          </div>

          {/* RECHERCHE GLOBALE (palette Ctrl+K) — multi-entités : sociétés, devis, affaires, contacts.
              Distincte de la recherche "société" ci-dessus. Émet tw:palette (l'overlay écoute). */}
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('tw:palette'))}
            title="Rechercher partout (Ctrl+K) — sociétés, devis, affaires, contacts"
            style={{display:'flex',alignItems:'center',gap:'7px',background:'rgba(255,255,255,.10)',border:'1px solid rgba(255,255,255,.16)',borderRadius:'999px',padding:'6px 10px',fontSize:'12.5px',fontFamily:'Inter,sans-serif',color:'rgba(255,255,255,.82)',cursor:'pointer',whiteSpace:'nowrap',transition:'all .15s'}}
            onMouseEnter={(e)=>{e.currentTarget.style.borderColor='rgba(255,255,255,.4)';e.currentTarget.style.color='#fff';}}
            onMouseLeave={(e)=>{e.currentTarget.style.borderColor='rgba(255,255,255,.16)';e.currentTarget.style.color='rgba(255,255,255,.82)';}}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>
            Rechercher partout
            <kbd style={{fontFamily:'Inter,sans-serif',fontSize:'10px',fontWeight:600,background:'white',border:'0.5px solid var(--tw-border)',borderRadius:'4px',padding:'1px 5px',color:'var(--tw-slate)'}}>Ctrl K</kbd>
          </button>

          {/* RAPPEL : actions à faire aujourd'hui / en retard (badge cliquable → mes Actions) */}
          {dueTodayCount > 0 && (
            <button
              onClick={onOpenMyActions}
              title={`${dueTodayCount} action(s) à traiter aujourd'hui ou en retard`}
              style={{display:'flex',alignItems:'center',gap:'6px',background:'var(--accent-orange)',border:'1px solid var(--accent-orange)',borderRadius:'999px',padding:'6px 12px',fontSize:'12.5px',fontWeight:700,fontFamily:'Inter,sans-serif',color:'#fff',cursor:'pointer',whiteSpace:'nowrap'}}
            >
              🔔 {dueTodayCount} à faire
            </button>
          )}

          {/* CTA NOUVELLE SOCIÉTÉ — bouton primaire noir style Vercel/Stripe */}
          <button
            onClick={onNewProspect}
            style={{background:'linear-gradient(180deg,#2B6BF0,var(--primary))',color:'white',border:'none',padding:'7px 14px',borderRadius:'999px',fontSize:'13px',fontWeight:600,fontFamily:'Inter,sans-serif',cursor:'pointer',display:'flex',alignItems:'center',gap:'6px',whiteSpace:'nowrap'}}
            onMouseEnter={(e) => e.currentTarget.style.background = 'linear-gradient(180deg,#3B7BFF,#1E5FE0)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'linear-gradient(180deg,#2B6BF0,var(--primary))'}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
            Nx Prospect
          </button>

          {/* PARAMÈTRES (icône discrète) */}
          {isAdmin && (
            <button
              onClick={onSettings}
              title="Paramètres"
              aria-label="Paramètres"
              style={{width:'32px',height:'32px',borderRadius:'999px',background:'rgba(255,255,255,.10)',border:'1px solid rgba(255,255,255,.16)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'rgba(255,255,255,.82)',transition:'all .15s'}}
              onMouseEnter={(e) => { e.currentTarget.style.background='rgba(255,255,255,.18)'; e.currentTarget.style.color='#fff'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background='rgba(255,255,255,.10)'; e.currentTarget.style.color='rgba(255,255,255,.82)'; }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            </button>
          )}

          {/* USER AVATAR + DÉCONNEXION */}
          <div style={{display:'flex',alignItems:'center',gap:'8px',padding:'4px 4px 4px 10px',background:'rgba(255,255,255,.10)',border:'1px solid rgba(255,255,255,.14)',borderRadius:'999px'}}>
            <span style={{fontSize:'13px',color:'#fff',fontWeight:500,whiteSpace:'nowrap'}}>{user.name}</span>
            <div style={{width:'28px',height:'28px',borderRadius:'50%',background:avatarColor.bg,color:avatarColor.fg,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'11px',fontWeight:600,fontFamily:'Inter,sans-serif'}}>{initials(user.name)}</div>
          </div>
          <button
            onClick={onLogout}
            title="Déconnexion"
            aria-label="Déconnexion"
            style={{width:'32px',height:'32px',borderRadius:'999px',background:'rgba(255,255,255,.10)',border:'1px solid rgba(255,255,255,.16)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'rgba(255,255,255,.82)',transition:'all .15s'}}
            onMouseEnter={(e) => { e.currentTarget.style.background='rgba(220,38,38,.85)'; e.currentTarget.style.color='#fff'; e.currentTarget.style.borderColor='rgba(220,38,38,.85)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background='rgba(255,255,255,.10)'; e.currentTarget.style.color='rgba(255,255,255,.82)'; e.currentTarget.style.borderColor='rgba(255,255,255,.16)'; }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>
          </button>
        </div>
      );
    }

    // ══════════════════════════════════════════════════
    // COMPOSANT : AttributionView
    // ══════════════════════════════════════════════════
