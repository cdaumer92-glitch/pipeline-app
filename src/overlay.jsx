import * as React from 'react';
import { createRoot } from 'react-dom/client';
const ReactDOM = { createRoot };

  (function () {
    'use strict';
    const { useState, useEffect, useRef, useCallback } = React;

    /* ---------- Styles isolés (préfixe .twnav / #twnav-root) ---------- */
    const CSS = `
      #twnav-root{ --twb:#12a0dc; --twb-dark:#0d7fb0; --twb-ghost:#e8f6fc;
        --twink:#1a2733; --twink-soft:#5b6b78; --twline:#e4eaef; --twwhite:#fff;
        --twshadow:0 10px 40px rgba(18,160,220,.18); font-family:'Poppins',sans-serif; }
      .twnav-overlay{ position:fixed; inset:0; background:rgba(20,35,48,.45); backdrop-filter:blur(3px);
        display:flex; align-items:flex-start; justify-content:center; padding-top:12vh; z-index:9000; animation:twfade .12s ease; }
      @keyframes twfade{ from{opacity:0} to{opacity:1} }
      .twnav-palette{ width:min(640px,92vw); background:var(--twwhite); border-radius:16px; box-shadow:var(--twshadow);
        overflow:hidden; animation:twpop .14s cubic-bezier(.2,.8,.3,1); }
      @keyframes twpop{ from{transform:translateY(-12px) scale(.98);opacity:0} to{transform:none;opacity:1} }
      .twnav-search{ display:flex; align-items:center; gap:12px; padding:17px 20px; border-bottom:1px solid var(--twline); }
      .twnav-search > svg{ color:var(--twb); flex-shrink:0; }
      .twnav-search input{ flex:1; border:none; outline:none; font-family:inherit; font-size:16px; color:var(--twink); background:none; }
      .twnav-search input::placeholder{ color:#a8b4bd; }
      .twnav-spin{ width:16px; height:16px; border:2px solid var(--twline); border-top-color:var(--twb); border-radius:50%; animation:twspin .6s linear infinite; }
      @keyframes twspin{ to{transform:rotate(360deg)} }
      .twnav-esc{ font-size:10.5px; font-weight:600; color:var(--twink-soft); border:1px solid var(--twline); border-radius:5px; padding:2px 7px; }
      .twnav-results{ max-height:360px; overflow-y:auto; padding:8px; }
      .twnav-group{ font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:.7px; color:var(--twink-soft);
        padding:10px 12px 5px; display:flex; align-items:center; gap:6px; }
      .twnav-item{ display:flex; align-items:center; gap:13px; padding:10px 12px; border-radius:9px; cursor:pointer; }
      .twnav-item.sel{ background:var(--twb-ghost); }
      .twnav-item .ic{ width:30px; height:30px; border-radius:8px; background:var(--twb-ghost); color:var(--twb);
        display:grid; place-items:center; flex-shrink:0; }
      .twnav-item .ic.rec{ background:#fdf3e3; color:#c47d10; }
      .twnav-item .ic.art{ background:#eef0ff; color:#5b5bd6; }
      .twnav-item .txt{ min-width:0; flex:1; }
      .twnav-item .txt b{ display:block; font-size:13.5px; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .twnav-item .txt span{ font-size:11.5px; color:var(--twink-soft); }
      .twnav-item .txt b mark{ background:#fff3b0; color:inherit; border-radius:2px; padding:0 1px; }
      .twnav-item .hint{ margin-left:auto; font-size:11px; color:#a8b4bd; flex-shrink:0; display:flex; gap:6px; align-items:center; }
      .twnav-item .hint kbd{ font-family:inherit; font-weight:600; background:#f4f7f9; border:1px solid var(--twline); border-radius:4px; padding:1px 5px; font-size:10px; }
      .twnav-item.sel .hint{ color:var(--twb); }
      .twnav-eye{ border:1px solid var(--twline); background:var(--twwhite); border-radius:6px; width:26px; height:26px;
        display:grid; place-items:center; cursor:pointer; color:var(--twink-soft); }
      .twnav-eye:hover{ border-color:var(--twb); color:var(--twb); }
      .twnav-empty{ padding:30px; text-align:center; color:var(--twink-soft); font-size:13px; }
      .twnav-foot{ display:flex; gap:16px; padding:10px 20px; border-top:1px solid var(--twline); font-size:11px; color:var(--twink-soft); align-items:center; }
      .twnav-foot span{ display:flex; align-items:center; gap:5px; }
      .twnav-foot kbd{ font-family:inherit; font-weight:600; background:#f4f7f9; border:1px solid var(--twline); border-radius:4px; padding:1px 5px; font-size:10px; }
      /* Peek (aperçu latéral) */
      .twnav-peek{ position:fixed; top:0; right:0; height:100vh; width:380px; max-width:92vw; background:var(--twwhite);
        border-left:1px solid var(--twline); box-shadow:-8px 0 30px rgba(26,39,51,.1); z-index:9100;
        display:flex; flex-direction:column; transform:translateX(100%); transition:transform .2s cubic-bezier(.2,.8,.3,1); }
      .twnav-peek.open{ transform:none; }
      .twnav-peek-head{ display:flex; align-items:center; gap:10px; padding:18px 20px; border-bottom:1px solid var(--twline); }
      .twnav-peek-head .ic{ width:34px; height:34px; border-radius:9px; background:var(--twb-ghost); color:var(--twb); display:grid; place-items:center; flex-shrink:0; }
      .twnav-peek-head b{ font-size:15px; font-weight:600; }
      .twnav-peek-head span{ font-size:11.5px; color:var(--twink-soft); display:block; }
      .twnav-peek-close{ margin-left:auto; width:30px; height:30px; border:1px solid var(--twline); background:var(--twwhite); border-radius:7px; cursor:pointer; color:var(--twink-soft); font-size:16px; }
      .twnav-peek-body{ flex:1; overflow-y:auto; padding:18px 20px; }
      .twnav-peek-body .f{ margin-bottom:13px; }
      .twnav-peek-body .f label{ display:block; font-size:11px; font-weight:600; color:var(--twink-soft); text-transform:uppercase; letter-spacing:.5px; margin-bottom:4px; }
      .twnav-peek-body .f .v{ font-size:14px; color:var(--twink); }
      .twnav-peek-foot{ padding:14px 20px; border-top:1px solid var(--twline); display:flex; gap:8px; }
      .twnav-btn{ flex:1; justify-content:center; display:flex; align-items:center; gap:7px; font-family:inherit; font-size:12.5px;
        font-weight:500; padding:9px 13px; border-radius:8px; border:1px solid var(--twline); background:var(--twwhite); color:var(--twink); cursor:pointer; }
      .twnav-btn.primary{ background:var(--twb); color:#fff; border-color:var(--twb); }
      .twnav-btn.primary:hover{ background:var(--twb-dark); }
      .twnav-toast{ position:fixed; bottom:24px; left:50%; transform:translateX(-50%) translateY(80px); background:#1a2733; color:#fff;
        font-size:13px; padding:12px 20px; border-radius:10px; box-shadow:var(--twshadow); transition:.25s cubic-bezier(.2,.8,.3,1); z-index:9200; }
      .twnav-toast.show{ transform:translateX(-50%) translateY(0); }
      /* Objet lié réutilisable (LinkedObject) — pour brancher les écrans en phase 2 */
      .twnav-lk{ color:var(--twb); cursor:pointer; font-weight:500; border-bottom:1px dotted rgba(18,160,220,.5); white-space:nowrap; }
      .twnav-lk:hover{ border-bottom-style:solid; background:var(--twb-ghost); border-radius:3px; }
    `;

    /* ---------- Icônes (chemins SVG inline) ---------- */
    const PATHS = {
      users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9"/>',
      cart:  '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/>',
      doc:   '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
      plus:  '<path d="M12 5v14M5 12h14"/>',
      clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
      star:  '<path d="M12 2l3 6.5 7 .9-5 4.9 1.2 7L12 18l-6.4 3.3L7 14.3l-5-4.9 7-.9z"/>',
      search:'<circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/>',
      eye:   '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/>',
      home:  '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
    };
    const Icon = ({ name, size = 16 }) => React.createElement('svg', {
      viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor',
      strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round',
      dangerouslySetInnerHTML: { __html: PATHS[name] || PATHS.search }
    });

    /* ---------- Surlignage du terme recherché (sans innerHTML, anti-XSS) ---------- */
    function highlight(text, q) {
      text = String(text == null ? '' : text);
      if (!q) return text;
      const i = text.toLowerCase().indexOf(q.toLowerCase());
      if (i < 0) return text;
      return [text.slice(0, i), <mark key="m">{text.slice(i, i + q.length)}</mark>, text.slice(i + q.length)];
    }

    /* ---------- Récents (session courante uniquement, pas localStorage) ---------- */
    function loadRecents() { try { return JSON.parse(sessionStorage.getItem('tw_nav_recents') || '[]'); } catch (e) { return []; } }
    function saveRecent(item) {
      let recents = loadRecents().filter(r => r.id !== item.id);
      recents = [item, ...recents].slice(0, 5);
      try { sessionStorage.setItem('tw_nav_recents', JSON.stringify(recents)); } catch (e) {}
      return recents;
    }

    /* ---------- Helpers de couplage avec l'app existante (events) ---------- */
    function navigateTo(detail) { window.dispatchEvent(new CustomEvent('tw:navigate', { detail })); }

    /* ===================================================================
       PEEK PANEL — aperçu latéral droit (getPeek). Piloté par un token pour
       ignorer les réponses périmées (anti-race), comme la recherche.
       =================================================================== */
    function PeekPanel({ peek, onClose }) {
      const open = !!peek;
      const data = peek && peek.data;
      return (
        <div className={'twnav-peek' + (open ? ' open' : '')} role="complementary" aria-hidden={!open}>
          {data && (
            <React.Fragment>
              <div className="twnav-peek-head">
                <div className="ic"><Icon name={data.icon} size={18} /></div>
                <div><b>{data.title}</b><span>{data.sub}</span></div>
                <button className="twnav-peek-close" onClick={onClose} aria-label="Fermer l'aperçu">×</button>
              </div>
              <div className="twnav-peek-body">
                {(data.fields || []).map((f, i) => (
                  <div className="f" key={i}><label>{f[0]}</label><div className="v">{f[1]}</div></div>
                ))}
              </div>
              <div className="twnav-peek-foot">
                <button className="twnav-btn primary" onClick={() => { navigateTo({ prospectId: data.prospectId, affaireId: data.affaireId }); onClose(); }}>
                  Ouvrir la fiche
                </button>
              </div>
            </React.Fragment>
          )}
          {peek && peek.loading && !data && (
            <div className="twnav-peek-head"><div className="ic"><div className="twnav-spin" /></div><div><b>Chargement…</b></div></div>
          )}
        </div>
      );
    }

    /* ===================================================================
       OVERLAY — possède la palette, le peek et le toast, et écoute les
       raccourcis clavier + les events globaux.
       =================================================================== */
    function Overlay() {
      const [open, setOpen] = useState(false);
      const [nav, setNav] = useState({ ecrans: [], actions: [] });
      const [q, setQ] = useState('');
      const [records, setRecords] = useState([]);
      const [loading, setLoading] = useState(false);
      const [sel, setSel] = useState(0);
      const [recents, setRecents] = useState(loadRecents());
      const [peek, setPeek] = useState(null);       // { loading } | { data }
      const [toast, setToast] = useState('');

      const inputRef = useRef(null);
      const verRef = useRef(0);        // token de version recherche (anti-race)
      const debRef = useRef(null);     // timer de débounce
      const peekVerRef = useRef(0);    // token de version peek (anti-race)
      const hoverRef = useRef(null);   // timer survol prolongé
      const flatRef = useRef([]);      // liste aplatie courante (pour le clavier)
      const selRef = useRef(0);
      const toastRef = useRef(null);

      // Référentiel de nav chargé une fois.
      useEffect(() => { NavApi.getNav().then(setNav); }, []);

      // Recherche débouncée 180 ms + token de version : on ignore toute réponse
      // qui n'est plus la dernière demandée (évite l'affichage de résultats périmés).
      useEffect(() => {
        clearTimeout(debRef.current);
        if (q.trim().length < 2) { setRecords([]); setLoading(false); return; }
        const ver = ++verRef.current;
        setLoading(true);
        debRef.current = setTimeout(() => {
          NavApi.searchRecords(q).then(res => {
            if (ver !== verRef.current) return;     // réponse périmée → ignorée
            setRecords(res || []);
            setLoading(false);
          });
        }, 180);
        return () => clearTimeout(debRef.current);
      }, [q]);

      const showToast = useCallback((msg) => {
        setToast(msg); clearTimeout(toastRef.current);
        toastRef.current = setTimeout(() => setToast(''), 1900);
      }, []);

      const openPeek = useCallback((type, id) => {
        const ver = ++peekVerRef.current;
        setPeek({ loading: true });
        NavApi.getPeek(type, id).then(data => {
          if (ver !== peekVerRef.current) return;   // peek périmé → ignoré
          if (data) setPeek({ data }); else setPeek(null);
        });
      }, []);
      const closePeek = useCallback(() => { peekVerRef.current++; setPeek(null); }, []);

      const openPalette = useCallback(() => { setOpen(true); setQ(''); setRecords([]); setSel(0); setRecents(loadRecents()); }, []);
      const closePalette = useCallback(() => { setOpen(false); setLoading(false); }, []);

      // Construit les groupes affichés + la liste aplatie (pour la navigation clavier).
      const buildGroups = () => {
        const s = q.trim().toLowerCase();
        const groups = [];
        if (!s) {
          if (recents.length) groups.push({ grp: 'Récents', icon: 'clock', items: recents.map(r => ({ ...r, kind: 'record', iconCls: 'rec', hint: 'Récent' })) });
          groups.push({ grp: 'Écrans', items: nav.ecrans.map(e => ({ id: 'ecran-' + e.id, ecranId: e.id, kind: 'ecran', icon: e.id === 'recap' ? 'star' : 'home', label: e.label, sub: e.sub, hint: 'Écran' })) });
          if (nav.actions.length) groups.push({ grp: 'Actions', items: nav.actions.map(a => ({ id: a.id, actionId: a.id, kind: 'action', icon: a.icon || 'plus', label: a.label, sub: a.sub, kbd: a.kbd })) });
          return groups;
        }
        const ec = nav.ecrans.filter(e => (e.label + ' ' + (e.sub || '')).toLowerCase().includes(s))
          .map(e => ({ id: 'ecran-' + e.id, ecranId: e.id, kind: 'ecran', icon: e.id === 'recap' ? 'star' : 'home', label: e.label, sub: e.sub, hint: 'Écran' }));
        const ac = nav.actions.filter(a => (a.label + ' ' + (a.sub || '')).toLowerCase().includes(s))
          .map(a => ({ id: a.id, actionId: a.id, kind: 'action', icon: a.icon || 'plus', label: a.label, sub: a.sub, kbd: a.kbd }));
        if (ec.length) groups.push({ grp: 'Écrans', items: ec });
        if (ac.length) groups.push({ grp: 'Actions', items: ac });
        if (records.length) groups.push({
          grp: 'Enregistrements', icon: 'star',
          items: records.map(r => ({ ...r, kind: 'record', iconCls: r.type === 'devis' ? 'art' : '', hint: ({ prospect: 'Client', affaire: 'Affaire', devis: 'Devis', interlocuteur: 'Contact' })[r.type] || r.type }))
        });
        return groups;
      };

      const runItem = useCallback((it) => {
        if (!it) return;
        if (it.kind === 'ecran') { navigateTo({ screen: it.ecranId }); closePalette(); return; }
        if (it.kind === 'action') { showToast('Action : ' + it.label); window.dispatchEvent(new CustomEvent('tw:action', { detail: { id: it.actionId } })); closePalette(); return; }
        // record
        setRecents(saveRecent({ id: it.id, type: it.type, entityId: it.entityId, icon: it.icon, label: it.label, sub: it.sub, prospectId: it.prospectId, affaireId: it.affaireId }));
        navigateTo({ prospectId: it.prospectId, type: it.type, entityId: it.entityId, affaireId: it.affaireId });
        closePalette();
      }, [closePalette, showToast]);

      // Survol prolongé (~550 ms) sur une ligne d'enregistrement → aperçu.
      const onItemEnter = (it) => { if (it.kind !== 'record') return; clearTimeout(hoverRef.current); hoverRef.current = setTimeout(() => openPeek(it.type, it.entityId), 550); };
      const onItemLeave = () => clearTimeout(hoverRef.current);

      // ---------- Raccourcis clavier globaux ----------
      useEffect(() => {
        const onKey = (e) => {
          const k = (e.key || '').toLowerCase();
          if ((e.ctrlKey || e.metaKey) && k === 'k') { e.preventDefault(); if (openRef.current) closePalette(); else openPalette(); return; }
          if (e.key === 'Escape') { if (peek) { closePeek(); return; } if (openRef.current) closePalette(); return; }
          if (!openRef.current) return;
          const flat = flatRef.current;
          if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s + 1, flat.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(s - 1, 0)); }
          else if (e.key === 'Enter') { e.preventDefault(); runItem(flat[selRef.current]); }
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
      }, [openPalette, closePalette, closePeek, runItem, peek]);

      // Events publics : ouvrir la palette / ouvrir un peek (utilisés par LinkedObject & boutons).
      useEffect(() => {
        const onPal = () => openPalette();
        const onPeek = (e) => { const d = (e && e.detail) || {}; if (d.type && d.id != null) openPeek(d.type, d.id); };
        window.addEventListener('tw:palette', onPal);
        window.addEventListener('tw:peek', onPeek);
        return () => { window.removeEventListener('tw:palette', onPal); window.removeEventListener('tw:peek', onPeek); };
      }, [openPalette, openPeek]);

      // Focus de l'input + reset sélection à l'ouverture.
      useEffect(() => { if (open && inputRef.current) inputRef.current.focus(); }, [open]);
      useEffect(() => { setSel(0); }, [q, records, open]);

      // Refs miroir pour le handler clavier (évite les closures périmées).
      const openRef = useRef(false);
      openRef.current = open;
      selRef.current = sel;

      const groups = buildGroups();
      const flat = [];
      groups.forEach(g => g.items.forEach(it => flat.push(it)));
      flatRef.current = flat;

      // Scroll de l'élément sélectionné dans la vue.
      useEffect(() => {
        if (!open) return;
        const el = document.querySelector('#twnav-root .twnav-item.sel');
        if (el) el.scrollIntoView({ block: 'nearest' });
      }, [sel, open]);

      let counter = 0;
      return (
        <React.Fragment>
          {open && (
            <div className="twnav-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) closePalette(); }}>
              <div className="twnav-palette" role="dialog" aria-label="Recherche rapide">
                <div className="twnav-search">
                  <Icon name="search" size={19} />
                  <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} autoComplete="off"
                    placeholder="Écran, action, ou n° SIREN / raison sociale / devis / contact…" />
                  {loading && <div className="twnav-spin" />}
                  <span className="twnav-esc">Échap</span>
                </div>
                <div className="twnav-results">
                  {flat.length === 0
                    ? <div className="twnav-empty">{q.trim().length >= 2 ? 'Aucun résultat pour « ' + q.trim() + ' »' : 'Tape au moins 2 caractères pour rechercher'}</div>
                    : groups.map((g, gi) => (
                      <React.Fragment key={gi}>
                        <div className="twnav-group">{g.icon && <Icon name={g.icon} size={12} />}{g.grp}</div>
                        {g.items.map((it) => {
                          const idx = counter++;
                          return (
                            <div key={it.id + '-' + idx} className={'twnav-item' + (idx === sel ? ' sel' : '')}
                              onMouseMove={() => setSel(idx)} onMouseEnter={() => onItemEnter(it)} onMouseLeave={onItemLeave}
                              onClick={() => runItem(it)}>
                              <div className={'ic ' + (it.iconCls || '')}><Icon name={it.icon} size={16} /></div>
                              <div className="txt"><b>{highlight(it.label, q.trim())}</b><span>{it.sub || ''}</span></div>
                              <span className="hint">
                                {it.kbd && it.kbd.map((kk, i) => <kbd key={i}>{kk}</kbd>)}
                                {it.kind === 'record' && (
                                  <button className="twnav-eye" title="Aperçu"
                                    onClick={(e) => { e.stopPropagation(); openPeek(it.type, it.entityId); }}>
                                    <Icon name="eye" size={13} />
                                  </button>
                                )}
                                {it.hint && <span>{it.hint}</span>}
                              </span>
                            </div>
                          );
                        })}
                      </React.Fragment>
                    ))}
                </div>
                <div className="twnav-foot">
                  <span><kbd>↑</kbd><kbd>↓</kbd> naviguer</span>
                  <span><kbd>↵</kbd> ouvrir</span>
                  <span><kbd>Échap</kbd> fermer</span>
                </div>
              </div>
            </div>
          )}
          <PeekPanel peek={peek} onClose={closePeek} />
          {toast && <div className="twnav-toast show">✓ {toast}</div>}
        </React.Fragment>
      );
    }

    /* ---------- LinkedObject : composant réutilisable pour brancher les écrans (phase 2) ----------
       Rend une entité comme un lien cliquable. Clic = ouvrir la fiche ; survol prolongé
       ou clic sur l'œil = aperçu. Découplé de l'overlay via les events globaux. */
    function LinkedObject({ type, id, prospectId, children }) {
      const hov = useRef(null);
      return (
        <span className="twnav-lk" title="Ouvrir — survol pour aperçu"
          onClick={() => navigateTo({ prospectId: prospectId, type, entityId: id })}
          onMouseEnter={() => { clearTimeout(hov.current); hov.current = setTimeout(() => window.dispatchEvent(new CustomEvent('tw:peek', { detail: { type, id } })), 550); }}
          onMouseLeave={() => clearTimeout(hov.current)}>
          {children}
        </span>
      );
    }

    /* ---------- Montage du second root + API publique ---------- */
    const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
    const mount = document.createElement('div'); mount.id = 'twnav-root'; document.body.appendChild(mount);
    ReactDOM.createRoot(mount).render(<Overlay />);

    // API publique pour la phase 2 (boutons "Rechercher partout", écrans branchés…).
    window.TWNav = {
      openPalette: () => window.dispatchEvent(new CustomEvent('tw:palette')),
      LinkedObject,
    };
  })();
  