import * as React from 'react';
import { styles } from '../lib/styles.js';
import { getProspectCountByCommercial, prospectDisplayName } from '../lib/shared.jsx';

export function LeftPanel({ prospects, allProspects, selectedProspect, onSelect, filterSocietyType, onFilterSocietyTypeChange, filterStatus, onFilterChange, filterCommercial, onFilterCommercialChange, searchTerm, onSearchChange, sortBy, onSortChange, prospectActionsInfo, onNewProspect, isAdmin, filterAttribution, onFilterAttributionChange, currentUser }) {
      // ================================================================
      // === PALETTE ANTHRACITE / COCKPIT (LeftPanel uniquement) ===
      // ================================================================
      const A = {
        bg:        '#2d3540',  // fond panel
        bgSoft:    '#363f4d',  // fond items
        bgHover:   '#3d4856',  // hover
        bgActive:  '#454f60',  // item sélectionné
        border:    '#3d4856',  // bordures internes
        text:      '#ffffff',  // texte principal
        textDim:   '#aab4c2',  // texte secondaire
        textMuted: '#7a8595',  // texte étiquettes
        teal:      '#5DCAA5',  // accent vert (KPI gain, signé)
        blue:      '#85B7EB',  // accent bleu (info, en cours)
        amber:     '#EFC274',  // accent ambre (devis, attention)
        red:       '#F09595',  // accent rouge (perdu, retard)
      };

      // État local : panneau dépliable du multi-select Statut (hooks au niveau composant, pas dans IIFE)
      const [statusMenuOpen, setStatusMenuOpen] = React.useState(false);

      // === KPIs calculés depuis les données réelles ===
      const today = new Date(); today.setHours(0,0,0,0);
      const pipelineActif = prospects.filter(p => p.real_status && ['En cours','Envoyé','Discussion'].includes(p.real_status));
      const aboMensuel = pipelineActif.reduce((s,p) => s + (parseFloat(p.real_monthly_amount || p.monthly_amount) || 0), 0);
      const aboPondere = pipelineActif.reduce((s,p) => s + (parseFloat(p.real_monthly_amount || p.monthly_amount) || 0) * ((p.real_probability||0)/100), 0);
      const nbActifs = pipelineActif.length;
      const nbRetard = Object.values(prospectActionsInfo || {}).filter(a => a && a.isLate).length;

      // === Mini sparkline : répartition par statut de devis ===
      // (5 valeurs réelles côté DB : En cours / Envoyé / Discussion / Gagné / Perdu)
      const statusCounts = {
        'En cours':   prospects.filter(p => p.real_status === 'En cours').length,
        'Envoyé':     prospects.filter(p => p.real_status === 'Envoyé').length,
        'Discussion': prospects.filter(p => p.real_status === 'Discussion').length,
        'Gagné':      prospects.filter(p => p.real_status === 'Gagné').length,
      };
      const maxCount = Math.max(1, ...Object.values(statusCounts));

      // === Format des montants (compact) ===
      const fmtK = (n) => {
        if (n >= 1000) return (n/1000).toFixed(1).replace('.0','') + ' K€';
        return Math.round(n) + ' €';
      };

      // === Style des selects (adapté au fond sombre) ===
      const selectStyle = {
        width:'100%', padding:'7px 10px', fontSize:'12px', border:'0.5px solid '+A.border,
        borderRadius:'7px', background:A.bgSoft, color:A.text, cursor:'pointer',
        fontFamily:"'Inter',sans-serif", appearance:'none',
        backgroundImage:'url("data:image/svg+xml;utf8,<svg xmlns=%27http://www.w3.org/2000/svg%27 width=%2710%27 height=%2710%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%23aab4c2%27 stroke-width=%272%27><polyline points=%276 9 12 15 18 9%27/></svg>")',
        backgroundRepeat:'no-repeat', backgroundPosition:'right 10px center', paddingRight:'28px'
      };
      const labelStyle = {fontSize:'10px',fontWeight:500,color:A.textMuted,marginBottom:'5px',display:'block',textTransform:'uppercase',letterSpacing:'.5px'};

      return (
        <div className="tw-dark-scroll" style={{...styles.leftPanel, background:A.bg, borderRight:'0.5px solid '+A.border}}>

          {/* === KPIs cockpit === */}
          <div style={{padding:'14px 14px 0'}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginBottom:'8px'}}>
              <div style={{background:A.bgSoft,borderRadius:'8px',padding:'10px 12px'}}>
                <div style={{fontSize:'9px',color:A.textMuted,textTransform:'uppercase',letterSpacing:'.5px',fontWeight:500,marginBottom:'4px'}}>Pipeline</div>
                <div style={{fontSize:'17px',fontWeight:600,color:A.teal,fontVariantNumeric:'tabular-nums',letterSpacing:'-.3px'}}>{fmtK(aboMensuel)}</div>
                <div style={{fontSize:'10px',color:A.textDim,marginTop:'2px'}}>pondéré : {fmtK(aboPondere)}</div>
              </div>
              <div style={{background:A.bgSoft,borderRadius:'8px',padding:'10px 12px'}}>
                <div style={{fontSize:'9px',color:A.textMuted,textTransform:'uppercase',letterSpacing:'.5px',fontWeight:500,marginBottom:'4px'}}>Actifs</div>
                <div style={{fontSize:'17px',fontWeight:600,color:A.blue,fontVariantNumeric:'tabular-nums'}}>{nbActifs}</div>
                <div style={{fontSize:'10px',color: nbRetard > 0 ? A.red : A.textDim,marginTop:'2px'}}>{nbRetard > 0 ? `${nbRetard} en retard` : 'à jour'}</div>
              </div>
            </div>

            {/* Mini-graph : répartition par statut */}
            <div style={{background:A.bgSoft,borderRadius:'8px',padding:'10px 12px',marginBottom:'10px'}}>
              <div style={{fontSize:'9px',color:A.textMuted,textTransform:'uppercase',letterSpacing:'.5px',fontWeight:500,marginBottom:'6px'}}>Répartition</div>
              <div style={{display:'flex',gap:'6px',alignItems:'flex-end',height:'32px'}}>
                {Object.entries(statusCounts).map(([k, v], idx) => {
                  const pct = (v / maxCount) * 100;
                  const colors = [A.amber, A.amber, A.blue, A.teal];
                  return (
                    <div key={k} style={{flex:1,height:`${Math.max(4,pct)}%`,background:colors[idx],borderRadius:'2px 2px 0 0',transition:'height .3s',opacity: v === 0 ? 0.3 : 1}}></div>
                  );
                })}
              </div>
              <div style={{display:'flex',gap:'6px',marginTop:'4px'}}>
                {Object.entries(statusCounts).map(([k, v]) => (
                  <div key={k} style={{flex:1,textAlign:'center',fontSize:'9px',color:A.textDim}}>
                    <div style={{color:A.text,fontWeight:500,fontSize:'10px',fontVariantNumeric:'tabular-nums'}}>{v}</div>
                    <div>{k}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* === Toggle Attribution === */}
          {isAdmin && (
            <div style={{margin:'4px 14px 0',display:'flex',background:A.bgSoft,border:'0.5px solid '+A.border,borderRadius:'7px',padding:'2px',gap:'2px'}}>
              {[
                {id:'Toutes', label:'Toutes'},
                {id:'Mes', label:'Mes sociétés'},
                {id:'NonAttribuees', label:'Non attr.'},
              ].map(opt => (
                <button key={opt.id} onClick={() => onFilterAttributionChange(opt.id)}
                  style={{flex:1,padding:'5px 4px',border:'none',borderRadius:'5px',fontSize:'10px',fontWeight: filterAttribution===opt.id ? 600 : 500,
                    background: filterAttribution===opt.id ? A.bgActive : 'transparent',
                    color: filterAttribution===opt.id ? A.text : A.textDim,
                    cursor:'pointer',transition:'all .15s',fontFamily:"'Inter',sans-serif",whiteSpace:'nowrap'}}>
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {/* === Filtres === */}
          <div style={{padding:'10px 14px 0'}}>
            <label style={labelStyle}>Type</label>
            <select value={filterSocietyType} onChange={(e) => onFilterSocietyTypeChange(e.target.value)} style={selectStyle}>
              {['Tous', 'Suspect', 'Prospect', 'Client'].map(type => {
                const count = type === 'Tous' ? allProspects.length : allProspects.filter(p => p.statut_societe === type).length;
                const label = type + (type === 'Suspect' || type === 'Prospect' || type === 'Client' ? 's' : '');
                return <option key={type} value={type}>{label} ({count})</option>;
              })}
            </select>
          </div>

          <div style={{padding:'10px 14px 0'}}>
            <label style={labelStyle}>Statut</label>
            {/* Multi-select : bouton résumé + panneau de checkboxes dépliable.
                filterStatus = tableau de statuts cochés. Tableau vide = "Tous".
                Préset "Devis en cours" disponible en haut pour cocher rapidement les 4 statuts d'un devis actif.
                statusMenuOpen est défini au niveau de LeftPanel (hooks ne peuvent pas être dans une IIFE). */}
            {(() => {
              const ALL_STATUS = ['Prospection', 'En cours', 'Envoyé', 'Discussion', 'Démo', 'Négociation', 'Gagné', 'Ajourné N+1', 'Éliminé par nous', 'Perdu'];
              const DEVIS_EN_COURS = ['En cours', 'Envoyé', 'Discussion', 'Négociation'];

              const selected = Array.isArray(filterStatus) ? filterStatus : [];
              const isAllSelected = selected.length === 0;
              const isDevisEnCours = selected.length === DEVIS_EN_COURS.length && DEVIS_EN_COURS.every(s => selected.includes(s));

              // Label affiché sur le bouton
              let label;
              if (isAllSelected) label = 'Tous';
              else if (isDevisEnCours) label = 'Devis en cours';
              else if (selected.length === 1) label = selected[0];
              else label = `${selected.length} statuts`;

              const toggleStatus = (s) => {
                if (selected.includes(s)) onFilterChange(selected.filter(x => x !== s));
                else onFilterChange([...selected, s]);
              };

              return (
                <div style={{position:'relative'}}>
                  <button onClick={() => setStatusMenuOpen(o => !o)}
                    style={{...selectStyle, textAlign:'left', cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                    <span>{label}</span>
                    <span style={{opacity:0.6,fontSize:'10px'}}>▾</span>
                  </button>
                  {statusMenuOpen && (
                    <div style={{
                      position:'absolute', top:'calc(100% + 4px)', left:0, right:0,
                      background: A.bgSoft, border:'0.5px solid '+A.border, borderRadius:'7px',
                      padding:'6px', zIndex:20, maxHeight:'320px', overflowY:'auto',
                      boxShadow:'0 4px 14px rgba(0,0,0,0.25)'
                    }}>
                      {/* Préset "Tous" : décoche tout */}
                      <button onClick={() => { onFilterChange([]); setStatusMenuOpen(false); }}
                        style={{display:'block',width:'100%',textAlign:'left',padding:'6px 10px',background: isAllSelected ? A.bgActive : 'transparent', color: A.text, border:'none', borderRadius:'5px', cursor:'pointer', fontSize:'12px', fontFamily:"'Inter',sans-serif",marginBottom:'2px'}}>
                        {isAllSelected ? '✓ ' : ''}Tous
                      </button>
                      {/* Préset "Devis en cours" */}
                      <button onClick={() => onFilterChange(isDevisEnCours ? [] : [...DEVIS_EN_COURS])}
                        style={{display:'block',width:'100%',textAlign:'left',padding:'6px 10px',background: isDevisEnCours ? A.bgActive : 'transparent', color: A.text, border:'none', borderRadius:'5px', cursor:'pointer', fontSize:'12px', fontFamily:"'Inter',sans-serif",marginBottom:'4px'}}>
                        {isDevisEnCours ? '✓ ' : ''}📊 Devis en cours
                      </button>
                      <div style={{height:'1px',background:A.border,margin:'4px 0'}}></div>
                      {/* Liste des statuts individuels (checkboxes) */}
                      {ALL_STATUS.map(s => {
                        const checked = selected.includes(s);
                        return (
                          <label key={s} style={{display:'flex',alignItems:'center',gap:'8px',padding:'5px 10px',cursor:'pointer',color:A.text,fontSize:'12px',fontFamily:"'Inter',sans-serif",borderRadius:'5px',background: checked ? A.bgActive : 'transparent'}}>
                            <input type="checkbox" checked={checked} onChange={() => toggleStatus(s)}
                              style={{accentColor:'#5DCAA5',cursor:'pointer',margin:0}} />
                            {s}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {isAdmin && (
            <div style={{padding:'10px 14px 0'}}>
              <label style={labelStyle}>Commercial</label>
              <select value={filterCommercial} onChange={(e) => onFilterCommercialChange(e.target.value)} style={selectStyle}>
                {['Tous', 'Roger', 'Christian', 'Frédéric'].map(commercial => {
                  const count = getProspectCountByCommercial(allProspects, commercial);
                  return <option key={commercial} value={commercial}>{commercial} ({count})</option>;
                })}
              </select>
            </div>
          )}

          {/* === Trier par === */}
          <div style={{padding:'10px 14px 12px'}}>
            <label style={labelStyle}>Trier par</label>
            <div style={{display:'flex',background:A.bgSoft,border:'0.5px solid '+A.border,borderRadius:'7px',padding:'2px',gap:'2px'}}>
              {[{label:'Nom', value:'name'}, {label:'Ancienneté', value:'ancienneté'}, {label:'Probabilité', value:'probabilité'}].map(option => (
                <button key={option.value} onClick={() => onSortChange(option.value)}
                  style={{flex:1,padding:'5px 4px',border:'none',borderRadius:'5px',fontSize:'10px',fontWeight: sortBy===option.value ? 600 : 500,
                    background: sortBy===option.value ? A.bgActive : 'transparent',
                    color: sortBy===option.value ? A.text : A.textDim,
                    cursor:'pointer',transition:'all .15s',fontFamily:"'Inter',sans-serif",whiteSpace:'nowrap'}}>
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* === Liste des sociétés === */}
          <div className="tw-dark-scroll" style={{borderTop:'0.5px solid '+A.border,flex:1,overflowY:'auto'}}>
            {prospects.map(prospect => {
              const isActive = selectedProspect?.id === prospect.id;
              const ai = prospectActionsInfo[prospect.id];
              const hasAction = ai && ai.hasAction;
              const isLate = ai && ai.isLate;
              const statut = prospect.statut_societe || 'Prospect';

              // Couleur de la bordure latérale
              let leftBorderColor = 'transparent';
              if (prospect.real_status === 'Ajourné N+1') leftBorderColor = A.amber;
              else if (prospect.real_status === 'Éliminé par nous' || prospect.real_status === 'Perdu') leftBorderColor = A.textMuted;
              else if (!prospect.real_status && !hasAction) leftBorderColor = A.red;
              else if (hasAction && !isLate) leftBorderColor = A.teal;
              else if (isLate) leftBorderColor = A.red;

              // Couleur pill de statut société
              const pillStyle = statut === 'Client'
                ? {background:'rgba(93,202,165,.15)', color:A.teal}
                : statut === 'Suspect'
                ? {background:'rgba(170,180,194,.15)', color:A.textDim}
                : {background:'rgba(239,194,116,.15)', color:A.amber};

              // Couleur du real_status
              const statusColor = prospect.real_status === 'Perdu' ? A.red
                                : prospect.real_status === 'Gagné' || prospect.real_status === 'Signé' ? A.teal
                                : prospect.real_status === 'Discussion' ? A.blue
                                : prospect.real_status === 'Envoyé' ? A.amber
                                : prospect.real_status ? A.text
                                : A.textMuted;

              return (
                <div key={prospect.id}
                  onClick={() => onSelect(prospect)}
                  style={{
                    padding:'10px 14px',
                    background: isActive ? A.bgActive : 'transparent',
                    borderBottom:'0.5px solid '+A.border,
                    borderLeft:'3px solid '+leftBorderColor,
                    cursor:'pointer',
                    transition:'background .15s'
                  }}
                  onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = A.bgHover; }}
                  onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                >
                  {/* Ligne 1 : nom + pill statut société */}
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'8px'}}>
                    <div style={{fontSize:'13px',fontWeight:500,color:A.text,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                      {prospectDisplayName(prospect)}
                    </div>
                    <span style={{fontSize:'10px',fontWeight:500,padding:'2px 7px',borderRadius:'10px',flexShrink:0,...pillStyle}}>
                      {statut}
                    </span>
                  </div>

                  {/* Ligne 2 : contact */}
                  {prospect.contact_name && (
                    <div style={{fontSize:'11px',color:A.textDim,marginTop:'2px',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{prospect.contact_name}</div>
                  )}

                  {/* Ligne 3 : status devis + date */}
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:'4px'}}>
                    {prospect.real_status ? (
                      <span style={{fontSize:'11px',fontWeight:500,color:statusColor}}>
                        {prospect.real_status}
                        {prospect.real_probability > 0 && (
                          <span style={{fontWeight:400,marginLeft:'4px',color:A.textDim}}>· {prospect.real_probability}%</span>
                        )}
                      </span>
                    ) : (
                      <span style={{fontSize:'11px',color:A.textMuted,fontStyle:'italic'}}>Aucun devis actif</span>
                    )}
                    {prospect.real_quote_date && (
                      <span style={{fontSize:'10px',color:A.textMuted}}>{new Date(prospect.real_quote_date).toLocaleDateString('fr-FR')}</span>
                    )}
                  </div>

                  {/* Ligne 4 : prochaine action ou alerte */}
                  <div style={{fontSize:'11px',marginTop:'4px',color:A.textDim}}>
                    {hasAction ? (() => {
                      const dateStr = ai.nextActionDate ? new Date(ai.nextActionDate).toLocaleDateString('fr-FR') : '';
                      return (
                        <span>
                          {ai.nextActionType && <span style={{color:A.text,fontWeight:500}}>{ai.nextActionType}</span>}
                          {dateStr && <span style={{color: isLate ? A.red : A.textDim,fontWeight: isLate ? 500 : 400}}> · {dateStr}{isLate ? ' (retard)' : ''}</span>}
                          {ai.nextActionActor && <span style={{color:A.textMuted}}> · {ai.nextActionActor}{ai.nextActionContact ? ' → ' + ai.nextActionContact : ''}</span>}
                        </span>
                      );
                    })() : (
                      <span style={{color:A.red}}>Aucune action planifiée</span>
                    )}
                  </div>

                  {/* Ligne 5 : montants */}
                  {(prospect.real_monthly_amount || prospect.monthly_amount) > 0 && (
                    <div style={{fontSize:'11px',marginTop:'4px',color:A.text,fontVariantNumeric:'tabular-nums',fontWeight:500}}>
                      {fmtK(parseFloat(prospect.real_monthly_amount || prospect.monthly_amount) || 0)}<span style={{color:A.textMuted,fontWeight:400}}> /mois</span>
                      {(prospect.real_annual_amount || prospect.annual_amount) > 0 && (
                        <span> + {fmtK(parseFloat(prospect.real_annual_amount || prospect.annual_amount) || 0)}<span style={{color:A.textMuted,fontWeight:400}}> /an</span></span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      );
    }

