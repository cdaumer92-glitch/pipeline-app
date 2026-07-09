import * as React from 'react';
import { prospectDisplayName } from '../lib/shared.jsx';

export function AttributionView({ prospects, users, user, API_URL, onClose, onUpdateProspect }) {
      const nonAttribues = prospects.filter(p => !p.assigned_to || p.assigned_to === '');
      const commerciaux = (users||[]).filter(u => !['Frédéric','Frederic'].includes(u.name));

      // State : map id -> commercial sélectionné
      const [selections, setSelections] = React.useState(() => {
        const m = {};
        nonAttribues.forEach(p => { m[p.id] = ''; });
        return m;
      });
      const [sending, setSending] = React.useState(false);
      const [result, setResult] = React.useState(null);

      const handleSelectAll = (commercialName) => {
        const m = {};
        nonAttribues.forEach(p => { m[p.id] = commercialName; });
        setSelections(m);
      };

      const handleSend = async () => {
        const toSend = nonAttribues.filter(p => selections[p.id]);
        if (toSend.length === 0) return;
        setSending(true);
        setResult(null);
        try {
          const attributions = toSend.map(p => ({ id: p.id, commercial_name: selections[p.id] }));
          const res = await fetch(`${API_URL}/attributions/bulk`, {
            method: 'PUT',
            headers: {'Content-Type':'application/json','Authorization':`Bearer ${user.token}`},
            body: JSON.stringify({ attributions })
          });
          if (!res.ok) throw new Error('Erreur serveur');
          toSend.forEach(p => onUpdateProspect({...p, assigned_to: selections[p.id]}));
          setResult({ ok: toSend.length, errors: [] });
        } catch(e) {
          setResult({ ok: 0, errors: toSend.map(p => p.name) });
        }
        setSending(false);
      };

      const nbSelectionnes = nonAttribues.filter(p => selections[p.id]).length;

      return (
        <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,.45)',zIndex:500,display:'flex',alignItems:'flex-start',justifyContent:'center',paddingTop:'60px'}}>
          <div style={{background:'white',borderRadius:'12px',width:'860px',maxWidth:'95vw',maxHeight:'85vh',display:'flex',flexDirection:'column',boxShadow:'0 8px 40px rgba(0,0,0,.18)',overflow:'hidden'}}>

            {/* Header */}
            <div style={{padding:'20px 24px',borderBottom:'1px solid var(--tw-border)',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
              <div>
                <div style={{fontSize:'17px',fontWeight:'700',color:'var(--tw-ink)'}}>🎯 Attribution des sociétés</div>
                <div style={{fontSize:'13px',color:'var(--tw-muted)',marginTop:'3px'}}>{nonAttribues.length} société{nonAttribues.length>1?'s':''} non attribuée{nonAttribues.length>1?'s':''}</div>
              </div>
              <button onClick={onClose} style={{background:'none',border:'none',fontSize:'20px',cursor:'pointer',color:'var(--tw-muted)',lineHeight:1}}>✕</button>
            </div>

            {/* Attribution en masse */}
            {nonAttribues.length > 0 && (
              <div style={{padding:'12px 24px',borderBottom:'1px solid var(--tw-border)',background:'var(--tw-bg)',display:'flex',alignItems:'center',gap:'10px',flexShrink:0,flexWrap:'wrap'}}>
                <span style={{fontSize:'12px',color:'var(--tw-muted)',fontWeight:'600',textTransform:'uppercase',letterSpacing:'.4px'}}>Attribuer tout à :</span>
                {commerciaux.map(c => (
                  <button key={c.id} onClick={() => handleSelectAll(c.name)}
                    style={{padding:'5px 14px',background:'var(--tw-teal-light)',color:'var(--tw-teal)',border:'1px solid var(--tw-border)',borderRadius:'20px',fontSize:'12px',fontWeight:'600',cursor:'pointer',fontFamily:"'Inter',sans-serif"}}>
                    {c.name}
                  </button>
                ))}
                <button onClick={() => handleSelectAll('')}
                  style={{padding:'5px 14px',background:'white',color:'var(--tw-muted)',border:'1px solid var(--tw-border)',borderRadius:'20px',fontSize:'12px',cursor:'pointer',fontFamily:"'Inter',sans-serif"}}>
                  Réinitialiser
                </button>
              </div>
            )}

            {/* Liste */}
            <div style={{flex:1,overflowY:'auto',padding:'0 24px'}}>
              {nonAttribues.length === 0 ? (
                <div style={{padding:'40px',textAlign:'center',color:'var(--tw-muted)',fontSize:'14px'}}>✅ Toutes les sociétés sont attribuées</div>
              ) : (
                <table style={{width:'100%',borderCollapse:'collapse'}}>
                  <thead>
                    <tr style={{borderBottom:'2px solid var(--tw-border)'}}>
                      <th style={{padding:'12px 8px',textAlign:'left',fontSize:'11px',fontWeight:'700',color:'var(--tw-muted)',textTransform:'uppercase',letterSpacing:'.4px'}}>Société</th>
                      <th style={{padding:'12px 8px',textAlign:'left',fontSize:'11px',fontWeight:'700',color:'var(--tw-muted)',textTransform:'uppercase',letterSpacing:'.4px'}}>Type</th>
                      <th style={{padding:'12px 8px',textAlign:'left',fontSize:'11px',fontWeight:'700',color:'var(--tw-muted)',textTransform:'uppercase',letterSpacing:'.4px'}}>Ville</th>
                      <th style={{padding:'12px 8px',textAlign:'left',fontSize:'11px',fontWeight:'700',color:'var(--tw-muted)',textTransform:'uppercase',letterSpacing:'.4px'}}>Commercial</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nonAttribues.map((p, idx) => (
                      <tr key={p.id} style={{borderBottom:'1px solid var(--tw-border)',background:idx%2===0?'white':'var(--tw-bg)'}}>
                        <td style={{padding:'10px 8px',fontSize:'13px',fontWeight:'600',color:'var(--tw-ink)'}}>
                          <div>{prospectDisplayName(p)}</div>
                          {(() => {
                            // Téléphone affiché sous le nom pour éviter d'attribuer une société "muette".
                            // Sociétés sans tél = orange + libellé explicite, pour les repérer d'un coup d'œil.
                            const tel = p.tel_standard || p.phone;
                            return tel
                              ? <div style={{fontSize:'12px',fontWeight:'500',color:'var(--tw-slate)',marginTop:'2px'}}>☎ {tel}</div>
                              : <div style={{fontSize:'11px',fontWeight:'600',color:'var(--tw-orange)',marginTop:'2px'}}>☎ pas de téléphone</div>;
                          })()}
                        </td>
                        <td style={{padding:'10px 8px'}}>
                          <span style={{fontSize:'11px',fontWeight:'600',padding:'2px 8px',borderRadius:'10px',
                            background:p.statut_societe==='Client'?'var(--tw-teal-light)':p.statut_societe==='Prospect'?'var(--warning-soft)':'var(--surface-hover)',
                            color:p.statut_societe==='Client'?'var(--tw-teal)':p.statut_societe==='Prospect'?'var(--warning)':'var(--meta)'}}>
                            {p.statut_societe||'Prospect'}
                          </span>
                        </td>
                        <td style={{padding:'10px 8px',fontSize:'13px',color:'var(--tw-slate)'}}>{p.ville||'—'}</td>
                        <td style={{padding:'10px 8px'}}>
                          <select value={selections[p.id]||''} onChange={e => setSelections(s => ({...s,[p.id]:e.target.value}))}
                            style={{padding:'5px 8px',border:'1px solid var(--tw-border)',borderRadius:'6px',fontSize:'12px',fontFamily:"'Inter',sans-serif",background:'white',minWidth:'130px',
                              borderColor:selections[p.id]?'var(--tw-teal)':'var(--tw-border)',
                              color:selections[p.id]?'var(--tw-teal)':'var(--tw-muted)'}}>
                            <option value="">— Choisir —</option>
                            {commerciaux.map(c => (
                              <option key={c.id} value={c.name}>{c.name}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer */}
            {nonAttribues.length > 0 && (
              <div style={{padding:'16px 24px',borderTop:'1px solid var(--tw-border)',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0,background:'white'}}>
                <div style={{fontSize:'13px',color:'var(--tw-muted)'}}>
                  {nbSelectionnes > 0
                    ? <span style={{color:'var(--tw-teal)',fontWeight:'600'}}>{nbSelectionnes} société{nbSelectionnes>1?'s':''} sélectionnée{nbSelectionnes>1?'s':''}</span>
                    : 'Aucune société sélectionnée'}
                </div>
                <div style={{display:'flex',gap:'10px',alignItems:'center'}}>
                  {result && (
                    <span style={{fontSize:'12px',fontWeight:'500',color:result.errors.length===0?'var(--tw-green)':'var(--tw-orange)'}}>
                      ✅ {result.ok} attribuée{result.ok>1?'s':''}
                      {result.errors.length>0 && ` · ⚠ ${result.errors.length} erreur(s)`}
                    </span>
                  )}
                  <button onClick={onClose} style={{padding:'8px 18px',background:'white',color:'var(--tw-slate)',border:'1px solid var(--tw-border)',borderRadius:'6px',fontSize:'13px',cursor:'pointer',fontFamily:"'Inter',sans-serif"}}>
                    Fermer
                  </button>
                  <button onClick={handleSend} disabled={sending || nbSelectionnes === 0}
                    style={{padding:'8px 20px',background:(sending||nbSelectionnes===0)?'#ccc':'var(--tw-teal)',color:'white',border:'none',borderRadius:'6px',fontSize:'13px',fontWeight:'600',cursor:(sending||nbSelectionnes===0)?'default':'pointer',fontFamily:"'Inter',sans-serif"}}>
                    {sending ? '⏳ Envoi...' : `🎯 Attribuer & envoyer les mails (${nbSelectionnes})`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }

