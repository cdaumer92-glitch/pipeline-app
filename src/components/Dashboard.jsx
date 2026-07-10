import * as React from 'react';
import { I, ICONS, prospectDisplayName, typeChip } from '../lib/shared.jsx';
import { ImportPanel } from './ImportPanel.jsx';

export function Dashboard({ prospects, selectedCommercial, onSelectCommercial, onSelectProspect, onOpenDashboard, onOpenListe, user, API_URL, prospectActionsInfo, onShowRecap, setShowCompteurModal, setCompteurModalData, codesNaf = [], onRefreshProspects, setFilterCommercial, setFilterStatus, setFilterAttribution }) {
      const [activeTab, setActiveTab] = React.useState(null);
      const [showSocietes, setShowSocietes] = React.useState(false);
      const [societesSortCol, setSocietesSortCol] = React.useState('name');
      const [societesSortAsc, setSocietesSortAsc] = React.useState(true);
      // Filtre par type de société pour la 2e liste (drill-down par commercial dans le dashboard)
      const [societesTypeFilter, setSocietesTypeFilter] = React.useState('all');
      const [recapSending, setRecapSending] = React.useState(false);

      const [recapResult, setRecapResult] = React.useState(null);
      const [recapTarget, setRecapTarget] = React.useState('Moi (Christian)');
      const [recapType, setRecapType] = React.useState('actions');
      const [recapOpen, setRecapOpen] = React.useState(false);
      const [recapConfirm, setRecapConfirm] = React.useState(false);

      // ═══ États pour la modal de Prospection multi-critères SocieteInfo (Phase 5) ═══
      const [showProspectionModal, setShowProspectionModal] = React.useState(false);
      const [prospStep, setProspStep] = React.useState(1); // 1=NAF, 2=Zone, 3=Filtres, 4=Résultats
      const [prospNafCode, setProspNafCode] = React.useState('');           // ex: '14.13Z'
      const [prospNafLibelle, setProspNafLibelle] = React.useState('');     // libellé associé
      const [prospNafSearch, setProspNafSearch] = React.useState('');       // recherche fuzzy
      const [prospPlace, setProspPlace] = React.useState(null);             // {id, name, type}
      const [prospPlaceSearch, setProspPlaceSearch] = React.useState('');
      const [prospPlaceSuggestions, setProspPlaceSuggestions] = React.useState([]);
      const [prospWithPhone, setProspWithPhone] = React.useState(false);
      const [prospWithEmail, setProspWithEmail] = React.useState(false);
      const [prospWithSite, setProspWithSite] = React.useState(false);
      const [prospMinStaff, setProspMinStaff] = React.useState('');
      const [prospMaxStaff, setProspMaxStaff] = React.useState('');
      const [prospResults, setProspResults] = React.useState([]);
      const [prospResultsTotal, setProspResultsTotal] = React.useState(0);
      const [prospResultsPage, setProspResultsPage] = React.useState(1);
      const [prospResultsTotalPages, setProspResultsTotalPages] = React.useState(1);
      const [prospLoading, setProspLoading] = React.useState(false);
      const [prospError, setProspError] = React.useState('');
      const [prospSelected, setProspSelected] = React.useState(new Set()); // Set de SIREN cochés
      const [prospExistingSirens, setProspExistingSirens] = React.useState(new Set()); // SIREN déjà en BDD
      // Set des SIREN qui ont au moins un contact pro nominatif (email pro type personal),
      // détectés via 2e appel parallèle email_type=personal. Coût : +1 crédit/page.
      const [prospWithContactsSirens, setProspWithContactsSirens] = React.useState(new Set());
      const [prospImporting, setProspImporting] = React.useState(false);
      // Progression de l'enrichissement (récupération du téléphone/site via getCompany) pendant l'import
      const [prospEnrichProgress, setProspEnrichProgress] = React.useState(null);
      const [prospImportResult, setProspImportResult] = React.useState(null);

      const commerciaux = [...new Set(prospects.map(p => p.assigned_to).filter(Boolean))].sort();

      const sendTestRecap = async () => {
        setRecapConfirm(true);
      };

      const doSendTestRecap = async () => {
        setRecapConfirm(false);
        setRecapSending(true);
        setRecapResult(null);
        try {
          const res = await fetch(`${API_URL}/recap/send-test`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${user.token}`
            },
            body: JSON.stringify({ targetName: recapTarget === 'Moi (Christian)' ? 'Christian' : recapTarget, recapType })
          });
          const data = await res.json();
          if (data.ok) {
            setRecapResult({ ok: true, msg: `✅ Envoyé à ${data.email}` });
          } else {
            setRecapResult({ ok: false, msg: `❌ Erreur : ${data.error}` });
          }
        } catch (err) {
          setRecapResult({ ok: false, msg: `❌ ${err.message}` });
        }
        setRecapSending(false);
      };

      // ═══ Handlers Prospection multi-critères SocieteInfo ═══

      const openProspectionModal = () => {
        setShowProspectionModal(true);
        setProspStep(1);
        setProspNafCode(''); setProspNafLibelle(''); setProspNafSearch('');
        setProspPlace(null); setProspPlaceSearch(''); setProspPlaceSuggestions([]);
        setProspWithPhone(false); setProspWithEmail(false); setProspWithSite(false);
        setProspMinStaff(''); setProspMaxStaff('');
        setProspResults([]); setProspResultsTotal(0); setProspResultsPage(1); setProspResultsTotalPages(1);
        setProspError(''); setProspLoading(false);
        setProspSelected(new Set()); setProspExistingSirens(new Set()); setProspWithContactsSirens(new Set());
        setProspImportResult(null);
      };

      // Autocomplete zone géo - debounce léger
      React.useEffect(() => {
        if (!showProspectionModal) return;
        const q = prospPlaceSearch.trim();
        if (q.length < 2) { setProspPlaceSuggestions([]); return; }
        let cancelled = false;
        const t = setTimeout(async () => {
          try {
            const res = await window.SInfo.placeAutocomplete(q);
            if (!cancelled) setProspPlaceSuggestions(res.result || []);
          } catch (err) {
            if (!cancelled) setProspPlaceSuggestions([]);
          }
        }, 300);
        return () => { cancelled = true; clearTimeout(t); };
      }, [prospPlaceSearch, showProspectionModal]);

      // Lance la recherche multi-critères + détection des sociétés ayant
      // des contacts disponibles via des appels à /v2/contacts.json (concurrence
      // bornée à 4 + retry, cf. mapWithConcurrency/siCallWithRetry) en mode
      // show_all_anonymized=true (gratuit). Le badge ✉️ ne s'affiche
      // que si la société a vraiment au moins 1 contact dans la base SocieteInfo,
      // ce qui correspond effectivement à ce que l'enrichissement pourra ramener.
      // Coût : 1 crédit pour la recherche principale + 0 pour le marquage des contacts.
      const runProspectionSearch = async (page) => {
        setProspError('');
        setProspLoading(true);
        try {
          const criteria = {
            page: page || 1,
            limit: 25
          };
          if (prospNafCode) criteria.nafLevel = prospNafCode;
          if (prospPlace && prospPlace.id) criteria.placeId = prospPlace.id;
          if (prospWithPhone) criteria.withphone = true;
          if (prospWithEmail) criteria.withemail = true;
          if (prospWithSite)  criteria.withsite  = true;
          if (prospMinStaff)  criteria.minstaff  = prospMinStaff;
          if (prospMaxStaff)  criteria.maxstaff  = prospMaxStaff;

          // Appel principal : 1 crédit
          const data = await window.SInfo.multiSearch(criteria);
          const items = data.result || [];
          setProspResults(items);
          setProspResultsTotal(data.total || items.length);
          setProspResultsPage(data.currentPage || page || 1);
          setProspResultsTotalPages(data.totalPages || 1);

          // Marquage contacts : N appels parallèles à getContacts en mode anonymized.
          // GRATUIT côté SocieteInfo. On stocke dans un Set les SIREN qui ont au
          // moins 1 contact disponible. Si l'API échoue ponctuellement pour une
          // société, on dégrade gracieusement (pas de badge mais résultat affiché).
          const sirens = items.map(c => c.registration_number).filter(Boolean);
          if (sirens.length > 0) {
            // Concurrence bornée (4) + retry/back-off sur 429 : on ne sature plus
            // l'API SocieteInfo comme le faisait l'ancien map parallèle de 25 appels.
            const contactsChecks = await mapWithConcurrency(
              sirens,
              (s) => siCallWithRetry(() => window.SInfo.getContacts(s)),
              4
            );
            const contactsSirens = new Set();
            contactsChecks.forEach((res, idx) => {
              if (res.value) {
                const r = res.value || {};
                const list = r.contacts || r.result || r.results || [];
                const count = (typeof r.contacts_count === 'number') ? r.contacts_count : (Array.isArray(list) ? list.length : 0);
                if (count > 0) contactsSirens.add(sirens[idx]);
              }
              // res.error → on ne marque pas, dégradation gracieuse
            });
            setProspWithContactsSirens(contactsSirens);
          } else {
            setProspWithContactsSirens(new Set());
          }

          // Récupérer les SIREN déjà en BDD (Interprétation A : exclusion des déjà importées)
          if (sirens.length > 0) {
            try {
              const dupRes = await fetch(`${API_URL}/prospects`, {
                headers: { 'Authorization': `Bearer ${user.token}` }
              });
              const allProspects = await dupRes.json();
              const existing = new Set();
              for (const p of allProspects) {
                if (p.siren && sirens.includes(p.siren)) existing.add(p.siren);
                if (p.import_ref && sirens.includes(p.import_ref)) existing.add(p.import_ref);
              }
              setProspExistingSirens(existing);
            } catch (e) {
              // Si l'appel échoue, on n'affiche pas le grisé mais ce n'est pas bloquant
              setProspExistingSirens(new Set());
            }
          }

          if (items.length === 0) setProspError('Aucun résultat — essayez d\'élargir vos critères');
        } catch (err) {
          setProspError(err.message || 'Erreur recherche');
          setProspResults([]);
          setProspWithContactsSirens(new Set());
        } finally {
          setProspLoading(false);
        }
      };

      const toggleProspSelected = (siren) => {
        const next = new Set(prospSelected);
        if (next.has(siren)) next.delete(siren); else next.add(siren);
        setProspSelected(next);
      };

      const selectAllVisible = () => {
        const next = new Set(prospSelected);
        for (const c of prospResults) {
          const s = c.registration_number;
          if (s && !prospExistingSirens.has(s)) next.add(s);
        }
        setProspSelected(next);
      };

      const clearProspSelection = () => setProspSelected(new Set());

      // Import en lot - appelle la route protégée /api/prospects/bulk-import-sinfo
      const runProspectionImport = async () => {
        if (prospSelected.size === 0) {
          setProspError('Aucune société sélectionnée');
          return;
        }
        setProspImporting(true);
        setProspError('');
        try {
          const selected = prospResults.filter(c => prospSelected.has(c.registration_number));

          // ── Enrichissement téléphone + site web ──────────────────────────
          // L'endpoint liste /v2/companies.json ne renvoie NI téléphone NI site web
          // (uniquement identité + adresse). Le filtre "avec téléphone" garantit qu'un
          // numéro EXISTE chez SocieteInfo, mais pour l'obtenir il faut l'appel détail
          // /v2/company.json/{siren} (getCompany), payant 1 crédit/société.
          // On enrichit donc UNIQUEMENT les sociétés que l'on importe vraiment.
          // Séquentiel + throttle 350ms car les appels parallèles déclenchent des 429
          // (Too Many Requests) côté SocieteInfo.
          setProspEnrichProgress({ done: 0, total: selected.length });
          const companies = [];
          for (let i = 0; i < selected.length; i++) {
            const c = selected[i];
            const siren = c.registration_number;
            // Base depuis la liste : nom + adresse sont déjà fiables sans appel détail
            const entry = {
              siren,
              name:        c.name,
              city:        c.formatted_address ? (c.formatted_address.match(/\b\d{5}\s+(.+)$/) || [])[1] : null,
              postal_code: c.formatted_address ? (c.formatted_address.match(/\b(\d{5})\b/) || [])[1] : null,
              address:     c.formatted_address,
              phone:       null,
              website:     null,
              naf_code:    c.naf_code || prospNafCode || null
            };
            try {
              const det = await siCallWithRetry(() => window.SInfo.getCompany(siren));
              const mapped = window.SInfo.companyToProspect((det && det.result) || det);
              if (mapped.tel_standard) entry.phone = mapped.tel_standard;
              if (mapped.website)      entry.website = mapped.website;
              // Adresse plus précise depuis le détail si disponible
              if (mapped.adresse)      entry.address = mapped.adresse;
              if (mapped.cp)           entry.postal_code = mapped.cp;
              if (mapped.ville)        entry.city = mapped.ville;
              if (mapped.code_naf)     entry.naf_code = mapped.code_naf;
            } catch (e) {
              // Dégradation gracieuse : on importe quand même la société, juste sans téléphone
              console.warn('[Import SInfo] enrichissement échoué pour SIREN ' + siren + ' :', e.message);
            }
            companies.push(entry);
            setProspEnrichProgress({ done: i + 1, total: selected.length });
            // Throttle anti-429 entre deux appels (pas après le dernier)
            if (i < selected.length - 1) await new Promise(r => setTimeout(r, 350));
          }
          setProspEnrichProgress(null);

          const res = await fetch(`${API_URL}/prospects/bulk-import-sinfo`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${user.token}`
            },
            body: JSON.stringify({ companies })
          });
          const result = await res.json();
          if (!res.ok) throw new Error(result.error || 'Erreur import');
          setProspImportResult(result);
          if (window.showToast) {
            window.showToast({
              title: `${result.inserted_count} société(s) importée(s)` +
                     (result.skipped_count > 0 ? ` · ${result.skipped_count} déjà connue(s)` : ''),
              type: 'success'
            });
          }
          // Rafraîchir la liste des prospects en mémoire pour que les nouveaux Suspects
          // apparaissent immédiatement dans Attribution sans nécessiter un F5
          if (result.inserted_count > 0 && typeof onRefreshProspects === 'function') {
            onRefreshProspects();
          }
        } catch (err) {
          setProspError(err.message || 'Erreur import');
        } finally {
          setProspImporting(false);
          setProspEnrichProgress(null);
        }
      };
      const thisYear = new Date().getFullYear();
      const today = new Date(); today.setHours(0,0,0,0);

      // ── Stats globales ──
      const nbSuspects  = prospects.filter(p => p.statut_societe === 'Suspect').length;
      const nbProspects = prospects.filter(p => p.statut_societe === 'Prospect').length;
      const nbClients   = prospects.filter(p => p.statut_societe === 'Client').length;
      const devisEnCours = prospects.filter(p => p.real_status && ['En cours','Envoyé','Discussion','Négociation'].includes(p.real_status)).length;
      const devisGagnes  = prospects.filter(p => p.real_status === 'Gagné').length;
      const devisPerdus  = prospects.filter(p => p.real_status === 'Perdu').length;

      const pipeline = prospects.filter(p => p.real_status && ['En cours','Envoyé','Discussion','Négociation'].includes(p.real_status));
      const pipelineAll = prospects.filter(p => p.real_status && ['En cours','Envoyé','Discussion','Négociation','Gagné'].includes(p.real_status));
      const gagnes = prospects.filter(p => p.real_status === 'Gagné');

      const aboMensuelBrut = pipeline.reduce((s,p) => s + (parseFloat(p.real_monthly_amount||p.monthly_amount)||0), 0);
      const aboMensuelPondere = pipeline.reduce((s,p) => s + (parseFloat(p.real_monthly_amount||p.monthly_amount)||0) * ((p.real_probability||0)/100), 0);
      const setupBrut = pipeline.reduce((s,p) => s + (parseFloat(p.real_setup_amount||p.setup_amount)||0), 0);
      const setupPondere = pipeline.reduce((s,p) => s + (parseFloat(p.real_setup_amount||p.setup_amount)||0) * ((p.real_probability||0)/100), 0);
      const aboGagnesMensuel = gagnes.reduce((s,p) => s + (parseFloat(p.real_monthly_amount||p.monthly_amount)||0), 0);
      const aboGagnesAnnuel  = gagnes.reduce((s,p) => s + (parseFloat(p.real_annual_amount||p.annual_amount)||0), 0);
      const setupGagnes      = gagnes.reduce((s,p) => s + (parseFloat(p.real_setup_amount||p.setup_amount)||0), 0);

      const fmt = (n) => n.toLocaleString('fr-FR', {minimumFractionDigits:2, maximumFractionDigits:2});

      // ── Commerciaux ──
      if (activeTab === null && commerciaux.length > 0) setActiveTab(commerciaux[0]);

      const getCommercialData = (name) => {
        const mine = prospects.filter(p => p.assigned_to === name);
        const myPipeline = mine.filter(p => p.real_status && ['En cours','Envoyé','Discussion','Négociation'].includes(p.real_status));
        const myActions = Object.entries(prospectActionsInfo)
          .filter(([id]) => mine.some(p => String(p.id) === String(id)));
        const actives = myActions.filter(([,a]) => a.hasAction).length;
        const retard  = myActions.filter(([,a]) => a.isLate).length;
        const encours    = mine.filter(p => p.real_status === 'En cours').length;
        const envoye     = mine.filter(p => p.real_status === 'Envoyé').length;
        const discussion = mine.filter(p => p.real_status === 'Discussion').length;
        const negocie    = mine.filter(p => p.real_status === 'Négociation').length;
        const gagne      = mine.filter(p => p.real_status === 'Gagné').length;
        const perdu      = mine.filter(p => p.real_status === 'Perdu').length;
        return {
          societes: mine.length,
          devisCount: myPipeline.length,
          signes: gagne,
          aboMensuel: myPipeline.reduce((s,p) => s+(parseFloat(p.real_monthly_amount||p.monthly_amount)||0),0),
          aboAnnuel:  myPipeline.reduce((s,p) => s+(parseFloat(p.real_annual_amount||p.annual_amount)||0),0),
          actives, retard,
          prosp: mine.filter(p => !p.real_status).length,
          encours, envoye, discussion, negocie, gagne, perdu,
          devisTotal: encours+envoye+discussion+negocie,
        };
      };

      // ── Par probabilité ──
      const probRanges = [
        {label:'80–100%', min:80, max:100, color:'var(--success)'},
        {label:'60–80%',  min:60, max:79,  color:'var(--primary)'},
        {label:'40–60%',  min:40, max:59,  color:'var(--warning)'},
        {label:'20–40%',  min:20, max:39,  color:'var(--danger)'},
        {label:'0–20%',   min:0,  max:19,  color:'#bbb'},
      ];

      // ── Ancienneté devis ──
      const ageRanges = [
        {label:'< 1 mois',  max:30,  color:'var(--success)', status:'Frais'},
        {label:'1–2 mois',  min:30,  max:60,  color:'var(--primary)', status:'OK'},
        {label:'2–3 mois',  min:60,  max:90,  color:'var(--warning)', status:'⚠ Vieux'},
        {label:'> 3 mois',  min:90,  color:'var(--danger)', status:'🚨 Urgent'},
      ];
      const ageCount = (range) => pipeline.filter(p => {
        if (!p.real_quote_date) return false;
        const days = (today - new Date(p.real_quote_date)) / 86400000;
        const ok_min = range.min === undefined || days >= range.min;
        const ok_max = range.max === undefined || days < range.max;
        return ok_min && ok_max;
      }).length;

      const chip = (label, val, color) => (
        <span key={label} className="tw-chip" style={{color: val>0 ? color : 'var(--tw-muted)', opacity: val>0?1:.4}}>
          {label} {val}
        </span>
      );

      const recapLabels = { actions: '⚠️ Actions & Devis', pipeline: '📊 Vue Pipeline' };

      return (
        <div className="tw-content">

          {/* ── MODALE CONFIRMATION RECAP ── */}
          {recapConfirm && (
            <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:9999}}>
              <div style={{background:'white',borderRadius:'12px',padding:'28px 32px',maxWidth:'420px',width:'90%',boxShadow:'0 20px 60px rgba(0,0,0,.2)'}}>
                <div style={{fontSize:'16px',fontWeight:'700',color:'var(--tw-ink)',marginBottom:'20px'}}>📧 Confirmer l'envoi</div>
                <div style={{background:'var(--tw-bg)',borderRadius:'8px',padding:'14px 16px',marginBottom:'20px'}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:'8px'}}>
                    <span style={{fontSize:'12px',color:'var(--tw-muted)',fontWeight:'600',textTransform:'uppercase',letterSpacing:'.4px'}}>Rapport</span>
                    <span style={{fontSize:'13px',fontWeight:'600',color:'var(--tw-ink)'}}>{recapLabels[recapType]}</span>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:'8px'}}>
                    <span style={{fontSize:'12px',color:'var(--tw-muted)',fontWeight:'600',textTransform:'uppercase',letterSpacing:'.4px'}}>Pour</span>
                    <span style={{fontSize:'13px',fontWeight:'600',color:'var(--tw-ink)'}}>{recapTarget}</span>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',paddingTop:'8px',borderTop:'1px solid var(--tw-border)'}}>
                    <span style={{fontSize:'12px',color:'var(--tw-muted)',fontWeight:'600',textTransform:'uppercase',letterSpacing:'.4px'}}>Destinataire (test)</span>
                    <span style={{fontSize:'13px',fontWeight:'600',color:'var(--tw-teal)'}}>Votre adresse email</span>
                  </div>
                </div>
                <div style={{display:'flex',gap:'10px',justifyContent:'flex-end'}}>
                  <button onClick={() => setRecapConfirm(false)}
                    style={{padding:'8px 18px',background:'white',color:'var(--tw-slate)',border:'1px solid var(--tw-border)',borderRadius:'6px',fontSize:'13px',fontWeight:'500',cursor:'pointer',fontFamily:"'Inter',sans-serif"}}>
                    Annuler
                  </button>
                  <button onClick={doSendTestRecap}
                    style={{padding:'8px 18px',background:'var(--tw-teal)',color:'white',border:'none',borderRadius:'6px',fontSize:'13px',fontWeight:'600',cursor:'pointer',fontFamily:"'Inter',sans-serif"}}>
                    📤 Envoyer
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── PANNEAU PROSPECTION SocieteInfo (Dashboard est déjà admin-only) ── */}
          <div style={{marginBottom:'18px',background:'white',border:'1px solid var(--tw-border)',borderRadius:'10px',boxShadow:'var(--sh-sm)',padding:'10px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',cursor:'pointer'}}
            onClick={openProspectionModal}
            onMouseEnter={e=>e.currentTarget.style.background='var(--tw-teal-light)'}
            onMouseLeave={e=>e.currentTarget.style.background='white'}>
            <div>
              <span style={{fontSize:'13px',fontWeight:'600',color:'var(--tw-teal)'}}>🎯 Recherche SocieteInfo</span>
              <span style={{fontSize:'11px',color:'var(--tw-muted)',marginLeft:'10px'}}>Recherche multi-critères (NAF + zone) → Suspects à attribuer</span>
            </div>
            <span style={{fontSize:'12px',color:'var(--tw-teal)',fontWeight:'600'}}>Lancer →</span>
          </div>

          {/* ── PANNEAU RECAP TEST (Christian uniquement) ── */}
          {user.name === 'Christian' && (
            <div style={{marginBottom:'18px',background:'white',border:'1px solid var(--tw-border)',borderRadius:'10px',boxShadow:'var(--sh-sm)',overflow:'hidden'}}>
              <div onClick={() => setRecapOpen(o => !o)}
                style={{padding:'10px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',cursor:'pointer',userSelect:'none'}}
                onMouseEnter={e=>e.currentTarget.style.background='var(--tw-teal-light)'}
                onMouseLeave={e=>e.currentTarget.style.background='white'}
              >
                <span style={{fontSize:'13px',fontWeight:'600',color:'var(--tw-teal)'}}>📧 Test récap email</span>
                <span style={{fontSize:'12px',color:'var(--tw-muted)'}}>{recapOpen ? '▲ Fermer' : '▼ Ouvrir'}</span>
              </div>
              {recapOpen && <div style={{padding:'0 16px 16px',borderTop:'1px solid var(--tw-border)'}}>
              <div style={{display:'flex',gap:'10px',flexWrap:'wrap',alignItems:'flex-end',marginTop:'14px'}}>

                {/* Destinataire */}
                <div style={{display:'flex',flexDirection:'column',gap:'4px'}}>
                  <label style={{fontSize:'11px',color:'var(--tw-muted)',textTransform:'uppercase',letterSpacing:'.4px',fontWeight:'600'}}>Destinataire</label>
                  <select value={recapTarget} onChange={e=>setRecapTarget(e.target.value)}
                    style={{padding:'6px 10px',border:'1px solid var(--tw-border)',borderRadius:'6px',fontSize:'13px',fontFamily:"'Inter',sans-serif",color:'var(--tw-ink)',background:'white',cursor:'pointer'}}>
                    {['Moi (Christian)', ...commerciaux.map(n => n)].map(n => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>

                {/* Type de récap */}
                <div style={{display:'flex',flexDirection:'column',gap:'4px',flex:1,minWidth:'300px'}}>
                  <label style={{fontSize:'11px',color:'var(--tw-muted)',textTransform:'uppercase',letterSpacing:'.4px',fontWeight:'600'}}>Type de récap</label>
                  <div style={{display:'flex',gap:'6px',flexWrap:'wrap'}}>
                    {[
                      {id:'actions', label:'⚠️ Actions & Devis', desc:'En retard + à venir + sans action'},
                      {id:'pipeline', label:'📊 Vue pipeline', desc:'Vue globale du pipeline'},
                    ].map(t => (
                      <div key={t.id} onClick={() => setRecapType(t.id)}
                        style={{padding:'6px 12px',borderRadius:'6px',border:`2px solid ${recapType===t.id?'var(--tw-teal)':'var(--tw-border)'}`,background:recapType===t.id?'var(--tw-teal-light)':'white',cursor:'pointer',transition:'all .15s'}}>
                        <div style={{fontSize:'12px',fontWeight:'600',color:recapType===t.id?'var(--tw-teal)':'var(--tw-ink)'}}>{t.label}</div>
                        <div style={{fontSize:'11px',color:'var(--tw-muted)',marginTop:'2px'}}>{t.desc}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Bouton + résultat */}
                <div style={{display:'flex',flexDirection:'column',gap:'6px',alignItems:'flex-end'}}>
                  <button onClick={sendTestRecap} disabled={recapSending}
                    style={{padding:'8px 18px',background:recapSending?'#ccc':'var(--tw-teal)',color:'white',border:'none',borderRadius:'6px',fontSize:'13px',fontWeight:'600',cursor:recapSending?'default':'pointer',fontFamily:"'Inter',sans-serif",whiteSpace:'nowrap'}}>
                    {recapSending ? '⏳ Envoi...' : '📤 Envoyer le test'}
                  </button>
                  {recapResult && (
                    <span style={{fontSize:'12px',fontWeight:'500',color:recapResult.ok?'var(--tw-green)':'var(--tw-red)'}}>{recapResult.msg}</span>
                  )}
                </div>

              </div>
              </div>}
            </div>
          )}

          {/* ── PANNEAU IMPORT EXCEL (Christian uniquement) ── */}
          {user.name === 'Christian' && (
            <ImportPanel API_URL={API_URL} token={localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')).token : ''} />
          )}

          {/* ── KPI STRIP ── */}
          <div className="tw-section-title">Vue globale pipeline</div>
          <div className="tw-kpi-strip">

            {/* Carte 1 : Sociétés — clic = ouvre la liste Sociétés */}
            <div className="tw-kpi-card" onClick={() => onOpenListe && onOpenListe('societes')} style={{cursor: onOpenListe ? 'pointer' : 'default'}} title="Voir la liste des sociétés">
              <div className="tw-kpi-label">Sociétés en base</div>
              <div className="tw-kpi-value" style={{color:'var(--tw-teal)'}}>{prospects.length}</div>
              <div className="tw-kpi-sub"><b>{nbSuspects}</b> suspects · <b>{nbProspects}</b> prospects · <b>{nbClients}</b> clients</div>
            </div>

            {/* Carte 2 : Devis — clic = ouvre la liste Devis en cours */}
            <div className="tw-kpi-card" onClick={() => onOpenListe && onOpenListe('devis')} style={{cursor: onOpenListe ? 'pointer' : 'default'}} title="Voir la liste des devis en cours">
              <div className="tw-kpi-label">Devis en cours {thisYear}</div>
              <div className="tw-kpi-value">{devisEnCours}</div>
              <div className="tw-kpi-sub"><b>{devisGagnes}</b> gagné{devisGagnes>1?'s':''} · <b style={{color:'var(--tw-red)'}}>{devisPerdus}</b> perdu{devisPerdus>1?'s':''}</div>
            </div>

            {/* Potentiel devis en cours */}
            <div className="tw-kpi-card">
              <div className="tw-kpi-label">Potentiel devis en cours</div>
              <div className="tw-kpi-duo">
                <div>
                  <div className="tw-duo-lbl">Abo</div>
                  <div className="tw-duo-val" style={{color:'var(--tw-teal)'}}>{fmt(aboMensuelBrut)} €<span style={{fontSize:'11px',color:'var(--tw-slate)',fontWeight:'400'}}>/mois</span></div>
                  <div className="tw-duo-sub">Pondéré <b style={{color:'var(--tw-teal)'}}>{fmt(aboMensuelPondere)} €</b></div>
                </div>
                <div className="tw-kpi-duo-sep"></div>
                <div>
                  <div className="tw-duo-lbl">Setup</div>
                  <div className="tw-duo-val">{fmt(setupBrut)} €</div>
                  <div className="tw-duo-sub">Pondéré <b>{fmt(setupPondere)} €</b></div>
                </div>
              </div>
            </div>

            {/* Signé depuis janvier */}
            <div className="tw-kpi-card">
              <div className="tw-kpi-label">Signé depuis janvier {thisYear}</div>
              <div className="tw-kpi-duo">
                <div>
                  <div className="tw-duo-lbl">Abo</div>
                  <div className="tw-duo-val" style={{color:'var(--tw-green)'}}>{fmt(aboGagnesMensuel)} €<span style={{fontSize:'11px',color:'var(--tw-slate)',fontWeight:'400'}}>/mois</span></div>
                  <div className="tw-duo-sub">+ <b style={{color:'var(--tw-green)'}}>{fmt(aboGagnesAnnuel)} €</b>/an</div>
                </div>
                <div className="tw-kpi-duo-sep"></div>
                <div>
                  <div className="tw-duo-lbl">Setup</div>
                  <div className="tw-duo-val" style={{color:'var(--tw-green)'}}>{fmt(setupGagnes)} €</div>
                  <div className="tw-duo-sub">{gagnes.length} affaire{gagnes.length>1?'s':''} signée{gagnes.length>1?'s':''}</div>
                </div>
              </div>
            </div>

            {/* Nouvelles sociétés */}
            <div className="tw-kpi-card">
              <div className="tw-kpi-label">Nouvelles sociétés</div>
              {(() => {
                const now = new Date();
                const sw = new Date(now); sw.setDate(now.getDate()-now.getDay()); sw.setHours(0,0,0,0);
                const sm = new Date(now.getFullYear(), now.getMonth(), 1);
                const newSem  = prospects.filter(p => p.created_at && new Date(p.created_at) >= sw);
                const newMois = prospects.filter(p => p.created_at && new Date(p.created_at) >= sm);
                const rows = [
                  {label:'Suspects',  color:'#999',            sem: newSem.filter(p=>p.statut_societe==='Suspect').length,  mois: newMois.filter(p=>p.statut_societe==='Suspect').length},
                  {label:'Prospects', color:'var(--tw-teal)',  sem: newSem.filter(p=>p.statut_societe==='Prospect').length, mois: newMois.filter(p=>p.statut_societe==='Prospect').length},
                  {label:'Clients',   color:'var(--tw-green)', sem: newSem.filter(p=>p.statut_societe==='Client').length,   mois: newMois.filter(p=>p.statut_societe==='Client').length},
                ];
                return (
                  <div style={{marginTop:'10px'}}>
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:'11px',color:'var(--tw-muted)',fontWeight:'600',textTransform:'uppercase',letterSpacing:'.4px',marginBottom:'8px',paddingBottom:'6px',borderBottom:'1px solid var(--tw-border)'}}>
                      <span>Type</span>
                      <div style={{display:'flex',gap:'16px'}}><span>Sem.</span><span>Mois</span></div>
                    </div>
                    {rows.map(r => (
                      <div key={r.label} style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'7px'}}>
                        <div style={{display:'flex',alignItems:'center',gap:'7px'}}>
                          <div style={{width:'7px',height:'7px',borderRadius:'50%',background:r.color,flexShrink:0}}></div>
                          <span style={{fontSize:'13px',color:'var(--tw-slate)'}}>{r.label}</span>
                        </div>
                        <div style={{display:'flex',gap:'16px'}}>
                          <span style={{fontSize:'14px',fontWeight:'700',color:'var(--tw-ink)',fontVariantNumeric:'tabular-nums',minWidth:'20px',textAlign:'center'}}>{r.sem}</span>
                          <span style={{fontSize:'14px',fontWeight:'700',color:r.color,fontVariantNumeric:'tabular-nums',minWidth:'20px',textAlign:'center'}}>{r.mois}</span>
                        </div>
                      </div>
                    ))}
                    <div style={{borderTop:'1px solid var(--tw-border)',marginTop:'8px',paddingTop:'8px',display:'flex',justifyContent:'space-between'}}>
                      <span style={{fontSize:'12px',color:'var(--tw-muted)',fontWeight:'600'}}>Total</span>
                      <div style={{display:'flex',gap:'16px'}}>
                        <span style={{fontSize:'14px',fontWeight:'700',color:'var(--tw-ink)',minWidth:'20px',textAlign:'center'}}>{newSem.length}</span>
                        <span style={{fontSize:'14px',fontWeight:'700',color:'var(--tw-teal)',minWidth:'20px',textAlign:'center'}}>{newMois.length}</span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

          </div>

          {/* ── ONGLETS COMMERCIAUX ── */}
          <div className="tw-section-title">Par commercial</div>
          <div className="tw-tab-wrap">
            <div className="tw-tabs">
              {commerciaux.map(name => {
                const d = getCommercialData(name);
                return (
                  <button
                    key={name}
                    className={`tw-tab ${activeTab===name?'tw-tab-active':''}`}
                    onClick={() => { setActiveTab(name); setShowSocietes(false); }}
                  >
                    {name.split(' ')[0]}
                    {d.retard > 0 && <span className="tw-tab-badge">{d.retard}</span>}
                  </button>
                );
              })}
            </div>
            <div className="tw-tab-body">
              {activeTab && (() => {
                const d = getCommercialData(activeTab);
                const initials = activeTab.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
                return (
                  <div>
                    {/* Header commercial */}
                    <div style={{display:'flex',alignItems:'center',gap:'12px',marginBottom:'16px'}}>
                      <div className="tw-avatar" style={{width:'40px',height:'40px',fontSize:'14px',background:'var(--tw-teal)'}}>{initials}</div>
                      <div>
                        <div style={{fontSize:'15px',fontWeight:'600',color:'var(--tw-ink)'}}>{activeTab}</div>
                        <div style={{fontSize:'12px',color:'var(--tw-muted)'}}>{d.societes} société{d.societes>1?'s':''} · {d.devisTotal} devis en cours</div>
                      </div>
                    </div>
                    {/* Stats 5 colonnes */}
                    <div className="tw-cs-grid">
                      {[
                        // Les 3 premières cases (Sociétés/Devis/Signés) sont cliquables : elles appliquent
                        // le filtre Commercial + Statut adéquat puis ouvrent la vue Suivi activités.
                        // filterStatusValue : [] = Tous, ou tableau de statuts pour multi-select.
                        {lbl:'Sociétés',  val:d.societes,   color:'var(--tw-teal)',  filterStatusValue: []},
                        {lbl:'Devis',     val:d.devisCount, color:'var(--tw-blue)',  filterStatusValue: ['En cours', 'Envoyé', 'Discussion', 'Négociation']},
                        {lbl:'Signés',    val:d.signes,     color:d.signes>0?'var(--tw-green)':'var(--tw-muted)', filterStatusValue: ['Gagné']},
                        {lbl:'Abo/mois',  val:fmt(d.aboMensuel)+' €', color:'var(--tw-ink)', noClick:true},
                        {lbl:'Abo/an',    val:fmt(d.aboAnnuel)+' €',  color:'var(--tw-ink)', noClick:true},
                      ].map(item => (
                        <div
                          key={item.lbl}
                          className="tw-cs-item"
                          style={{cursor: item.noClick?'default':'pointer'}}
                          onClick={() => {
                            if (item.noClick) return;
                            // Appliquer les filtres avant de naviguer
                            if (setFilterCommercial) setFilterCommercial(activeTab);
                            if (setFilterStatus) setFilterStatus(item.filterStatusValue);
                            // Reset filtre attribution (sinon ça peut court-circuiter le filtre commercial)
                            if (setFilterAttribution) setFilterAttribution('Toutes');
                            onOpenDashboard();
                          }}
                        >
                          <div className="tw-cs-val" style={{color:item.color, fontSize: item.lbl.includes('Abo') ? '14px' : '22px'}}>{item.val}</div>
                          <div className="tw-cs-lbl">{item.lbl}</div>
                        </div>
                      ))}
                    </div>
                    {/* Ligne actions + répartition côte à côte */}
                    <div className="tw-row-line">
                      <div className="tw-row-box">
                        <span className="tw-row-lbl">Actions planifiées</span>
                        <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                          <span className="tw-pill-green">{d.actives} actives</span>
                          {d.retard > 0 && <>
                            <span style={{fontSize:'11px',color:'var(--tw-muted)'}}>dont</span>
                            <span style={{color:'var(--tw-red)',fontWeight:'600',fontSize:'12px'}}>{d.retard} en retard</span>
                          </>}
                        </div>
                      </div>
                      <div className="tw-row-box" style={{flex:2}}>
                        <span className="tw-row-lbl">Répartition</span>
                        <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
                          <span style={{fontSize:'12px',color:'var(--tw-muted)',whiteSpace:'nowrap'}}>{d.prosp} prosp · 🪙 {d.devisTotal} devis</span>
                          <div className="tw-chips">
                            {chip('En cours',   d.encours,    'var(--tw-teal)')}
                            {chip('Envoyé',     d.envoye,     'var(--warning)')}
                            {chip('Discussion', d.discussion, 'var(--tw-blue)')}
                            {chip('Gagné',      d.gagne,      'var(--tw-green)')}
                            {chip('Perdu',      d.perdu,      'var(--tw-red)')}
                          </div>
                        </div>
                      </div>
                    </div>
                    {/* Lien voir sociétés */}
                    <div style={{textAlign:'right',marginTop:'6px'}}>
                      <a href="#" style={{fontSize:'12px',color:'var(--tw-teal)',fontWeight:'500',textDecoration:'none'}}
                        onClick={(e) => { e.preventDefault(); setShowSocietes(s => !s); }}
                      >{showSocietes ? 'Masquer ▲' : `Voir toutes les sociétés de ${activeTab} ▼`}</a>
                    </div>

                    {/* Liste des sociétés dépliable */}
                    {showSocietes && (() => {
                      const mine = prospects.filter(p => p.assigned_to === activeTab);
                      const today2 = new Date(); today2.setHours(0,0,0,0);
                      return (
                        <div style={{marginTop:'14px',borderTop:'1px solid var(--tw-border)',paddingTop:'14px'}}>
                          {/* Barre de filtre par type pour cette liste de sociétés */}
                          <div style={{display:'flex',gap:'6px',marginBottom:'10px',alignItems:'center',flexWrap:'wrap'}}>
                            <span style={{fontSize:'11px',color:'var(--tw-muted)',marginRight:'4px',textTransform:'uppercase',letterSpacing:'.4px',fontWeight:'600'}}>Type :</span>
                            {[
                              {key:'all',      label:'Tous'},
                              {key:'Suspect',  label:'Suspect'},
                              {key:'Prospect', label:'Prospect'},
                              {key:'Client',   label:'Client'},
                            ].map(t => {
                              const active = societesTypeFilter === t.key;
                              const count = t.key === 'all' ? mine.length : mine.filter(p => p.statut_societe === t.key).length;
                              return (
                                <button key={t.key} onClick={() => setSocietesTypeFilter(t.key)}
                                  style={{
                                    padding:'4px 11px',
                                    background: active ? 'var(--tw-ink)' : 'white',
                                    color: active ? 'white' : 'var(--tw-slate)',
                                    border:'0.5px solid ' + (active ? 'var(--tw-ink)' : 'var(--tw-border)'),
                                    borderRadius:'14px',fontSize:'12px',cursor:'pointer',
                                    fontFamily:"'Inter',sans-serif",
                                    transition:'all .15s'
                                  }}>
                                  {t.label} <span style={{opacity:0.6,marginLeft:'3px'}}>({count})</span>
                                </button>
                              );
                            })}
                          </div>
                          {/* Header triable */}
                          <div style={{display:'grid',gridTemplateColumns:'1.8fr 0.9fr 1.1fr 0.7fr 1.5fr 0.8fr',padding:'7px 10px',background:'var(--tw-bg)',borderRadius:'6px 6px 0 0',fontSize:'11px',fontWeight:'600',color:'var(--tw-muted)',textTransform:'uppercase',letterSpacing:'.4px'}}>
                            {[
                              {lbl:'Société', col:'name'},
                              {lbl:'Type',    col:'type'},
                              {lbl:'Statut',  col:'status'},
                              {lbl:'Proba',   col:'proba'},
                              {lbl:'Prochaine action', col:'action'},
                            ].map(h => (
                              <div key={h.col}
                                onClick={() => { if(societesSortCol===h.col) setSocietesSortAsc(a=>!a); else {setSocietesSortCol(h.col);setSocietesSortAsc(true);} }}
                                style={{cursor:'pointer',userSelect:'none',display:'flex',alignItems:'center',gap:'3px'}}
                                onMouseEnter={e=>e.currentTarget.style.color='var(--tw-teal)'}
                                onMouseLeave={e=>e.currentTarget.style.color='var(--tw-muted)'}
                              >
                                {h.lbl}
                                <span style={{fontSize:'10px',opacity:societesSortCol===h.col?1:0.35}}>{societesSortCol===h.col?(societesSortAsc?'↑':'↓'):'↕'}</span>
                              </div>
                            ))}
                            <div></div>
                          </div>
                          {[...mine]
                            .filter(p => societesTypeFilter === 'all' || p.statut_societe === societesTypeFilter)
                            .sort((a,b) => {
                            if(societesSortCol==='name')   { const r=a.name.localeCompare(b.name); return societesSortAsc?r:-r; }
                            if(societesSortCol==='type')   { const r=(a.statut_societe||'').localeCompare(b.statut_societe||''); return societesSortAsc?r:-r; }
                            if(societesSortCol==='status') { const r=(a.real_status||'').localeCompare(b.real_status||''); return societesSortAsc?r:-r; }
                            if(societesSortCol==='proba')  { const r=(a.real_probability||0)-(b.real_probability||0); return societesSortAsc?r:-r; }
                            if(societesSortCol==='action') {
                              const da = prospectActionsInfo[a.id]?.nextActionDate ? new Date(prospectActionsInfo[a.id].nextActionDate).getTime() : Infinity;
                              const db = prospectActionsInfo[b.id]?.nextActionDate ? new Date(prospectActionsInfo[b.id].nextActionDate).getTime() : Infinity;
                              return societesSortAsc?da-db:db-da;
                            }
                            return 0;
                          }).map(p => {
                            const ai = prospectActionsInfo[p.id];
                            const isLate = ai?.isLate;
                            const actionDate = ai?.nextActionDate ? new Date(ai.nextActionDate) : null;
                            const dateStr = actionDate ? actionDate.toLocaleDateString('fr-FR') : null;
                            const statusColors = {'Gagné':'var(--tw-green)','Perdu':'var(--tw-red)','Discussion':'var(--tw-blue)','Envoyé':'var(--warning)','Négociation':'#9b59b6'};
                            const statusBgs = {'Gagné':'#e8f8f0','Perdu':'#fdecea','Discussion':'#e8f4fd','Envoyé':'#fff8e1','Négociation':'#f5eef8'};
                            const sColor = statusColors[p.real_status] || 'var(--tw-muted)';
                            const sBg = statusBgs[p.real_status] || '#f5f5f5';
                            return (
                              <div key={p.id}
                                style={{display:'grid',gridTemplateColumns:'1.8fr 0.9fr 1.1fr 0.7fr 1.5fr 0.8fr',padding:'9px 10px',borderBottom:'1px solid #f5f5f5',alignItems:'center',fontSize:'13px',cursor:'pointer',transition:'background .12s',background:'white'}}
                                onMouseEnter={e=>e.currentTarget.style.background='var(--tw-teal-light)'}
                                onMouseLeave={e=>e.currentTarget.style.background='white'}
                                onClick={() => { onSelectProspect(p); }}
                              >
                                <div>
                                  <div style={{fontWeight:'600',fontSize:'13px',color:'var(--tw-ink)'}}>{prospectDisplayName(p)}</div>
                                  <div style={{fontSize:'11px',color:'var(--tw-muted)',marginTop:'1px'}}>{p.contact_name||'—'}</div>
                                </div>
                                <div>{typeChip(p.statut_societe)}</div>
                                <div><span style={{fontSize:'11px',fontWeight:'600',padding:'2px 8px',borderRadius:'10px',color:sColor,background:sBg}}>{p.real_status||'Prospection'}</span></div>
                                <div style={{fontSize:'13px',fontWeight:'700',color:sColor}}>{p.real_probability||0}%</div>
                                <div style={{fontSize:'12px'}}>
                                  {ai?.hasAction ? (
                                    <span style={{color:isLate?'var(--tw-red)':'var(--tw-slate)',fontWeight:isLate?'600':'400'}}>
                                      ⚡ {ai.nextActionType} · {dateStr}{isLate?' ⚠️':''}
                                    </span>
                                  ) : (
                                    <span style={{color:'var(--tw-muted)',fontStyle:'italic'}}>Aucune action</span>
                                  )}
                                </div>
                                <div>
                                  <button style={{padding:'3px 10px',background:'var(--tw-teal)',color:'white',border:'none',borderRadius:'6px',fontSize:'11px',fontWeight:'500',cursor:'pointer'}}
                                    onClick={e=>{e.stopPropagation();onSelectProspect(p);}}>
                                    Ouvrir →
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* ── PAR PROBABILITÉ ── */}
          <div className="tw-card" style={{marginBottom:'24px'}}>
            <div className="tw-card-title">📈 Par probabilité</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:'8px'}}>
              {probRanges.map(r => {
                const inRange = pipelineAll.filter(p => (p.real_probability||0) >= r.min && (p.real_probability||0) <= r.max);
                const mVal = inRange.reduce((s,p) => s+(parseFloat(p.real_monthly_amount||p.monthly_amount)||0),0);
                const pct = pipelineAll.length > 0 ? (inRange.length/pipelineAll.length)*100 : 0;
                return (
                  <div key={r.label} style={{background:'var(--tw-bg)',borderRadius:'8px',padding:'12px'}}>
                    <div style={{fontWeight:'700',color:r.color,fontSize:'13px',marginBottom:'4px'}}>{r.label}</div>
                    <div style={{fontSize:'20px',fontWeight:'700',color:r.color,fontVariantNumeric:'tabular-nums'}}>{inRange.length}</div>
                    <div style={{fontSize:'11px',color:'var(--tw-muted)',marginTop:'3px'}}>{fmt(mVal)} €/m</div>
                    <div style={{marginTop:'8px',height:'4px',background:'#e0e0e0',borderRadius:'2px',overflow:'hidden'}}>
                      <div style={{width:`${pct}%`,height:'100%',background:r.color,borderRadius:'2px'}}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ═══ MODAL PROSPECTION MULTI-CRITÈRES SocieteInfo ═══ */}
          {showProspectionModal && (
            <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.5)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}}
              onClick={(e) => { if (e.target === e.currentTarget) setShowProspectionModal(false); }}>
              <div style={{background:'white',borderRadius:'12px',width:'90%',maxWidth:'900px',maxHeight:'90vh',overflow:'hidden',display:'flex',flexDirection:'column'}}>
                {/* Header */}
                <div style={{padding:'16px 24px',borderBottom:'1px solid var(--tw-border)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <h2 style={{margin:0,fontFamily:'Inter, sans-serif',color:'var(--text)',fontSize:'1.05rem',fontWeight:600,display:'flex',alignItems:'center',gap:'8px'}}>
                    🎯 Recherche SocieteInfo
                    <span style={{fontSize:'11px',color:'var(--meta)',fontWeight:400}}>· Étape {prospStep}/4</span>
                  </h2>
                  <button onClick={() => setShowProspectionModal(false)}
                    style={{background:'var(--bg)',border:'none',width:'30px',height:'30px',borderRadius:'7px',cursor:'pointer',fontSize:'1rem',color:'var(--text-2)'}}>✕</button>
                </div>

                {/* Body scrollable */}
                <div style={{flex:1,overflow:'auto',padding:'20px 24px'}}>

                  {/* ── ÉTAPE 1 : Code NAF ── */}
                  {prospStep === 1 && (
                    <div>
                      <div style={{fontSize:'14px',fontWeight:600,marginBottom:'8px',color:'var(--text)'}}>Secteur d'activité (code NAF)</div>
                      <div style={{fontSize:'12px',color:'var(--text-2)',marginBottom:'12px'}}>
                        Choisissez un code NAF (optionnel — vous pouvez aussi rechercher uniquement par zone). Tapez un mot-clé pour filtrer.
                      </div>
                      <input type="text" placeholder="Ex: habillement, restauration, conseil..."
                        value={prospNafSearch}
                        onChange={(e) => setProspNafSearch(e.target.value)}
                        style={{width:'100%',padding:'10px 14px',fontSize:'14px',border:'0.5px solid #cde0e0',borderRadius:'8px',outline:'none',marginBottom:'12px',fontFamily:"'Inter',sans-serif"}} />
                      <div style={{maxHeight:'320px',overflow:'auto',border:'0.5px solid #e0e8e8',borderRadius:'8px'}}>
                        {(() => {
                          const Q = prospNafSearch.trim().toLowerCase();
                          const codesList = (typeof codesNaf !== 'undefined' && Array.isArray(codesNaf)) ? codesNaf : [];
                          let filtered = codesList;
                          if (Q.length >= 2) {
                            filtered = codesList.filter(n =>
                              (n.libelle || '').toLowerCase().includes(Q) ||
                              (n.code || '').toLowerCase().includes(Q)
                            ).slice(0, 100);
                          } else {
                            filtered = codesList.slice(0, 50);
                          }
                          if (filtered.length === 0) return <div style={{padding:'20px',textAlign:'center',color:'var(--meta)',fontSize:'13px'}}>Aucun code NAF trouvé</div>;
                          return filtered.map(n => (
                            <div key={n.code}
                              onClick={() => { setProspNafCode(n.code); setProspNafLibelle(n.libelle); }}
                              style={{padding:'8px 12px',borderBottom:'0.5px solid #f0f4f4',cursor:'pointer',display:'flex',gap:'10px',alignItems:'center',background:prospNafCode===n.code?'#e0f2f1':'white'}}
                              onMouseEnter={e=>{if(prospNafCode!==n.code) e.currentTarget.style.background='var(--bg)'}}
                              onMouseLeave={e=>{if(prospNafCode!==n.code) e.currentTarget.style.background='white'}}>
                              <span style={{fontSize:'12px',fontWeight:600,color:'var(--text)',minWidth:'50px'}}>{n.code}</span>
                              <span style={{fontSize:'12px',color:'#4a6868'}}>{n.libelle}</span>
                            </div>
                          ));
                        })()}
                      </div>
                      {prospNafCode && (
                        <div style={{marginTop:'12px',padding:'10px',background:'#dcfce7',borderRadius:'7px',fontSize:'13px',color:'#166534'}}>
                          ✓ Sélectionné : <strong>{prospNafCode}</strong> — {prospNafLibelle}
                          <button onClick={() => { setProspNafCode(''); setProspNafLibelle(''); }}
                            style={{marginLeft:'10px',padding:'2px 8px',background:'white',border:'0.5px solid #cde0e0',borderRadius:'5px',fontSize:'11px',cursor:'pointer'}}>Effacer</button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── ÉTAPE 2 : Zone géographique ── */}
                  {prospStep === 2 && (
                    <div>
                      <div style={{fontSize:'14px',fontWeight:600,marginBottom:'8px',color:'var(--text)'}}>Zone géographique</div>
                      <div style={{fontSize:'12px',color:'var(--text-2)',marginBottom:'12px'}}>
                        Tapez le nom d'une ville, département ou région. <em>(Cette étape ne consomme aucun crédit.)</em>
                      </div>
                      <input type="text" placeholder="Ex: Bretagne, Paris, Bordeaux..."
                        value={prospPlaceSearch}
                        onChange={(e) => setProspPlaceSearch(e.target.value)}
                        autoFocus
                        style={{width:'100%',padding:'10px 14px',fontSize:'14px',border:'0.5px solid #cde0e0',borderRadius:'8px',outline:'none',marginBottom:'12px',fontFamily:"'Inter',sans-serif"}} />
                      {prospPlaceSuggestions.length > 0 && (
                        <div style={{maxHeight:'280px',overflow:'auto',border:'0.5px solid #e0e8e8',borderRadius:'8px'}}>
                          {prospPlaceSuggestions.map(p => {
                            // Traduit le type technique SocieteInfo en libellé français lisible
                            const typeLabel = (() => {
                              switch (p.type) {
                                case 'administrative_area_level_1': return 'région';
                                case 'administrative_area_level_2': return 'département';
                                case 'locality': return 'ville';
                                case 'postal_code': return 'code postal';
                                case 'route': return 'rue';
                                default: return p.type || '';
                              }
                            })();
                            // Affiche "Paris" en gros + "Île-de-France" en petit pour distinguer les homonymes
                            return (
                              <div key={p.id}
                                onClick={() => { setProspPlace(p); setProspPlaceSearch(p.name); setProspPlaceSuggestions([]); }}
                                style={{padding:'10px 14px',borderBottom:'0.5px solid #f0f4f4',cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center'}}
                                onMouseEnter={e=>e.currentTarget.style.background='var(--bg)'}
                                onMouseLeave={e=>e.currentTarget.style.background='white'}>
                                <div>
                                  <div style={{fontSize:'13px',color:'var(--text)',fontWeight:500}}>{p.name}</div>
                                  {p.formatted_name && p.formatted_name !== p.name && (
                                    <div style={{fontSize:'11px',color:'var(--meta)',marginTop:'2px'}}>{p.formatted_name}</div>
                                  )}
                                </div>
                                <span style={{fontSize:'11px',color:'var(--meta)',fontStyle:'italic',marginLeft:'10px'}}>{typeLabel}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {prospPlace && (
                        <div style={{marginTop:'12px',padding:'10px',background:'#dcfce7',borderRadius:'7px',fontSize:'13px',color:'#166534'}}>
                          ✓ Sélectionné : <strong>{prospPlace.formatted_name || prospPlace.name}</strong>
                          <button onClick={() => { setProspPlace(null); setProspPlaceSearch(''); }}
                            style={{marginLeft:'10px',padding:'2px 8px',background:'white',border:'0.5px solid #cde0e0',borderRadius:'5px',fontSize:'11px',cursor:'pointer'}}>Effacer</button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── ÉTAPE 3 : Filtres + estimation crédits ── */}
                  {prospStep === 3 && (
                    <div>
                      <div style={{fontSize:'14px',fontWeight:600,marginBottom:'8px',color:'var(--text)'}}>Filtres complémentaires (optionnels)</div>
                      <div style={{fontSize:'12px',color:'var(--text-2)',marginBottom:'14px'}}>Affinez votre cible. Tous ces filtres sont gratuits — c'est la recherche elle-même qui coûte 1 crédit/page.</div>
                      <div style={{display:'flex',flexDirection:'column',gap:'10px',marginBottom:'18px'}}>
                        <label style={{display:'flex',alignItems:'center',gap:'8px',fontSize:'13px',cursor:'pointer'}}>
                          <input type="checkbox" checked={prospWithPhone} onChange={e => setProspWithPhone(e.target.checked)} />
                          📞 Uniquement les sociétés avec <strong>téléphone connu</strong>
                        </label>
                        <label style={{display:'flex',alignItems:'center',gap:'8px',fontSize:'13px',cursor:'pointer'}}>
                          <input type="checkbox" checked={prospWithEmail} onChange={e => setProspWithEmail(e.target.checked)} />
                          ✉ Uniquement les sociétés avec <strong>email connu</strong>
                        </label>
                        <label style={{display:'flex',alignItems:'center',gap:'8px',fontSize:'13px',cursor:'pointer'}}>
                          <input type="checkbox" checked={prospWithSite} onChange={e => setProspWithSite(e.target.checked)} />
                          🌐 Uniquement les sociétés avec <strong>site web</strong>
                        </label>
                      </div>
                      <div style={{display:'flex',gap:'12px',marginBottom:'18px'}}>
                        <div style={{flex:1}}>
                          <label style={{fontSize:'11px',color:'var(--text-2)',textTransform:'uppercase',fontWeight:600,letterSpacing:'.4px'}}>Effectif min</label>
                          <input type="number" value={prospMinStaff} onChange={e=>setProspMinStaff(e.target.value)} placeholder="Ex: 5"
                            style={{width:'100%',padding:'8px 12px',fontSize:'13px',border:'0.5px solid #cde0e0',borderRadius:'6px',outline:'none',marginTop:'4px'}} />
                        </div>
                        <div style={{flex:1}}>
                          <label style={{fontSize:'11px',color:'var(--text-2)',textTransform:'uppercase',fontWeight:600,letterSpacing:'.4px'}}>Effectif max</label>
                          <input type="number" value={prospMaxStaff} onChange={e=>setProspMaxStaff(e.target.value)} placeholder="Ex: 50"
                            style={{width:'100%',padding:'8px 12px',fontSize:'13px',border:'0.5px solid #cde0e0',borderRadius:'6px',outline:'none',marginTop:'4px'}} />
                        </div>
                      </div>
                      {/* Récap critères */}
                      <div style={{padding:'12px 14px',background:'var(--bg)',borderRadius:'8px',fontSize:'12px',color:'#4a6868',marginBottom:'14px'}}>
                        <div style={{fontWeight:600,marginBottom:'6px',color:'var(--text)'}}>Récapitulatif :</div>
                        <div>NAF : {prospNafCode ? `${prospNafCode} — ${prospNafLibelle}` : <em>(aucun)</em>}</div>
                        <div>Zone : {prospPlace ? (prospPlace.formatted_name || prospPlace.name) : <em>(aucune)</em>}</div>
                        {(prospWithPhone || prospWithEmail || prospWithSite) && (
                          <div>Filtres : {[prospWithPhone&&'téléphone',prospWithEmail&&'email',prospWithSite&&'site web'].filter(Boolean).join(', ')}</div>
                        )}
                      </div>
                      <div style={{padding:'12px 14px',background:'#fef3c7',borderRadius:'8px',fontSize:'12px',color:'#92400e',border:'0.5px dashed #d4a017'}}>
                        ⚠ <strong>Coût estimé :</strong> 1 crédit pour les 25 premiers résultats. Les pages suivantes coûtent 1 crédit chacune (max 5 pages = 125 sociétés par recherche).
                      </div>
                    </div>
                  )}

                  {/* ── ÉTAPE 4 : Résultats ── */}
                  {prospStep === 4 && (
                    <div>
                      {prospLoading && <div style={{textAlign:'center',padding:'40px',color:'var(--text-2)'}}>Recherche en cours…</div>}
                      {prospError && <div style={{padding:'10px 14px',background:'#fecaca',color:'#991b1b',borderRadius:'7px',marginBottom:'12px',fontSize:'13px'}}>{prospError}</div>}
                      {prospImportResult && (() => {
                        const fullSuccess = prospImportResult.inserted_count > 0 && prospImportResult.error_count === 0;
                        const totalFailure = prospImportResult.inserted_count === 0 && prospImportResult.error_count > 0;
                        const partialSuccess = prospImportResult.inserted_count > 0 && prospImportResult.error_count > 0;
                        const bg     = totalFailure ? '#fecaca' : (partialSuccess ? '#fef3c7' : '#dcfce7');
                        const fg     = totalFailure ? '#991b1b' : (partialSuccess ? '#92400e' : '#166534');
                        const icon   = totalFailure ? '❌' : (partialSuccess ? '⚠️' : '✅');
                        const title  = totalFailure ? 'Import échoué' : (partialSuccess ? 'Import partiel' : 'Import terminé');
                        return (
                          <div style={{padding:'14px',background:bg,borderRadius:'8px',marginBottom:'14px',fontSize:'13px',color:fg}}>
                            {icon} <strong>{title} :</strong> {prospImportResult.inserted_count} société(s) ajoutée(s)
                            {prospImportResult.skipped_count > 0 && ` · ${prospImportResult.skipped_count} déjà connue(s) (ignorées)`}
                            {prospImportResult.error_count > 0 && ` · ${prospImportResult.error_count} erreur(s)`}
                            {fullSuccess && (
                              <div style={{marginTop:'8px',fontSize:'12px'}}>Les sociétés sont visibles dans <strong>Attribution</strong> en statut Suspect, prêtes à être assignées.</div>
                            )}
                            {prospImportResult.error_count > 0 && prospImportResult.errors && prospImportResult.errors[0] && (
                              <div style={{marginTop:'8px',fontSize:'11px',fontFamily:'monospace',background:'rgba(0,0,0,0.05)',padding:'6px 8px',borderRadius:'4px'}}>
                                Erreur (1ère sur {prospImportResult.error_count}) — SIREN {prospImportResult.errors[0].siren} : {prospImportResult.errors[0].error}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                      {!prospLoading && prospResults.length > 0 && (
                        <div>
                          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'10px'}}>
                            <div style={{fontSize:'12px',color:'var(--text-2)'}}>
                              {prospResultsTotal} résultat(s) — Page {prospResultsPage}/{prospResultsTotalPages} —
                              <strong style={{color:'var(--text)'}}> {prospSelected.size} sélectionnée(s)</strong>
                            </div>
                            <div style={{display:'flex',gap:'8px'}}>
                              <button onClick={selectAllVisible} style={{padding:'4px 10px',fontSize:'11px',border:'0.5px solid #cde0e0',background:'white',borderRadius:'5px',cursor:'pointer'}}>Tout sélectionner</button>
                              <button onClick={clearProspSelection} style={{padding:'4px 10px',fontSize:'11px',border:'0.5px solid #cde0e0',background:'white',borderRadius:'5px',cursor:'pointer'}}>Désélectionner</button>
                            </div>
                          </div>
                          <div style={{maxHeight:'400px',overflow:'auto',border:'0.5px solid #e0e8e8',borderRadius:'8px'}}>
                            {/* Tri : sociétés avec contacts pro en haut, puis les autres.
                                On ne réordonne pas en réel l'array (préserve l'ordre original SocieteInfo
                                pour ceux qui ont les mêmes flags) — juste un .sort() stable basé sur le Set. */}
                            {[...prospResults]
                              .sort((a, b) => {
                                const ah = prospWithContactsSirens.has(a.registration_number) ? 1 : 0;
                                const bh = prospWithContactsSirens.has(b.registration_number) ? 1 : 0;
                                return bh - ah;
                              })
                              .map(c => {
                              const siren = c.registration_number;
                              const isExisting = prospExistingSirens.has(siren);
                              const isSelected = prospSelected.has(siren);
                              const hasContacts = prospWithContactsSirens.has(siren);
                              return (
                                <div key={siren} style={{padding:'10px 14px',borderBottom:'0.5px solid #f0f4f4',display:'flex',gap:'10px',alignItems:'flex-start',background:isExisting?'var(--bg)':(isSelected?'#e0f2f1':'white'),opacity:isExisting?0.6:1}}>
                                  <input type="checkbox"
                                    checked={isSelected}
                                    disabled={isExisting}
                                    onChange={() => toggleProspSelected(siren)}
                                    style={{marginTop:'4px',cursor:isExisting?'not-allowed':'pointer'}} />
                                  <div style={{flex:1}}>
                                    <div style={{fontSize:'13px',fontWeight:600,color:'var(--text)',display:'flex',alignItems:'center',gap:'8px',flexWrap:'wrap'}}>
                                      {c.name}
                                      {hasContacts && (
                                        <span title="Cette société a des contacts professionnels nominatifs (email pro)" style={{display:'inline-flex',alignItems:'center',gap:'3px',fontSize:'10px',padding:'2px 7px',borderRadius:'10px',background:'#dcfce7',color:'#166534',fontWeight:600}}>
                                          {I(ICONS.mail, 11)}
                                          contacts
                                        </span>
                                      )}
                                      {isExisting && <span style={{fontSize:'10px',padding:'2px 7px',borderRadius:'10px',background:'#fef3c7',color:'#92400e',fontWeight:600}}>Déjà importée</span>}
                                    </div>
                                    <div style={{fontSize:'11px',color:'var(--text-2)',marginTop:'2px'}}>
                                      SIREN {siren} · {c.formatted_address || ''}
                                    </div>
                                    {c.activity && <div style={{fontSize:'11px',color:'var(--meta)',marginTop:'2px',fontStyle:'italic'}}>{c.activity}</div>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          {/* Pagination */}
                          {prospResultsTotalPages > 1 && (
                            <div style={{marginTop:'10px',display:'flex',justifyContent:'center',gap:'6px'}}>
                              {Array.from({length: Math.min(5, prospResultsTotalPages)}, (_,i) => i + 1).map(pg => (
                                <button key={pg}
                                  onClick={() => runProspectionSearch(pg)}
                                  style={{padding:'5px 10px',fontSize:'11px',border:'0.5px solid #cde0e0',borderRadius:'5px',cursor:'pointer',background:pg===prospResultsPage?'var(--text)':'white',color:pg===prospResultsPage?'white':'var(--text)'}}>
                                  Page {pg}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                </div>

                {/* Footer navigation */}
                <div style={{padding:'14px 24px',borderTop:'1px solid var(--tw-border)',display:'flex',justifyContent:'space-between',alignItems:'center',background:'#fafbfb'}}>
                  <button onClick={() => prospStep > 1 ? setProspStep(prospStep - 1) : setShowProspectionModal(false)}
                    style={{padding:'8px 14px',border:'0.5px solid #cde0e0',background:'white',borderRadius:'7px',cursor:'pointer',fontSize:'13px'}}>
                    {prospStep > 1 ? '← Précédent' : 'Annuler'}
                  </button>
                  <div style={{display:'flex',gap:'8px'}}>
                    {prospStep < 3 && (
                      <button onClick={() => setProspStep(prospStep + 1)}
                        disabled={prospStep === 1 && !prospNafCode && !prospPlace}
                        style={{padding:'8px 18px',background:'var(--text)',color:'white',border:'none',borderRadius:'7px',cursor:'pointer',fontSize:'13px',fontWeight:600,opacity:(prospStep===1&&!prospNafCode&&!prospPlace)?0.5:1}}>
                        Suivant →
                      </button>
                    )}
                    {prospStep === 3 && (
                      <button onClick={() => { setProspStep(4); runProspectionSearch(1); }}
                        disabled={!prospNafCode && !prospPlace}
                        style={{padding:'8px 18px',background:'var(--text)',color:'white',border:'none',borderRadius:'7px',cursor:'pointer',fontSize:'13px',fontWeight:600,opacity:(!prospNafCode&&!prospPlace)?0.5:1}}>
                        🚀 Lancer la recherche (1 crédit)
                      </button>
                    )}
                    {prospStep === 4 && (
                      <button onClick={runProspectionImport}
                        disabled={prospSelected.size === 0 || prospImporting}
                        style={{padding:'8px 18px',background:'var(--tw-teal)',color:'white',border:'none',borderRadius:'7px',cursor:(prospSelected.size===0||prospImporting)?'not-allowed':'pointer',fontSize:'13px',fontWeight:600,opacity:(prospSelected.size===0||prospImporting)?0.5:1}}>
                        {prospImporting
                          ? (prospEnrichProgress
                              ? `Enrichissement ${prospEnrichProgress.done}/${prospEnrichProgress.total}…`
                              : 'Import en cours…')
                          : `📥 Importer ${prospSelected.size} suspect(s)`}
                      </button>
                    )}
                  </div>
                </div>

              </div>
            </div>
          )}

        </div>
      );
    }
