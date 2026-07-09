import * as React from 'react';
import { prospectDisplayName, typeChip } from '../lib/shared.jsx';

export function DashboardConsultant({ prospects, user, prospectActionsInfo, onSelectProspect, onOpenDashboard, API_URL }) {
      const today = new Date(); today.setHours(0,0,0,0);
      const fmt = (n) => (n||0).toLocaleString('fr-FR', {minimumFractionDigits:2, maximumFractionDigits:2});
      const [sortCol, setSortCol] = React.useState('name');
      const [sortAsc, setSortAsc] = React.useState(true);
      // Filtre par type de société pour le tableau "Mes dossiers" : 'all', 'Suspect', 'Prospect', 'Client'
      const [typeFilter, setTypeFilter] = React.useState('all');

      const handleSort = (col) => {
        if (sortCol === col) setSortAsc(a => !a);
        else { setSortCol(col); setSortAsc(true); }
      };
      const sortArrow = (col) => sortCol === col ? (sortAsc ? ' ↑' : ' ↓') : ' ↕';

      const mine = prospects.filter(p => p.assigned_to === user.name);
      const myPipeline = mine.filter(p => p.real_status && ['En cours','Envoyé','Discussion','Négociation'].includes(p.real_status));
      const myGagnes   = mine.filter(p => p.real_status === 'Gagné');

      const nbDevisActifs = myPipeline.length;
      const myActions = Object.entries(prospectActionsInfo).filter(([id]) => mine.some(p => String(p.id) === String(id)));
      const nbRetard  = myActions.filter(([,a]) => a.isLate).length;

      const aboMensuel  = myPipeline.reduce((s,p) => s + (parseFloat(p.real_monthly_amount||p.monthly_amount)||0), 0);
      const aboPondere  = myPipeline.reduce((s,p) => s + (parseFloat(p.real_monthly_amount||p.monthly_amount)||0) * ((p.real_probability||0)/100), 0);
      const setupBrut   = myPipeline.reduce((s,p) => s + (parseFloat(p.real_setup_amount||p.setup_amount)||0), 0);
      const setupPondere= myPipeline.reduce((s,p) => s + (parseFloat(p.real_setup_amount||p.setup_amount)||0) * ((p.real_probability||0)/100), 0);
      const aboGagneM   = myGagnes.reduce((s,p) => s + (parseFloat(p.real_monthly_amount||p.monthly_amount)||0), 0);
      const aboGagneA   = myGagnes.reduce((s,p) => s + (parseFloat(p.real_annual_amount||p.annual_amount)||0), 0);
      const setupGagnes = myGagnes.reduce((s,p) => s + (parseFloat(p.real_setup_amount||p.setup_amount)||0), 0);

      const initials = user.name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);

      const statusChip = (status) => {
        const map = {
          'En cours':   {cls:'var(--tw-teal)',   bg:'var(--tw-teal-light)'},
          'Envoyé':     {cls:'var(--warning)',   bg:'var(--warning-soft)'},
          'Discussion': {cls:'var(--tw-blue)',   bg:'var(--primary-soft)'},
          'Négociation':{cls:'#9b59b6',          bg:'#f5eef8'},
          'Gagné':      {cls:'var(--tw-green)',  bg:'var(--success-soft)'},
          'Perdu':      {cls:'var(--tw-red)',    bg:'var(--danger-soft)'},
        };
        const s = map[status] || {cls:'var(--tw-muted)', bg:'var(--surface-hover)'};
        return <span style={{fontSize:'11px',fontWeight:'600',padding:'2px 9px',borderRadius:'10px',color:s.cls,background:s.bg}}>{status||'Prospection'}</span>;
      };

      const thisYear = new Date().getFullYear();

      return (
        <div className="tw-content">

          {/* HEADER CONSULTANT */}
          <div style={{background:'white',border:'1px solid var(--tw-border)',borderRadius:'10px',padding:'18px 22px',marginBottom:'18px',display:'flex',alignItems:'center',gap:'18px',boxShadow:'var(--sh-sm)'}}>
            <div className="tw-avatar" style={{width:'48px',height:'48px',fontSize:'17px',background:'linear-gradient(135deg,var(--tw-teal),#00a8b8)',flexShrink:0}}>{initials}</div>
            <div style={{flex:1}}>
              <div style={{fontSize:'17px',fontWeight:'600',color:'var(--tw-ink)'}}>{user.name}</div>
              <div style={{fontSize:'12px',color:'var(--tw-muted)',marginTop:'2px'}}>Mes dossiers · accès restreint à votre portefeuille</div>
            </div>
            <div style={{display:'flex',gap:'28px'}}>
              {[
                {val:mine.length,       lbl:'Sociétés',    color:'var(--tw-teal)'},
                {val:nbDevisActifs,     lbl:'Devis actifs',color:'var(--tw-ink)'},
                {val:nbRetard,          lbl:'En retard',   color:nbRetard>0?'var(--tw-red)':'var(--tw-muted)'},
              ].map(k => (
                <div key={k.lbl} style={{textAlign:'center'}}>
                  <div style={{fontSize:'24px',fontWeight:'700',color:k.color,fontVariantNumeric:'tabular-nums'}}>{k.val}</div>
                  <div style={{fontSize:'11px',color:'var(--tw-muted)',textTransform:'uppercase',letterSpacing:'.4px'}}>{k.lbl}</div>
                </div>
              ))}
            </div>
          </div>

          {/* CARTES FINANCIÈRES */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'14px',marginBottom:'18px'}}>
            <div className="tw-kpi-card">
              <div className="tw-kpi-label">Potentiel de mes devis en cours</div>
              <div className="tw-kpi-duo" style={{marginTop:'10px'}}>
                <div>
                  <div className="tw-duo-lbl">Abo</div>
                  <div className="tw-duo-val" style={{color:'var(--tw-teal)'}}>{fmt(aboMensuel)} €<span style={{fontSize:'11px',color:'var(--tw-slate)',fontWeight:'400'}}>/mois</span></div>
                  <div className="tw-duo-sub">Pondéré <b style={{color:'var(--tw-teal)'}}>{fmt(aboPondere)} €</b></div>
                </div>
                <div className="tw-kpi-duo-sep"></div>
                <div>
                  <div className="tw-duo-lbl">Setup</div>
                  <div className="tw-duo-val">{fmt(setupBrut)} €</div>
                  <div className="tw-duo-sub">Pondéré <b>{fmt(setupPondere)} €</b></div>
                </div>
              </div>
            </div>
            <div className="tw-kpi-card">
              <div className="tw-kpi-label">Mes signés depuis janvier {thisYear}</div>
              <div className="tw-kpi-duo" style={{marginTop:'10px'}}>
                <div>
                  <div className="tw-duo-lbl">Abo</div>
                  <div className="tw-duo-val" style={{color:'var(--tw-green)'}}>{fmt(aboGagneM)} €<span style={{fontSize:'11px',color:'var(--tw-slate)',fontWeight:'400'}}>/mois</span></div>
                  <div className="tw-duo-sub">+ <b style={{color:'var(--tw-green)'}}>{fmt(aboGagneA)} €</b>/an</div>
                </div>
                <div className="tw-kpi-duo-sep"></div>
                <div>
                  <div className="tw-duo-lbl">Setup</div>
                  <div className="tw-duo-val" style={{color:'var(--tw-green)'}}>{fmt(setupGagnes)} €</div>
                  <div className="tw-duo-sub">{myGagnes.length} affaire{myGagnes.length>1?'s':''} signée{myGagnes.length>1?'s':''}</div>
                </div>
              </div>
            </div>
          </div>

          {/* TABLEAU MES DOSSIERS */}
          <div className="tw-section-title">Mes dossiers ({mine.length})</div>
          {/* Barre de filtre par type : Tous / Suspect / Prospect / Client.
              Le filtre est local à ce tableau, pas global (n'impacte pas les autres parties du dashboard). */}
          <div style={{display:'flex',gap:'6px',marginBottom:'10px',alignItems:'center',flexWrap:'wrap'}}>
            <span style={{fontSize:'11px',color:'var(--tw-muted)',marginRight:'4px',textTransform:'uppercase',letterSpacing:'.4px',fontWeight:'600'}}>Type :</span>
            {[
              {key:'all',      label:'Tous'},
              {key:'Suspect',  label:'Suspect'},
              {key:'Prospect', label:'Prospect'},
              {key:'Client',   label:'Client'},
            ].map(t => {
              const active = typeFilter === t.key;
              const count = t.key === 'all' ? mine.length : mine.filter(p => p.statut_societe === t.key).length;
              return (
                <button key={t.key} onClick={() => setTypeFilter(t.key)}
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
          <div style={{background:'white',border:'1px solid var(--tw-border)',borderRadius:'10px',overflow:'hidden',boxShadow:'var(--sh-sm)'}}>
            {/* Header triable */}
            <div style={{display:'grid',gridTemplateColumns:'1.8fr 0.9fr 1.1fr 0.7fr 1.5fr 0.8fr',padding:'9px 16px',background:'var(--tw-bg)',borderBottom:'1px solid var(--tw-border)',fontSize:'11px',fontWeight:'600',color:'var(--tw-muted)',textTransform:'uppercase',letterSpacing:'.5px'}}>
              {[
                {lbl:'Société',          col:'name'},
                {lbl:'Type',             col:'type'},
                {lbl:'Statut',           col:'status'},
                {lbl:'Proba',            col:'proba'},
                {lbl:'Prochaine action', col:'action'},
              ].map(h => (
                <div key={h.col} onClick={() => handleSort(h.col)}
                  style={{cursor:'pointer',userSelect:'none',display:'flex',alignItems:'center',gap:'3px'}}
                  onMouseEnter={e=>e.currentTarget.style.color='var(--tw-teal)'}
                  onMouseLeave={e=>e.currentTarget.style.color='var(--tw-muted)'}
                >
                  {h.lbl}
                  <span style={{fontSize:'10px',opacity: sortCol===h.col?1:0.4}}>{sortArrow(h.col)}</span>
                </div>
              ))}
              <div></div>
            </div>
            {mine.filter(p => typeFilter === 'all' || p.statut_societe === typeFilter).length === 0 && (
              <div style={{padding:'30px',textAlign:'center',color:'var(--tw-muted)',fontSize:'13px'}}>
                {typeFilter === 'all' ? 'Aucune société assignée' : `Aucune société de type "${typeFilter}"`}
              </div>
            )}
            {[...mine]
              .filter(p => typeFilter === 'all' || p.statut_societe === typeFilter)
              .sort((a,b) => {
              let va, vb;
              if (sortCol==='name')   { va=a.name||''; vb=b.name||''; return sortAsc?va.localeCompare(vb):vb.localeCompare(va); }
              if (sortCol==='type')   { va=a.statut_societe||''; vb=b.statut_societe||''; return sortAsc?va.localeCompare(vb):vb.localeCompare(va); }
              if (sortCol==='status') { va=a.real_status||''; vb=b.real_status||''; return sortAsc?va.localeCompare(vb):vb.localeCompare(va); }
              if (sortCol==='proba')  { va=a.real_probability||0; vb=b.real_probability||0; return sortAsc?va-vb:vb-va; }
              if (sortCol==='action') {
                const da = prospectActionsInfo[a.id]?.nextActionDate ? new Date(prospectActionsInfo[a.id].nextActionDate).getTime() : Infinity;
                const db = prospectActionsInfo[b.id]?.nextActionDate ? new Date(prospectActionsInfo[b.id].nextActionDate).getTime() : Infinity;
                return sortAsc?da-db:db-da;
              }
              return 0;
            }).map(p => {
              const ai = prospectActionsInfo[p.id];
              const hasAction = ai?.hasAction;
              const isLate = ai?.isLate;
              const actionDate = ai?.nextActionDate ? new Date(ai.nextActionDate) : null;
              const dateStr = actionDate ? actionDate.toLocaleDateString('fr-FR') : null;
              return (
                <div key={p.id} style={{display:'grid',gridTemplateColumns:'1.8fr 0.9fr 1.1fr 0.7fr 1.5fr 0.8fr',padding:'11px 16px',borderBottom:'1px solid #f5f5f5',alignItems:'center',cursor:'pointer',transition:'background .12s'}}
                  onMouseEnter={e=>e.currentTarget.style.background='var(--tw-teal-light)'}
                  onMouseLeave={e=>e.currentTarget.style.background='white'}
                  onClick={() => { onSelectProspect(p); }}
                >
                  <div>
                    <div style={{fontWeight:'600',fontSize:'13px',color:'var(--tw-ink)'}}>{prospectDisplayName(p)}</div>
                    <div style={{fontSize:'11px',color:'var(--tw-muted)',marginTop:'2px'}}>{p.contact_name||'—'}</div>
                  </div>
                  <div>{typeChip(p.statut_societe)}</div>
                  <div>{statusChip(p.real_status)}</div>
                  <div style={{fontSize:'13px',fontWeight:'700',color:
                    p.real_probability>=80?'var(--tw-green)':
                    p.real_probability>=40?'var(--tw-orange)':'var(--tw-slate)'
                  }}>{p.real_probability||0}%</div>
                  <div style={{fontSize:'12px'}}>
                    {hasAction ? (
                      <span style={{color:isLate?'var(--tw-red)':'var(--tw-slate)',fontWeight:isLate?'600':'400'}}>
                        ⚡ {ai.nextActionType||'Action'} · {dateStr}{isLate?' ⚠️':''}
                      </span>
                    ) : (
                      <span style={{color:'var(--tw-muted)',fontStyle:'italic'}}>Aucune action</span>
                    )}
                  </div>
                  <div>
                    <button style={{padding:'4px 12px',background:'var(--tw-teal)',color:'white',border:'none',borderRadius:'6px',fontSize:'12px',fontWeight:'500',cursor:'pointer',fontFamily:"'Inter',sans-serif"}}>
                      Ouvrir →
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

        </div>
      );
    }

